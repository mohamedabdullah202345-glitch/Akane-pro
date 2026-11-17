import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  BridgeAllowedApp,
  BridgeSecurityLevel,
  BridgeSettings,
  BridgeTaintState,
} from '../src/types/akane.ts';

export const TAINT_WINDOW_MS = 90_000;

export const DEFAULT_ALLOWED_APPS: BridgeAllowedApp[] = [
  {
    id: 'calculator',
    label: 'Calculator',
    command:
      process.platform === 'win32'
        ? 'calc.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'gnome-calculator',
    args: process.platform === 'darwin' ? ['-a', 'Calculator'] : [],
  },
  {
    id: 'notepad',
    label: 'Notepad / Text Editor',
    command:
      process.platform === 'win32'
        ? 'notepad.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'gedit',
    args: process.platform === 'darwin' ? ['-a', 'TextEdit'] : [],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    command: process.platform === 'win32' ? 'code.cmd' : 'code',
    args: [],
  },
  {
    id: 'explorer',
    label: 'File Explorer',
    command:
      process.platform === 'win32'
        ? 'explorer.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open',
    args: process.platform === 'win32' ? [] : ['.'],
  },
  {
    id: 'spotify',
    label: 'Spotify',
    command:
      process.platform === 'win32'
        ? 'spotify.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'spotify',
    args: process.platform === 'darwin' ? ['-a', 'Spotify'] : [],
  },
];

// Sensitive key files, credentials, SSH keys, browser profiles, and OS system directories (Level C)
const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env($|\.)/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.gnupg([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])\.kube([\\/]|$)/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.netrc$/i,
  /(^|[\\/])\.git-credentials$/i,
  /(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|kdbx)$/i,
  /(^|[\\/])(cookies|login data|web data|local state|key4\.db|logins\.json)$/i,
  /(^|[\\/])(google[\\/]chrome[\\/]user data|\.config[\\/]google-chrome|\.mozilla[\\/]firefox|microsoft[\\/]edge[\\/]user data|brave-browser)([\\/]|$)/i,
  /(^|[\\/])(credentials|service-account|firebase-adminsdk).*\.json$/i,
];

