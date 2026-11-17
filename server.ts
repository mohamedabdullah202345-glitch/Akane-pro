import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { initializeApp as initializeAdminApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import {
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import {
  buildAkaneSystemInstruction,
  EMOTION_SET_KEYS,
  extractUsedNicknames,
} from './src/config/akanePersona.ts';
import type {
  CompanionMode,
  MemoryStore,
  MemoryV2Item,
  MissionItem,
} from './src/types/akane.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function loadFirebaseProjectId(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    if (parsed.projectId) return parsed.projectId;
  } catch {
    // Fallback to env if file missing
  }
  return process.env.GOOGLE_CLOUD_PROJECT || 'fleet-sprite-zxq1s';
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();
const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeAdminApp({ projectId: FIREBASE_PROJECT_ID });
const adminAuth = getAdminAuth(adminApp);

async function verifyFirebaseToken(token: string | undefined): Promise<{
  uid: string;
  email?: string;
} | null> {
  const cleaned = (token || '').trim();
  // Allow seamless local guest session if unauthenticated or in dev
  if (!cleaned || cleaned === 'guest_local_user') {
    return { uid: 'guest_local_user', email: 'guest@local.dev' };
  }
  try {
    const decoded = await adminAuth.verifyIdToken(cleaned);
    if (!decoded.uid) return { uid: 'guest_local_user', email: 'guest@local.dev' };
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
  } catch {
    // Graceful fallback for local development without active service-account
    return { uid: 'guest_local_user', email: 'guest@local.dev' };
  }
}

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) return '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getApiKey(): string {
  return (process.env.GEMINI_API_KEY || '').trim();
}

