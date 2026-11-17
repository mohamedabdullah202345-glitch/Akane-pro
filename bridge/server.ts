import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  BridgeActivityItem,
  BridgeAllowedApp,
  BridgePendingApproval,
  BridgeSettings,
  BridgeTaintState,
} from '../src/types/akane.ts';
import {
  executeValidatedBridgeTool,
  killAllActiveProcesses,
  type BridgeNativeHooks,
} from './executor.ts';
import {
  DEFAULT_ALLOWED_APPS,
  TAINT_WINDOW_MS,
  evaluateBridgePolicy,
  isBlockedSensitivePath,
} from './policy.ts';

export const DEFAULT_BRIDGE_PORT = 4319;
const APPROVAL_TTL_MS = 120_000;

interface BridgeConfigFile {
  token: string;
  settings: BridgeSettings;
}

export interface BridgeServerOptions {
  port?: number;
  dataDir?: string;
  nativeHooks?: BridgeNativeHooks;
  onStateChange?: () => void;
  quiet?: boolean;
}

export interface BridgeServerInstance {
  port: number;
  token: string;
  logFilePath: string;
  configFilePath: string;
  triggerEmergencyStop: (reason?: string) => void;
  resumeFromEmergencyStop: () => void;
  getSnapshot: () => {
    emergencyStopped: boolean;
    pendingCount: number;
  };
  close: () => Promise<void>;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function loadOrCreateBridgeConfig(configPath: string): BridgeConfigFile {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<BridgeConfigFile>;
      if (parsed.token && typeof parsed.token === 'string' && parsed.token.length >= 24) {
        return {
          token: parsed.token,
          settings: {
            allowedFolders: Array.isArray(parsed.settings?.allowedFolders)
              ? parsed.settings!.allowedFolders
              : [path.join(os.homedir(), 'Documents')],
            allowedApps:
              Array.isArray(parsed.settings?.allowedApps) && parsed.settings!.allowedApps.length > 0
                ? parsed.settings!.allowedApps
                : DEFAULT_ALLOWED_APPS,
          },
        };
      }
    } catch {
      // Regenerate clean config if corrupted
    }
  }

  const fresh: BridgeConfigFile = {
    token: crypto.randomBytes(24).toString('hex'),
    settings: {
      allowedFolders: [path.join(os.homedir(), 'Documents')].filter((f) => fs.existsSync(f)),
      allowedApps: DEFAULT_ALLOWED_APPS,
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(fresh, null, 2), { encoding: 'utf8', mode: 0o600 });
  return fresh;
}