const BLOCKED_SYSTEM_ROOTS: string[] =
  process.platform === 'win32'
    ? ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata']
    : ['/etc', '/System', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/var', '/boot', '/root'];

const BLOCKED_TOOL_NAMES = new Set([
  'shell',
  'exec',
  'bash',
  'cmd',
  'powershell',
  'run_shell',
  'delete_permanent',
  'rm_rf',
  'unlink',
  'system_change',
  'registry_edit',
  'sudo',
]);

const LEVEL_A_TOOLS = new Set([
  'open_url',
  'web_search',
  'read_webpage',
  'open_app',
  'media_control',
  'list_files',
  'search_files',
  'read_file',
  'read_clipboard',
  'take_screenshot',
]);

const LEVEL_B_TOOLS = new Set([
  'create_file',
  'edit_file',
  'move_file',
  'trash_file',
  'run_script',
  'send_message',
  'install_app',
  'account_action',
]);

const READ_ONLY_TAINT_EXEMPT_TOOLS = new Set([
  'list_files',
  'search_files',
  'read_file',
  'read_clipboard',
  'take_screenshot',
]);

const SHELL_METACHARS = /[;&|`$<>!{}]/;

export interface PolicyEvaluation {
  allowed: boolean;
  level: BridgeSecurityLevel;
  requiresConfirmation: boolean;
  escalatedFromTaint: boolean;
  taintOrigin?: string;
  blockReason?: string;
  summary: string;
  sanitizedArgs: Record<string, unknown>;
}

export function isBlockedSensitivePath(targetPath: string): string | null {
  const normalized = path.resolve(targetPath);
  const forward = normalized.replace(/\\/g, '/');

  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(forward)) {
      return 'Blocked sensitive key, credential, or browser profile path (Level C).';
    }
  }

  const lower = normalized.toLowerCase();
  for (const sysRoot of BLOCKED_SYSTEM_ROOTS) {
    const sysLower = sysRoot.toLowerCase();
    if (lower === sysLower || lower.startsWith(sysLower + path.sep)) {
      return 'Blocked operating system directory (Level C).';
    }
  }

  return null;
}

export function resolvePathInsideAllowedFolders(
  rawPath: string,
  allowedFolders: string[]
): { ok: true; resolved: string; isExisting: boolean } | { ok: false; error: string } {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, error: 'A valid file or folder path is required.' };
  }

  const trimmed = rawPath.trim();
  if (trimmed.includes('\0')) {
    return { ok: false, error: 'Invalid null byte in path.' };
  }

  if (!allowedFolders || allowedFolders.length === 0) {
    return {
      ok: false,
      error: 'No allowed folders configured. Add an allowed folder in Desktop Bridge Settings first.',
    };
  }

  // Expand ~ to user home directory safely
  const expanded = trimmed.startsWith('~/') || trimmed === '~'
    ? path.join(os.homedir(), trimmed.slice(1))
    : trimmed;

  const candidate = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(allowedFolders[0], expanded);

  const blocked = isBlockedSensitivePath(candidate);
  if (blocked) {
    return { ok: false, error: blocked };
  }

  // Prevent symlink escape by checking realpath where path (or nearest parent) exists
  let canonicalTarget = candidate;
  const isExisting = fs.existsSync(candidate);
  try {
    if (isExisting) {
      canonicalTarget = fs.realpathSync(candidate);
    } else {
      const parentDir = path.dirname(candidate);
      if (fs.existsSync(parentDir)) {
        canonicalTarget = path.join(fs.realpathSync(parentDir), path.basename(candidate));
      }
    }
  } catch {
    return { ok: false, error: 'Unable to resolve target path safely.' };
  }

  const canonicalBlocked = isBlockedSensitivePath(canonicalTarget);
  if (canonicalBlocked) {
    return { ok: false, error: canonicalBlocked };
  }

  for (const folder of allowedFolders) {
    try {
      const folderResolved = fs.existsSync(folder)
        ? fs.realpathSync(folder)
        : path.resolve(folder);
      if (
        canonicalTarget === folderResolved ||
        canonicalTarget.startsWith(folderResolved + path.sep)
      ) {
        return { ok: true, resolved: canonicalTarget, isExisting };
      }
    } catch {
      // Skip unreadable folder entry
    }
  }

  return {
    ok: false,
    error: `Access outside allowed folders is blocked (${path.basename(candidate)}). Add its parent folder in Settings.`,
  };
}

export function validateSafeHttpUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; error: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'URL is required.' };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048 || /[\r\n\0]/.test(trimmed)) {
    return { ok: false, error: 'Malformed URL.' };
  }
  try {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (!isHttps && !isLocalHttp) {
      return { ok: false, error: 'Only https:// or http://localhost URLs are permitted.' };
    }
    return { ok: true, url: parsed };
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }
}

export function isTaintCurrentlyActive(taint: BridgeTaintState, now = Date.now()): boolean {
  if (!taint.active || !taint.expiresAt) return false;
  return Date.parse(taint.expiresAt) > now;
}

export function evaluateBridgePolicy(
  rawTool: string,
  rawArgs: Record<string, unknown>,
  settings: BridgeSettings,
  taintState: BridgeTaintState,
  now = Date.now()
): PolicyEvaluation {
  const tool = (rawTool || '').trim().toLowerCase();
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

  // Level C hard blocks
  if (!tool || BLOCKED_TOOL_NAMES.has(tool)) {
    return {
      allowed: false,
      level: 'C',
      requiresConfirmation: false,
      escalatedFromTaint: false,
      blockReason: `Tool "${tool || 'unknown'}" is Level C and blocked completely (no free shell commands, permanent delete, or system edits).`,
      summary: `Blocked Level C action: ${tool || 'unknown'}`,
      sanitizedArgs: {},
    };
  }

  if (args.permanent === true || args.force === true || args.shell === true) {
    return {
      allowed: false,
      level: 'C',
      requiresConfirmation: false,
      escalatedFromTaint: false,
      blockReason: 'Permanent delete / forced shell flags are strictly Level C and blocked.',
      summary: `Blocked dangerous flag on ${tool}`,
      sanitizedArgs: {},
    };
  }

  if (!LEVEL_A_TOOLS.has(tool) && !LEVEL_B_TOOLS.has(tool)) {
    return {
      allowed: false,
      level: 'C',
      requiresConfirmation: false,
      escalatedFromTaint: false,
      blockReason: `Unrecognized desktop tool "${tool}" is blocked by default.`,
      summary: `Blocked unknown tool: ${tool}`,
      sanitizedArgs: {},
    };
  }

  let baseLevel: BridgeSecurityLevel = LEVEL_B_TOOLS.has(tool) ? 'B' : 'A';
  let summary = tool;
  let sanitizedArgs: Record<string, unknown> = {};

  switch (tool) {
    case 'open_url':
    case 'read_webpage': {
      const check = validateSafeHttpUrl(String(args.url || ''));
      if (!check.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: check.error,
          summary: `Blocked invalid URL on ${tool}`,
          sanitizedArgs: {},
        };
      }
      if (tool === 'read_webpage') {
        const host = check.url.hostname.toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '::1' ||
          host.startsWith('169.254.') ||
          host.startsWith('10.') ||
          host.startsWith('192.168.')
        ) {
          return {
            allowed: false,
            level: 'C',
            requiresConfirmation: false,
            escalatedFromTaint: false,
            blockReason: 'Fetching private/internal network addresses is blocked.',
            summary: `Blocked internal read_webpage (${host})`,
            sanitizedArgs: {},
          };
        }
      }
      sanitizedArgs = { url: check.url.toString() };
      summary =
        tool === 'open_url'
          ? `Open ${check.url.hostname}`
          : `Read webpage ${check.url.hostname}`;
      break;
    }

    case 'web_search': {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query || query.length > 250 || /[\r\n\0]/.test(query)) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Invalid or empty search query.',
          summary: 'Blocked invalid search query',
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { query };
      summary = `Search web: "${query}"`;
      break;
    }

    case 'open_app': {
      const appQuery = typeof args.appName === 'string' ? args.appName.trim().toLowerCase() : '';
      const matched = settings.allowedApps.find(
        (a) =>
          a.id.toLowerCase() === appQuery ||
          a.label.toLowerCase() === appQuery ||
          a.label.toLowerCase().includes(appQuery)
      );
      if (!appQuery || !matched) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: `App "${args.appName || ''}" is not in your Installed Apps Allowlist (Settings).`,
          summary: `Blocked unallowlisted app: ${String(args.appName || 'unknown')}`,
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { appId: matched.id, label: matched.label };
      summary = `Open ${matched.label}`;
      break;
    }

    case 'media_control': {
      const allowedMedia = new Set([
        'volume_up',
        'volume_down',
        'mute',
        'play_pause',
        'next',
        'prev',
      ]);
      const action = typeof args.action === 'string' ? args.action.trim().toLowerCase() : '';
      if (!allowedMedia.has(action)) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: `Invalid media control action "${action}".`,
          summary: `Blocked invalid media action`,
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { action };
      summary = `Media control: ${action.replace('_', ' ')}`;
      break;
    }

    case 'list_files':
    case 'search_files':
    case 'read_file': {
      const rawPath =
        typeof args.path === 'string' && args.path.trim()
          ? args.path.trim()
          : settings.allowedFolders[0] || '';
      const check = resolvePathInsideAllowedFolders(rawPath, settings.allowedFolders);
      if (!check.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: check.error,
          summary: `Blocked file access: ${path.basename(rawPath || 'folder')}`,
          sanitizedArgs: {},
        };
      }
      const query =
        typeof args.query === 'string' ? args.query.trim().slice(0, 120) : '';
      if (tool === 'search_files' && !query) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Search query is required for search_files.',
          summary: 'Blocked empty file search',
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = {
        path: check.resolved,
        ...(query ? { query } : {}),
      };
      summary =
        tool === 'list_files'
          ? `List files in ${path.basename(check.resolved) || check.resolved}`
          : tool === 'search_files'
            ? `Search "${query}" in ${path.basename(check.resolved) || check.resolved}`
            : `Read file ${path.basename(check.resolved)}`;
      break;
    }

    case 'read_clipboard':
    case 'take_screenshot': {
      sanitizedArgs = {};
      summary = tool === 'read_clipboard' ? 'Read clipboard text' : 'Take desktop screenshot';
      break;
    }

    case 'create_file':
    case 'edit_file': {
      const check = resolvePathInsideAllowedFolders(
        String(args.path || ''),
        settings.allowedFolders
      );
      if (!check.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: check.error,
          summary: `Blocked file write outside allowed folders`,
          sanitizedArgs: {},
        };
      }
      const content = typeof args.content === 'string' ? args.content : '';
      if (content.length > 250_000) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'File content exceeds 250KB safety limit.',
          summary: `Blocked oversized file write`,
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { path: check.resolved, content };
      summary = `${tool === 'create_file' ? 'Create' : 'Edit'} file ${path.basename(check.resolved)}`;
      break;
    }

    case 'move_file': {
      const srcCheck = resolvePathInsideAllowedFolders(
        String(args.path || ''),
        settings.allowedFolders
      );
      if (!srcCheck.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: srcCheck.error,
          summary: 'Blocked move_file source path',
          sanitizedArgs: {},
        };
      }
      const dstCheck = resolvePathInsideAllowedFolders(
        String(args.destinationPath || ''),
        settings.allowedFolders
      );
      if (!dstCheck.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: dstCheck.error,
          summary: 'Blocked move_file destination path',
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { path: srcCheck.resolved, destinationPath: dstCheck.resolved };
      summary = `Move ${path.basename(srcCheck.resolved)} → ${path.basename(dstCheck.resolved)}`;
      break;
    }

    case 'trash_file': {
      const check = resolvePathInsideAllowedFolders(
        String(args.path || ''),
        settings.allowedFolders
      );
      if (!check.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: check.error,
          summary: 'Blocked trash_file outside allowed folders',
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { path: check.resolved };
      summary = `Move ${path.basename(check.resolved)} to Trash`;
      break;
    }

    case 'run_script': {
      const check = resolvePathInsideAllowedFolders(
        String(args.path || args.target || ''),
        settings.allowedFolders
      );
      if (!check.ok) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: check.error,
          summary: 'Blocked script path outside allowed folders',
          sanitizedArgs: {},
        };
      }
      const ext = path.extname(check.resolved).toLowerCase();
      if (!['.py', '.js', '.mjs', '.ps1', '.sh'].includes(ext)) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Only existing .py, .js, .mjs, .ps1, or .sh script files are allowed.',
          summary: `Blocked unsupported script type (${ext || 'none'})`,
          sanitizedArgs: {},
        };
      }
      if (!check.isExisting) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Target script file does not exist.',
          summary: `Missing script ${path.basename(check.resolved)}`,
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { path: check.resolved };
      summary = `Run script ${path.basename(check.resolved)}`;
      break;
    }

    case 'send_message': {
      const target = typeof args.target === 'string' ? args.target.trim() : '';
      const details = typeof args.details === 'string' ? args.details.trim() : '';
      if (!target || !details || SHELL_METACHARS.test(target) || target.length > 160) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Valid recipient/target and message text are required.',
          summary: 'Blocked invalid send_message args',
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { target, details: details.slice(0, 1000) };
      summary = `Send message to ${target}`;
      break;
    }

    case 'install_app': {
      const pkg = typeof args.target === 'string' ? args.target.trim() : '';
      if (!pkg || !/^[a-zA-Z0-9@/._-]{1,100}$/.test(pkg) || pkg.startsWith('-')) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Invalid package identifier for install_app.',
          summary: `Blocked unsafe install target`,
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { target: pkg, details: String(args.details || '').slice(0, 200) };
      summary = `Install package/app: ${pkg}`;
      break;
    }

    case 'account_action': {
      const target = typeof args.target === 'string' ? args.target.trim() : '';
      const details = typeof args.details === 'string' ? args.details.trim() : '';
      if (!target || !details) {
        return {
          allowed: false,
          level: 'C',
          requiresConfirmation: false,
          escalatedFromTaint: false,
          blockReason: 'Account or money action requires clear target and details.',
          summary: 'Blocked ambiguous account action',
          sanitizedArgs: {},
        };
      }
      sanitizedArgs = { target: target.slice(0, 120), details: details.slice(0, 400) };
      summary = `Account/payment action: ${target}`;
      break;
    }
  }

  // Prompt-injection guard: any action arriving right after external content was read
  // requires elevated confirmation & shows provenance.
  const tainted = isTaintCurrentlyActive(taintState, now);
  const escalateForTaint = tainted && !READ_ONLY_TAINT_EXEMPT_TOOLS.has(tool);
  if (escalateForTaint && baseLevel === 'A') {
    baseLevel = 'B';
  }

  return {
    allowed: true,
    level: baseLevel,
    requiresConfirmation: baseLevel === 'B',
    escalatedFromTaint: escalateForTaint,
    ...(tainted ? { taintOrigin: taintState.sourceLabel } : {}),
    summary,
    sanitizedArgs,
  };
}