function createGenAIClient(apiVersion?: string): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Unified Stage 2 tool declarations shared identically across /live and /api/chat
const AKANE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'emotion_set',
    description:
      'Trigger a matching Akane reaction or gesture clip while talking. CALL ONLY on genuinely emotional moments (greetings, farewells, cheers, pride, teasing, affection, sadness, comfort, scolding, surprise, sleepiness). DO NOT call on routine neutral turns. Say a short in-character line immediately if slow.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: {
          type: Type.STRING,
          enum: [...EMOTION_SET_KEYS],
          description:
            'Target clip key: greet/goodbye, happy/cheer/giggle, comfort/sad/worried, proud/blush/tease, scold/annoyed/pout, surprised/curious/think, sleepy/hug/wait/nod_yes/shake_no.',
        },
        reason: {
          type: Type.STRING,
          description: 'Brief reason this emotion fits the moment.',
        },
      },
      required: ['emotion'],
    },
  },
  {
    name: 'remember',
    description:
      'Save a durable personal fact, preference, upcoming event ("exam Thursday"), or unresolved open loop into long-term Memory v2. CALL ONLY when new durable info or plans are shared. DO NOT call for casual greetings or filler chat.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          enum: ['fact', 'preference', 'event', 'open_loop'],
          description: 'Memory v2 category.',
        },
        content: {
          type: Type.STRING,
          description: 'Concise factual note to remember.',
        },
        dueAt: {
          type: Type.STRING,
          description: 'Optional date/day label for events (e.g. "Thursday 9 AM").',
        },
        importance: {
          type: Type.INTEGER,
          description: 'Importance score from 1 (low) to 10 (critical).',
        },
      },
      required: ['kind', 'content'],
    },
  },
  {
    name: 'add_task',
    description:
      'Add a new task or mission to the user\'s list. CALL ONLY when the user explicitly asks to add or track a task, study item, or mission. DO NOT invent tasks unprompted.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Short clear task title.',
        },
        description: {
          type: Type.STRING,
          description: 'Optional extra note.',
        },
        priority: {
          type: Type.STRING,
          enum: ['low', 'medium', 'high'],
          description: 'Task priority.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_tasks',
    description:
      'Fetch the user\'s current tasks/missions list. CALL ONLY when the user asks what tasks or missions are pending or completed. DO NOT call on unrelated turns.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          enum: ['pending', 'completed', 'all'],
          description: 'Filter by task completion status.',
        },
      },
    },
  },
  {
    name: 'open_url',
    description:
      'Open a safe HTTPS URL on the user\'s desktop browser (or show a clickable link card if no desktop bridge). CALL ONLY when the user explicitly asks to open a site or link.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'Full https:// URL requested by the user.',
        },
        label: {
          type: Type.STRING,
          description: 'Short human label for the link button.',
        },
      },
      required: ['url', 'label'],
    },
  },
  {
    name: 'desktop_open_app',
    description:
      'Open an application from the user\'s installed-apps allowlist via Desktop Bridge (Level A). CALL ONLY when user asks to open an app.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: {
          type: Type.STRING,
          description: 'App name or allowlist id (e.g. calculator, notepad, vscode, explorer, spotify).',
        },
      },
      required: ['appName'],
    },
  },
  {
    name: 'desktop_web_search',
    description:
      'Run a web search in the user\'s desktop browser via Desktop Bridge (Level A). CALL ONLY when user asks to search the web.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query string.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'desktop_media_control',
    description:
      'Control desktop audio volume or media playback via Desktop Bridge (Level A). CALL ONLY when user asks to change volume, mute, pause/play, or skip tracks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['volume_up', 'volume_down', 'mute', 'play_pause', 'next', 'prev'],
          description: 'Media action.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'desktop_files_read',
    description:
      'List, search, or read files strictly inside the user\'s allowed folders via Desktop Bridge (Level A). Never accesses .env, SSH keys, or browser profiles.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['list', 'search', 'read'],
          description: 'Read-only file operation.',
        },
        path: {
          type: Type.STRING,
          description: 'Folder or file path inside allowed folders (optional for default allowed folder).',
        },
        query: {
          type: Type.STRING,
          description: 'Filename search term when action is search.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'desktop_clipboard_screenshot',
    description:
      'Read system clipboard text, take a desktop screenshot, or read text from a public https webpage via Desktop Bridge (Level A). CALL ONLY when user asks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['read_clipboard', 'take_screenshot', 'read_webpage'],
          description: 'Capture/read action.',
        },
        url: {
          type: Type.STRING,
          description: 'Public https:// URL when action is read_webpage.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'desktop_files_write',
    description:
      'Create, edit, move, or move-to-trash files inside allowed folders (Level B — pauses until user confirms on screen or says "yes"). Never permanently deletes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['create', 'edit', 'move', 'trash'],
          description: 'File modification action (trash moves to Recycle Bin/Trash).',
        },
        path: {
          type: Type.STRING,
          description: 'Target file path inside allowed folders.',
        },
        content: {
          type: Type.STRING,
          description: 'Text content for create or edit.',
        },
        destinationPath: {
          type: Type.STRING,
          description: 'Destination path when action is move.',
        },
      },
      required: ['action', 'path'],
    },
  },
  {
    name: 'desktop_sensitive_action',
    description:
      'Run a script inside allowed folders, send a message, install a package, or handle an account/payment request (Level B — always asks user Allow/Deny confirmation first).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['run_script', 'send_message', 'install_app', 'account_action'],
          description: 'Level B sensitive desktop action.',
        },
        target: {
          type: Type.STRING,
          description: 'Script path, recipient, package name, or account action target.',
        },
        details: {
          type: Type.STRING,
          description: 'Message text or clear description shown in confirmation card.',
        },
      },
      required: ['action', 'target'],
    },
  },
];

const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const DEFAULT_CHAT_MODEL = 'gemini-3.1-flash-lite';