function saveBridgeConfig(configPath: string, config: BridgeConfigFile): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export async function startBridgeServer(
  opts: BridgeServerOptions = {}
): Promise<BridgeServerInstance> {
  const port = opts.port ?? Number(process.env.AKANE_BRIDGE_PORT || DEFAULT_BRIDGE_PORT);
  const dataDir =
    opts.dataDir ??
    process.env.AKANE_BRIDGE_DIR ??
    path.join(os.homedir(), '.akane-pro');
  const configFilePath = path.join(dataDir, 'bridge-config.json');
  const logFilePath = path.join(dataDir, 'bridge-audit.jsonl');

  const config = loadOrCreateBridgeConfig(configFilePath);
  let settings: BridgeSettings = config.settings;
  let emergencyStopped = false;
  let taintState: BridgeTaintState = {
    active: false,
    sourceLabel: '',
    recordedAt: null,
    expiresAt: null,
  };

  const pendingApprovals = new Map<
    string,
    {
      approval: BridgePendingApproval;
      sanitizedArgs: Record<string, unknown>;
    }
  >();
  let activities: BridgeActivityItem[] = [];

  const appendAuditLog = (item: BridgeActivityItem) => {
    activities = [item, ...activities].slice(0, 60);
    try {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      fs.appendFileSync(
        logFilePath,
        JSON.stringify({
          time: item.time,
          tool: item.tool,
          arguments: item.args,
          level: item.level,
          status: item.status,
          taintOrigin: item.taintOrigin ?? null,
          result: item.result ?? item.summary,
        }) + '\n',
        'utf8'
      );
    } catch {
      // Ignore write error only if filesystem read-only
    }
    opts.onStateChange?.();
  };

  const purgeExpiredApprovals = () => {
    const now = Date.now();
    for (const [id, entry] of pendingApprovals.entries()) {
      if (Date.parse(entry.approval.expiresAt) <= now) {
        pendingApprovals.delete(id);
        appendAuditLog({
          id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
          time: new Date(now).toISOString(),
          tool: entry.approval.tool,
          args: entry.approval.args,
          level: entry.approval.level,
          status: 'denied',
          summary: `Timed out awaiting OK: ${entry.approval.summary}`,
          result: 'Approval request expired after 120s.',
          taintOrigin: entry.approval.taintOrigin,
        });
      }
    }
  };

  const triggerEmergencyStop = (reason = 'Emergency hotkey pressed') => {
    emergencyStopped = true;
    const killedCount = killAllActiveProcesses();
    const cancelledPending = pendingApprovals.size;
    for (const [, entry] of pendingApprovals.entries()) {
      appendAuditLog({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toISOString(),
        tool: entry.approval.tool,
        args: entry.approval.args,
        level: entry.approval.level,
        status: 'emergency_stopped',
        summary: `Cancelled by Emergency Stop: ${entry.approval.summary}`,
        result: reason,
      });
    }
    pendingApprovals.clear();
    appendAuditLog({
      id: `act_${Date.now()}_estop`,
      time: new Date().toISOString(),
      tool: 'emergency_stop',
      args: { reason, killedCount, cancelledPending },
      level: 'A',
      status: 'emergency_stopped',
      summary: `Emergency Stop (${cancelledPending} pending cancelled, ${killedCount} stopped)`,
      result: reason,
    });
  };

  const resumeFromEmergencyStop = () => {
    emergencyStopped = false;
    appendAuditLog({
      id: `act_${Date.now()}_resume`,
      time: new Date().toISOString(),
      tool: 'bridge_resume',
      args: {},
      level: 'A',
      status: 'executed',
      summary: 'Bridge resumed by user',
      result: 'ok',
    });
  };

  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // Localhost + token CORS + Private Network Access preflight
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Akane-Bridge-Token'
    );
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      emergencyStopped,
      version: '1.0.0',
      localhostOnly: true,
    });
  });

  // All state & execution routes require exact bridge token
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const customHeader = String(req.headers['x-akane-bridge-token'] || '').trim();
    const supplied = bearer || customHeader;
    if (!constantTimeEquals(supplied, config.token)) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing bridge token.' });
      return;
    }
    next();
  });

  app.get('/state', (_req, res) => {
    purgeExpiredApprovals();
    res.json({
      ok: true,
      emergencyStopped,
      taintState,
      settings,
      pendingApprovals: Array.from(pendingApprovals.values()).map((p) => p.approval),
      activities,
    });
  });

  app.post('/settings', (req, res) => {
    const body = (req.body || {}) as {
      allowedFolders?: unknown;
      allowedApps?: unknown;
    };

    let nextFolders = settings.allowedFolders;
    if (Array.isArray(body.allowedFolders)) {
      const cleaned: string[] = [];
      for (const raw of body.allowedFolders) {
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const resolved = path.resolve(raw.trim());
        if (isBlockedSensitivePath(resolved)) {
          res.status(403).json({
            error: `Cannot add sensitive or OS folder "${raw}" to allowedFolders.`,
          });
          return;
        }
        if (!cleaned.includes(resolved)) cleaned.push(resolved);
      }
      nextFolders = cleaned;
    }

    let nextApps = settings.allowedApps;
    if (Array.isArray(body.allowedApps)) {
      const validatedApps: BridgeAllowedApp[] = [];
      for (const rawApp of body.allowedApps) {
        if (!rawApp || typeof rawApp !== 'object') continue;
        const entry = rawApp as Partial<BridgeAllowedApp>;
        const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
        const label = typeof entry.label === 'string' ? entry.label.trim() : '';
        const command = typeof entry.command === 'string' ? entry.command.trim() : '';
        if (!id || !label || !command) continue;
        if (/[;&|`$<>]/.test(command)) continue;
        validatedApps.push({
          id,
          label,
          command,
          args: Array.isArray(entry.args)
            ? entry.args.filter((a): a is string => typeof a === 'string')
            : [],
        });
      }
      nextApps = validatedApps;
    }

    settings = { allowedFolders: nextFolders, allowedApps: nextApps };
    saveBridgeConfig(configFilePath, { token: config.token, settings });
    opts.onStateChange?.();
    res.json({ ok: true, settings });
  });

  app.post('/emergency-stop', (req, res) => {
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Emergency stop triggered';
    triggerEmergencyStop(reason);
    res.json({ ok: true, emergencyStopped: true });
  });

  app.post('/resume', (_req, res) => {
    resumeFromEmergencyStop();
    res.json({ ok: true, emergencyStopped: false });
  });

  app.post('/tool', async (req, res) => {
    purgeExpiredApprovals();
    const now = Date.now();
    const body = (req.body || {}) as {
      tool?: unknown;
      args?: unknown;
    };
    const rawTool = typeof body.tool === 'string' ? body.tool : '';
    const rawArgs =
      body.args && typeof body.args === 'object' && !Array.isArray(body.args)
        ? (body.args as Record<string, unknown>)
        : {};

    if (emergencyStopped) {
      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: rawTool || 'unknown',
        args: rawArgs,
        level: 'C',
        status: 'emergency_stopped',
        summary: `Stopped: Emergency Stop is active (${rawTool})`,
        result: 'Emergency Stop active; press Resume before running tools.',
      };
      appendAuditLog(item);
      res.status(423).json({
        status: 'emergency_stopped',
        error: item.result,
        activity: item,
      });
      return;
    }

    const evaluation = evaluateBridgePolicy(rawTool, rawArgs, settings, taintState, now);

    if (!evaluation.allowed || evaluation.level === 'C') {
      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: rawTool || 'unknown',
        args: rawArgs,
        level: 'C',
        status: 'blocked',
        summary: evaluation.summary,
        result: evaluation.blockReason || 'Blocked by Level C security policy.',
      };
      appendAuditLog(item);
      res.status(403).json({
        status: 'blocked',
        level: 'C',
        error: item.result,
        activity: item,
      });
      return;
    }

    if (evaluation.requiresConfirmation) {
      const approvalId = `apr_${now}_${crypto.randomBytes(3).toString('hex')}`;
      const approval: BridgePendingApproval = {
        id: approvalId,
        tool: rawTool,
        args: evaluation.sanitizedArgs,
        summary: evaluation.summary,
        level: evaluation.level,
        escalatedFromTaint: evaluation.escalatedFromTaint,
        taintOrigin: evaluation.taintOrigin,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(),
      };
      pendingApprovals.set(approvalId, {
        approval,
        sanitizedArgs: evaluation.sanitizedArgs,
      });
      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: rawTool,
        args: evaluation.sanitizedArgs,
        level: evaluation.level,
        status: 'pending_approval',
        summary: `Needs OK: ${evaluation.summary}`,
        taintOrigin: evaluation.taintOrigin,
      };
      appendAuditLog(item);
      res.status(202).json({
        status: 'pending_approval',
        level: evaluation.level,
        approval,
        activity: item,
      });
      return;
    }

    try {
      const execRes = await executeValidatedBridgeTool(
        rawTool,
        evaluation.sanitizedArgs,
        settings,
        opts.nativeHooks
      );

      if (execRes.externalContentSource) {
        const taintNow = Date.now();
        taintState = {
          active: true,
          sourceLabel: execRes.externalContentSource,
          recordedAt: new Date(taintNow).toISOString(),
          expiresAt: new Date(taintNow + TAINT_WINDOW_MS).toISOString(),
        };
      }

      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: rawTool,
        args: evaluation.sanitizedArgs,
        level: 'A',
        status: 'executed',
        summary: execRes.summary,
        result: JSON.stringify(execRes.data).slice(0, 600),
        ...(evaluation.taintOrigin ? { taintOrigin: evaluation.taintOrigin } : {}),
      };
      appendAuditLog(item);
      res.json({
        status: 'executed',
        level: 'A',
        summary: execRes.summary,
        data: execRes.data,
        activity: item,
        taintState,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Execution failed.';
      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: rawTool,
        args: evaluation.sanitizedArgs,
        level: 'A',
        status: 'error',
        summary: `Failed: ${evaluation.summary}`,
        result: message,
      };
      appendAuditLog(item);
      res.status(500).json({
        status: 'error',
        error: message,
        activity: item,
      });
    }
  });

  app.post('/approve/:id', async (req, res) => {
    purgeExpiredApprovals();
    const id = req.params.id;
    const entry = pendingApprovals.get(id);
    if (!entry) {
      res.status(404).json({ error: 'Approval request not found or expired.' });
      return;
    }

    if (emergencyStopped) {
      pendingApprovals.delete(id);
      res.status(423).json({ error: 'Emergency Stop active; cannot approve.' });
      return;
    }

    pendingApprovals.delete(id);
    const now = Date.now();
    try {
      const execRes = await executeValidatedBridgeTool(
        entry.approval.tool,
        entry.sanitizedArgs,
        settings,
        opts.nativeHooks
      );
      if (execRes.externalContentSource) {
        taintState = {
          active: true,
          sourceLabel: execRes.externalContentSource,
          recordedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + TAINT_WINDOW_MS).toISOString(),
        };
      }
      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: entry.approval.tool,
        args: entry.approval.args,
        level: entry.approval.level,
        status: 'approved',
        summary: `Approved: ${execRes.summary}`,
        result: JSON.stringify(execRes.data).slice(0, 600),
        taintOrigin: entry.approval.taintOrigin,
      };
      appendAuditLog(item);
      res.json({
        status: 'approved',
        summary: execRes.summary,
        data: execRes.data,
        activity: item,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approved execution failed.';
      const item: BridgeActivityItem = {
        id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
        time: new Date(now).toISOString(),
        tool: entry.approval.tool,
        args: entry.approval.args,
        level: entry.approval.level,
        status: 'error',
        summary: `Approved action failed: ${entry.approval.summary}`,
        result: message,
        taintOrigin: entry.approval.taintOrigin,
      };
      appendAuditLog(item);
      res.status(500).json({ status: 'error', error: message, activity: item });
    }
  });

  app.post('/deny/:id', (req, res) => {
    const id = req.params.id;
    const entry = pendingApprovals.get(id);
    if (!entry) {
      res.status(404).json({ error: 'Approval request not found or already handled.' });
      return;
    }
    pendingApprovals.delete(id);
    const now = Date.now();
    const item: BridgeActivityItem = {
      id: `act_${now}_${Math.random().toString(36).slice(2, 6)}`,
      time: new Date(now).toISOString(),
      tool: entry.approval.tool,
      args: entry.approval.args,
      level: entry.approval.level,
      status: 'denied',
      summary: `Denied: ${entry.approval.summary}`,
      result: 'Denied by user — not executed.',
      taintOrigin: entry.approval.taintOrigin,
    };
    appendAuditLog(item);
    res.json({ status: 'denied', activity: item });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Security rule: bind strictly to 127.0.0.1 (localhost only)
    server.listen(port, '127.0.0.1', () => {
      resolve();
    });
  });

  const boundAddr = server.address();
  const actualPort =
    boundAddr && typeof boundAddr === 'object' ? boundAddr.port : port;

  if (!opts.quiet) {
    console.log(`[Akane Bridge] Listening on http://127.0.0.1:${actualPort} (localhost only)`);
    console.log(`[Akane Bridge] Audit log: ${logFilePath}`);
    console.log(`[Akane Bridge] Pairing Token: ${config.token}`);
  }

  return {
    port: actualPort,
    token: config.token,
    logFilePath,
    configFilePath,
    triggerEmergencyStop,
    resumeFromEmergencyStop,
    getSnapshot: () => ({
      emergencyStopped,
      pendingCount: pendingApprovals.size,
    }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

// Allow standalone CLI execution: `npx tsx bridge/server.ts`
const isMainModule =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  void startBridgeServer().catch((err) => {
    console.error('[Akane Bridge] Fatal error:', err);
    process.exit(1);
  });
}