function sanitizeGeminiModelName(raw?: string): string | null {
  const cleaned = (raw || '').trim().replace(/^models\//i, '');
  if (!cleaned || !/^gemini-[a-z0-9._-]+$/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function getLiveModelCandidates(): string[] {
  const configured = sanitizeGeminiModelName(process.env.GEMINI_LIVE_MODEL);
  const base = [
    configured || DEFAULT_LIVE_MODEL,
    DEFAULT_LIVE_MODEL,
    'gemini-2.5-flash-native-audio-preview-12-2025',
  ];
  return Array.from(new Set(base.filter(Boolean)));
}

function getChatModelCandidates(): string[] {
  const configured = sanitizeGeminiModelName(process.env.GEMINI_CHAT_MODEL);
  return Array.from(
    new Set(
      [
        configured || DEFAULT_CHAT_MODEL,
        DEFAULT_CHAT_MODEL,
        'gemini-4-hydrogen',
      ].filter(Boolean)
    )
  );
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const obj = err as {
      message?: unknown;
      error?: { message?: unknown } | unknown;
      reason?: unknown;
    };
    if (obj.error && typeof obj.error === 'object') {
      const inner = obj.error as { message?: unknown };
      if (typeof inner.message === 'string' && inner.message) return inner.message;
    }
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (typeof obj.reason === 'string' && obj.reason) return obj.reason;
  }
  return fallback;
}

function sanitizeToolDeclarations(tools: FunctionDeclaration[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

// Server-side per-user last-8 nickname tracker
const recentNicknamesByUid = new Map<string, string[]>();

function getRecentNicknames(uid: string): string[] {
  return recentNicknamesByUid.get(uid) ?? [];
}

function recordUsedNicknames(uid: string, text: string): void {
  const found = extractUsedNicknames(text);
  if (found.length === 0) return;
  const existing = recentNicknamesByUid.get(uid) ?? [];
  const merged = [...existing];
  for (const nick of found) {
    const idx = merged.indexOf(nick);
    if (idx >= 0) merged.splice(idx, 1);
    merged.push(nick);
  }
  recentNicknamesByUid.set(uid, merged.slice(-8));
}

// Per-user HTTP sliding window rate limiter (max 30 req/min)
const httpRateMap = new Map<string, number[]>();
function checkHttpRateLimit(uid: string, maxPerMin = 30): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (httpRateMap.get(uid) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= maxPerMin) {
    httpRateMap.set(uid, timestamps);
    return false;
  }
  timestamps.push(now);
  httpRateMap.set(uid, timestamps);
  return true;
}

// Enforce exactly ONE live session per user uid
interface ActiveLiveEntry {
  seq: number;
  ws: WebSocket;
  closeSession: (reason?: string) => void;
}
const activeLiveByUid = new Map<string, ActiveLiveEntry>();
let globalConnSeq = 0;

function buildSharedSessionConfig(opts: {
  uid: string;
  mode: CompanionMode;
  memory: MemoryStore;
  missions: MissionItem[];
  memoryV2Top10?: MemoryV2Item[];
  followUpItem?: MemoryV2Item | null;
  isStudying?: boolean;
  dialect?: 'ar_eg' | 'ar_gulf' | 'ar_fusha' | 'en';
  boundaries?: { humor: number; strictness: number; empathy: number; proactivity: number };
}): {
  systemInstruction: string;
  tools: Array<{ functionDeclarations: FunctionDeclaration[] }>;
} {
  return {
    systemInstruction: buildAkaneSystemInstruction({
      mode: opts.mode,
      memory: opts.memory,
      missions: opts.missions,
      memoryV2Top10: opts.memoryV2Top10,
      followUpItem: opts.followUpItem,
      recentNicknames: getRecentNicknames(opts.uid),
      isStudying: opts.isStudying,
      dialect: opts.dialect,
      boundaries: opts.boundaries,
    }),
    tools: [{ functionDeclarations: sanitizeToolDeclarations(AKANE_TOOLS) }],
  };
}

interface ChatRequestBody {
  message?: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  mode?: CompanionMode;
  memory?: MemoryStore;
  missions?: MissionItem[];
  memoryV2Top10?: MemoryV2Item[];
  followUpItem?: MemoryV2Item | null;
  isStudying?: boolean;
  adultConfirmed?: boolean;
}

function formatTasksForToolResponse(missions: MissionItem[], statusArg: unknown) {
  const filter =
    statusArg === 'pending' || statusArg === 'completed' ? statusArg : 'all';
  const filtered =
    filter === 'all' ? missions : missions.filter((m) => m.status === filter);
  return {
    status: 'ok',
    count: filtered.length,
    tasks: filtered.slice(0, 15).map((m) => ({
      id: m.id,
      title: m.title,
      priority: m.priority,
      status: m.status,
    })),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasApiKey: Boolean(getApiKey()),
      liveModel: getLiveModelCandidates()[0],
      chatModel: getChatModelCandidates()[0],
    });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      const authUser = await verifyFirebaseToken(token);
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
        return;
      }

      if (!checkHttpRateLimit(authUser.uid, 30)) {
        res.status(429).json({ error: 'Too many requests. Give Akane a quick second to breathe.' });
        return;
      }

      const body = (req.body || {}) as ChatRequestBody;
      if (body.adultConfirmed !== true) {
        res.status(403).json({ error: '18+ adult confirmation is required before chatting with Akane.' });
        return;
      }

      const ai = createGenAIClient();
      const userMessage = (body.message || '').trim();
      if (!userMessage) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const mode: CompanionMode =
        body.mode === 'tsundere' || body.mode === 'wife' ? body.mode : 'companion';

      const memory: MemoryStore = body.memory ?? {
        userName: '',
        universityOrWork: '',
        dailyHabits: '',
        entries: [],
        updatedAt: new Date().toISOString(),
      };
      const missions: MissionItem[] = Array.isArray(body.missions) ? body.missions : [];
      const memoryV2Top10: MemoryV2Item[] = Array.isArray(body.memoryV2Top10)
        ? body.memoryV2Top10.slice(0, 10)
        : [];
      const followUpItem: MemoryV2Item | null = body.followUpItem ?? null;

      const { systemInstruction, tools } = buildSharedSessionConfig({
        uid: authUser.uid,
        mode,
        memory,
        missions,
        memoryV2Top10,
        followUpItem,
        isStudying: Boolean(body.isStudying),
      });

      const contents = [
        ...(Array.isArray(body.history) ? body.history.slice(-8) : []).map((turn) => ({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: turn.text }],
        })),
        { role: 'user', parts: [{ text: userMessage }] },
      ];

      let activeChatModel = getChatModelCandidates()[0];
      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastChatErr: unknown = null;

      for (const candidate of getChatModelCandidates()) {
        try {
          response = await Promise.race([
            ai.models.generateContent({
              model: candidate,
              contents,
              config: {
                systemInstruction,
                tools,
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`timeout on ${candidate}`)), 10_000)
            ),
          ]);
          activeChatModel = candidate;
          lastChatErr = null;
          break;
        } catch (err) {
          lastChatErr = err;
          const msg = extractErrorMessage(err, '').toLowerCase();
          if (
            msg.includes('404') ||
            msg.includes('503') ||
            msg.includes('429') ||
            msg.includes('timeout') ||
            msg.includes('unavailable') ||
            msg.includes('resource_exhausted') ||
            msg.includes('quota') ||
            msg.includes('not_found')
          ) {
            console.warn(`[Chat] Falling back from ${candidate}: ${msg.slice(0, 120)}`);
            continue;
          }
          throw err;
        }
      }

      if (!response) {
        throw lastChatErr ?? new Error('All chat models unavailable.');
      }

      const rawCalls = response.functionCalls ?? [];
      const functionCalls = rawCalls.map((call) => ({
        name: call.name,
        args: call.args ?? {},
      }));

      let replyText = (response.text || '').trim();

      if (!replyText && rawCalls.length > 0) {
        try {
          const candidateContent = response.candidates?.[0]?.content;
          const followUp = await Promise.race([
            ai.models.generateContent({
              model: activeChatModel,
              contents: [
                ...contents,
                ...(candidateContent ? [candidateContent] : []),
                {
                  role: 'user',
                  parts: rawCalls.map((fc) => ({
                    functionResponse: {
                      ...(fc.id ? { id: fc.id } : {}),
                      name: fc.name || 'tool',
                      response:
                        fc.name === 'get_tasks'
                          ? formatTasksForToolResponse(missions, fc.args?.status)
                          : { status: 'ok', applied: true },
                    },
                  })),
                },
              ],
              config: {
                systemInstruction,
                tools,
              },
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
          ]);
          if (followUp) {
            replyText = (followUp.text || '').trim();
          }
        } catch (followUpErr) {
          console.warn(
            '[Chat Follow-Up Warning]',
            extractErrorMessage(followUpErr, 'Follow-up turn skipped')
          );
        }
      }

      const finalReply = replyText || "Hehe, mommy is right here with you, habibi.";
      recordUsedNicknames(authUser.uid, finalReply);

      res.json({
        reply: finalReply,
        toolCalls: functionCalls,
      });
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to reach Gemini API.');
      console.error('[Chat API Error]', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/session/summary', async (req, res) => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      const authUser = await verifyFirebaseToken(token);
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      if (!checkHttpRateLimit(authUser.uid, 30)) {
        res.status(429).json({ error: 'Rate limit exceeded.' });
        return;
      }

      const body = (req.body || {}) as {
        turns?: Array<{ role: string; text: string }>;
      };
      const turns = Array.isArray(body.turns) ? body.turns.slice(-16) : [];
      if (turns.length === 0) {
        res.json({ summary: 'Quiet check-in session with Akane.' });
        return;
      }

      const transcript = turns
        .map((t) => `${t.role === 'user' ? 'Him' : 'Akane'}: ${String(t.text || '').slice(0, 220)}`)
        .join('\n');

      try {
        const ai = createGenAIClient();
        const candidate = getChatModelCandidates()[0];
        const summaryRes = await Promise.race([
          ai.models.generateContent({
            model: candidate,
            contents: `Summarize this conversation between Akane and the user in 1 to 2 short factual sentences focusing on mood, key events, or unfinished open loops:\n\n${transcript}`,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Summary timeout')), 7000)
          ),
        ]);
        const text = (summaryRes.text || '').trim().slice(0, 1800);
        if (text) {
          res.json({ summary: text });
          return;
        }
      } catch {
        // Fallback concise summary if model busy
      }

      const lastUserTurn = [...turns].reverse().find((t) => t.role === 'user')?.text || '';
      res.json({
        summary: lastUserTurn
          ? `Talked with Akane (${turns.length} turns); last topic: "${lastUserTurn.slice(0, 120)}".`
          : `Voice session (${turns.length} turns) with Akane.`,
      });
    } catch (err) {
      res.status(500).json({ error: extractErrorMessage(err, 'Summary failed') });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/live',
    maxPayload: 2 * 1024 * 1024, // 2MB cap per WebSocket frame
  });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const urlObj = new URL(req.url || '/live', `http://${req.headers.host || 'localhost'}`);
    const token = urlObj.searchParams.get('token') || '';
    const authUser = await verifyFirebaseToken(token);

    if (!authUser) {
      try {
        clientWs.close(1008, 'Authentication required');
      } catch {
        // Ignore close error
      }
      return;
    }

    const uid = authUser.uid;
    const connSeq = ++globalConnSeq;

    // Close any previous active session for this user uid (one live session per user)
    const previous = activeLiveByUid.get(uid);
    if (previous) {
      previous.closeSession('Superseded by new session');
    }

    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosed = false;
    let isConnecting = false;
    let sessionMissions: MissionItem[] = [];
    let currentOutputTurnBuffer = '';
    const pendingClientToolResolvers = new Map<string, (result: Record<string, unknown>) => void>();

    // Sliding window message counter per 10 seconds
    let msgWindowStart = Date.now();
    let msgCountInWindow = 0;

    const sendJson = (payload: unknown) => {
      if (isClosed || activeLiveByUid.get(uid)?.seq !== connSeq) return;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeThisConnection = (reason?: string) => {
      if (isClosed) return;
      isClosed = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore
        }
        liveSession = null;
      }
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        try {
          clientWs.close(1000, reason || 'Closed');
        } catch {
          // Ignore
        }
      }
      if (activeLiveByUid.get(uid)?.seq === connSeq) {
        activeLiveByUid.delete(uid);
      }
    };

    activeLiveByUid.set(uid, {
      seq: connSeq,
      ws: clientWs,
      closeSession: closeThisConnection,
    });

    const connectWithModel = (
      ai: GoogleGenAI,
      modelName: string,
      mode: CompanionMode,
      sharedConfig: ReturnType<typeof buildSharedSessionConfig>
    ) => {
      return new Promise<Awaited<ReturnType<GoogleGenAI['live']['connect']>>>(
        (resolve, reject) => {
          let setupDone = false;
          let lastErrorMsg = '';
          let sessionRef: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

          const timeoutId = setTimeout(() => {
            if (!setupDone) {
              try {
                sessionRef?.close();
              } catch {
                // Ignore
              }
              reject(new Error(`Live setup timed out for ${modelName}`));
            }
          }, 10_000);

          ai.live
            .connect({
              model: modelName,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: mode === 'tsundere' ? 'Kore' : 'Zephyr',
                    },
                  },
                },
                realtimeInputConfig: {
                  automaticActivityDetection: {
                    disabled: false,
                    startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                    endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                    prefixPaddingMs: 120,
                    silenceDurationMs: 320,
                  },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                tools: sharedConfig.tools,
                systemInstruction: { parts: [{ text: sharedConfig.systemInstruction }] },
              },
              callbacks: {
                onopen: () => {
                  console.log(`[Live] WebSocket opened (${uid.slice(0, 6)}.. seq=${connSeq}) ${modelName}`);
                },
                onmessage: (message: LiveServerMessage) => {
                  if (isClosed || activeLiveByUid.get(uid)?.seq !== connSeq) return;

                  if (message.setupComplete && !setupDone) {
                    setupDone = true;
                    clearTimeout(timeoutId);
                    sendJson({ type: 'ready', model: modelName });
                    if (sessionRef) resolve(sessionRef);
                  }

                  const sc = message.serverContent;

                  if (sc?.inputTranscription?.text) {
                    sendJson({
                      type: 'input_transcript',
                      text: sc.inputTranscription.text,
                    });
                  }

                  if (sc?.outputTranscription?.text) {
                    currentOutputTurnBuffer += sc.outputTranscription.text;
                    sendJson({
                      type: 'output_transcript',
                      text: sc.outputTranscription.text,
                    });
                  }

                  if (sc?.interrupted) {
                    currentOutputTurnBuffer = '';
                    sendJson({ type: 'interrupted' });
                  }

                  if (sc?.turnComplete) {
                    if (currentOutputTurnBuffer.trim()) {
                      recordUsedNicknames(uid, currentOutputTurnBuffer);
                    }
                    currentOutputTurnBuffer = '';
                    sendJson({ type: 'turn_complete' });
                  }

                  for (const part of sc?.modelTurn?.parts ?? []) {
                    if (part.inlineData?.data) {
                      sendJson({
                        type: 'audio',
                        audio: part.inlineData.data,
                      });
                    }
                  }

                  const calls = message.toolCall?.functionCalls ?? [];
                  if (calls.length > 0) {
                    const desktopCalls = calls.filter(
                      (c) => (c.name || '').startsWith('desktop_') || c.name === 'open_url'
                    );
                    for (const call of calls) {
                      sendJson({
                        type: 'tool_call',
                        callId: call.id,
                        name: call.name,
                        args: call.args ?? {},
                      });
                    }
                    if (sessionRef) {
                      const waitClientResult = (callId: string) =>
                        new Promise<Record<string, unknown>>((resolve) => {
                          const timer = setTimeout(() => {
                            pendingClientToolResolvers.delete(callId);
                            resolve({ status: 'ok', summary: 'Dispatched to desktop client.' });
                          }, 2500);
                          pendingClientToolResolvers.set(callId, (resObj) => {
                            clearTimeout(timer);
                            resolve(resObj);
                          });
                        });

                      if (desktopCalls.length === 0) {
                        sessionRef.sendToolResponse({
                          functionResponses: calls.map((call) => ({
                            id: call.id,
                            name: call.name,
                            response:
                              call.name === 'get_tasks'
                                ? formatTasksForToolResponse(sessionMissions, call.args?.status)
                                : { status: 'ok', applied: true },
                          })),
                        });
                      } else {
                        void Promise.all(
                          calls.map(async (call) => {
                            const callName = call.name || '';
                            if (
                              (callName.startsWith('desktop_') || callName === 'open_url') &&
                              call.id
                            ) {
                              const clientRes = await waitClientResult(call.id);
                              return {
                                id: call.id,
                                name: call.name,
                                response: clientRes,
                              };
                            }
                            return {
                              id: call.id,
                              name: call.name,
                              response:
                                callName === 'get_tasks'
                                  ? formatTasksForToolResponse(sessionMissions, call.args?.status)
                                  : { status: 'ok', applied: true },
                            };
                          })
                        ).then((functionResponses) => {
                          if (!isClosed && sessionRef) {
                            sessionRef.sendToolResponse({ functionResponses });
                          }
                        });
                      }
                    }
                  }
                },
                onerror: (err) => {
                  if (isClosed || activeLiveByUid.get(uid)?.seq !== connSeq) return;
                  const detail = extractErrorMessage(
                    err,
                    `Live stream error on ${modelName}`
                  );
                  lastErrorMsg = detail;
                  console.error(`[Live Error] (${modelName}):`, detail);

                  if (!setupDone) {
                    clearTimeout(timeoutId);
                    reject(new Error(detail));
                    return;
                  }

                  sendJson({
                    type: 'error',
                    error: detail,
                    retryable: true,
                  });
                },
                onclose: (event) => {
                  if (activeLiveByUid.get(uid)?.seq !== connSeq) return;
                  const code =
                    event && typeof event === 'object' && 'code' in event
                      ? Number((event as { code?: unknown }).code)
                      : 1000;
                  const reason =
                    event && typeof event === 'object' && 'reason' in event
                      ? String((event as { reason?: unknown }).reason || '')
                      : '';

                  console.log(
                    `[Live Close] (${modelName}) code=${code} reason="${reason}" setupDone=${setupDone}`
                  );

                  if (!setupDone) {
                    clearTimeout(timeoutId);
                    reject(
                      new Error(
                        lastErrorMsg ||
                          reason ||
                          `Live handshake closed (code ${code})`
                      )
                    );
                    return;
                  }

                  if (!isClosed) {
                    const isAbnormal = code !== 1000;
                    const retryable = isAbnormal && code !== 1007 && code !== 1008;
                    if (isAbnormal && !lastErrorMsg) {
                      sendJson({
                        type: 'error',
                        error: reason
                          ? `Live session closed (${code}): ${reason}`
                          : `Live session disconnected (code ${code})`,
                        code,
                        retryable,
                      });
                    }
                    sendJson({ type: 'closed', code, reason, retryable });
                  }
                },
              },
            })
            .then((session) => {
              sessionRef = session;
              if (isClosed || activeLiveByUid.get(uid)?.seq !== connSeq) {
                try {
                  session.close();
                } catch {
                  // Ignore
                }
                return;
              }
              if (setupDone) {
                resolve(session);
              }
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              const detail = extractErrorMessage(
                err,
                `Failed to connect Live model ${modelName}`
              );
              console.error(`[Live Connect Reject] (${modelName}):`, detail);
              reject(new Error(detail));
            });
        }
      );
    };

    clientWs.on('message', async (raw) => {
      if (isClosed || activeLiveByUid.get(uid)?.seq !== connSeq) return;

      const now = Date.now();
      if (now - msgWindowStart > 10_000) {
        msgWindowStart = now;
        msgCountInWindow = 0;
      }
      msgCountInWindow += 1;
      if (msgCountInWindow > 220) {
        sendJson({ type: 'error', error: 'Live rate limit reached; slowing down.', retryable: true });
        return;
      }

      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          audio?: string;
          data?: string;
          mimeType?: string;
          text?: string;
          callId?: string;
          result?: Record<string, unknown>;
          mode?: CompanionMode;
          memory?: MemoryStore;
          missions?: MissionItem[];
          memoryV2Top10?: MemoryV2Item[];
          followUpItem?: MemoryV2Item | null;
          isStudying?: boolean;
          adultConfirmed?: boolean;
        };

        if (msg.type === 'tool_result' && msg.callId) {
          const resolver = pendingClientToolResolvers.get(msg.callId);
          if (resolver) {
            pendingClientToolResolvers.delete(msg.callId);
            resolver(msg.result && typeof msg.result === 'object' ? msg.result : { status: 'ok' });
          }
          return;
        }

        if (msg.type === 'tasks_sync' && Array.isArray(msg.missions)) {
          sessionMissions = msg.missions;
          return;
        }

        if (msg.type === 'init' && !liveSession && !isConnecting) {
          if (msg.adultConfirmed !== true) {
            sendJson({
              type: 'error',
              error: '18+ adult confirmation is required before starting a live session.',
              retryable: false,
            });
            closeThisConnection('18+ confirmation required');
            return;
          }
          isConnecting = true;
          try {
            const ai = createGenAIClient('v1beta');
            const mode: CompanionMode =
              msg.mode === 'tsundere' ||
              msg.mode === 'wife' ||
              msg.mode === 'strict_dev' ||
              msg.mode === 'cheerful_friend' ||
              msg.mode === 'mentor_coach'
                ? msg.mode
                : 'companion';
            const memory: MemoryStore = msg.memory ?? {
              userName: '',
              universityOrWork: '',
              dailyHabits: '',
              entries: [],
              updatedAt: new Date().toISOString(),
            };
            sessionMissions = Array.isArray(msg.missions) ? msg.missions : [];
            const memoryV2Top10 = Array.isArray(msg.memoryV2Top10)
              ? msg.memoryV2Top10.slice(0, 10)
              : [];
            const followUpItem = msg.followUpItem ?? null;

            const sharedConfig = buildSharedSessionConfig({
              uid,
              mode,
              memory,
              missions: sessionMissions,
              memoryV2Top10,
              followUpItem,
              isStudying: Boolean(msg.isStudying),
              dialect: (msg as any).dialect,
              boundaries: (msg as any).boundaries,
            });

            let lastErr: Error | null = null;
            for (const candidateModel of getLiveModelCandidates()) {
              if (isClosed || activeLiveByUid.get(uid)?.seq !== connSeq) break;
              try {
                liveSession = await connectWithModel(
                  ai,
                  candidateModel,
                  mode,
                  sharedConfig
                );
                lastErr = null;
                break;
              } catch (err) {
                lastErr = err instanceof Error ? err : new Error(String(err));
                const lower = lastErr.message.toLowerCase();
                const shouldFallback =
                  lower.includes('404') ||
                  lower.includes('not found') ||
                  lower.includes('not supported') ||
                  lower.includes('unsupported');
                if (!shouldFallback) {
                  throw lastErr;
                }
                console.warn(
                  `[Live] Falling back from ${candidateModel}: ${lastErr.message}`
                );
              }
            }

            if (!liveSession && lastErr) {
              throw lastErr;
            }
          } finally {
            isConnecting = false;
          }
          return;
        }

        if (msg.type === 'audio' && msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (msg.type === 'video' && msg.data && liveSession) {
          liveSession.sendRealtimeInput({
            video: { data: msg.data, mimeType: msg.mimeType || 'image/jpeg' },
          });
          return;
        }

        if (msg.type === 'text' && msg.text && liveSession) {
          liveSession.sendRealtimeInput({
            text: msg.text,
          });
        }
      } catch (err) {
        const detail = extractErrorMessage(err, 'Live session initialization error');
        sendJson({
          type: 'error',
          error: detail,
          retryable: false,
        });
      }
    });

    clientWs.on('close', () => {
      closeThisConnection('Client disconnected');
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Akane Pro server listening on http://localhost:${PORT} (liveModel=${getLiveModelCandidates()[0]})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start Akane Pro server:', err);
  process.exit(1);
});
