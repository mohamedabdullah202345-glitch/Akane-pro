import type {
  AkaneManifest,
  AkaneManifestRaw,
  ManifestClipEntry,
  ResolvedManifestClip,
  TalkMood,
} from '../types/akane';

export const DEFAULT_CHROMA_TOLERANCE = 0.16;
export const MIN_NON_SPEECH_COOLDOWN_MS = 6_000;
export const MIN_NON_SPEECH_STILLNESS_MS = 6_000;

const MANIFEST_URL = '/akane/manifest.json';

const DEFAULT_BADGES: Record<string, string> = {
  idle_1: '🌙 Calm',
  '1_greet': '👋 Greeting',
  '1_listen': '👂 Listening',
  listen_2: '👂 Attentive',
  talk_1: '💬 Speaking',
  talk_2: '💬 Conversing',
  talk_3: '💬 Explaining',
  talk_4: '💬 Expressive',
  think_1: '🤔 Thinking',
  think_2: '🤔 Pondering',
  think_3: '🤔 Reflecting',
  happy: '😊 Happy',
  giggle: '🤭 Giggling',
  laugh: '😂 Laughing',
  proud: '✨ Proud',
  shy: '😳 Bashful',
  curious: '🧐 Curious',
  surprised: '😮 Surprised',
  surprised_2: '😲 Astonished',
  annoyed: '😒 Unimpressed',
  worried: '🥺 Worried',
  sad: '😔 Empathetic',
  sad_2: '💔 Comforting',
  sleepy: '😴 Sleepy',
  sleepy_2: '🥱 Drowsy',
  cheer: '🎉 Cheering',
  dance: '💃 Dancing',
  tease: '😏 Teasing',
  scold: '☝️ Scolding',
  scold_2: '😤 Firm',
  shake_no: '🙅‍♀️ Declining',
};

function stripExtension(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

function resolveFileSrc(file: string, baseUrl: string): string {
  if (file.startsWith('/') || /^https?:\/\//i.test(file)) {
    return file;
  }
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/${file.replace(/^\/+/, '')}`;
}

function normalizeEntry(
  entry: ManifestClipEntry,
  category: ResolvedManifestClip['category'],
  baseUrl: string,
  emotionKey?: string
): ResolvedManifestClip {
  const id = (entry.id || stripExtension(entry.file)).trim();
  const defaultCooldown =
    category === 'react'
      ? emotionKey === 'greet' || id === '1_greet'
        ? 0
        : 12_000
      : 0;

  return {
    id,
    file: entry.file,
    src: resolveFileSrc(entry.file, baseUrl),
    category,
    emotionKey,
    mood: entry.mood,
    weight: typeof entry.weight === 'number' && entry.weight > 0 ? entry.weight : 100,
    cooldownMs:
      typeof entry.cooldownMs === 'number' && entry.cooldownMs >= 0
        ? entry.cooldownMs
        : defaultCooldown,
    chromaTolerance:
      typeof entry.chromaTolerance === 'number' && entry.chromaTolerance > 0
        ? entry.chromaTolerance
        : DEFAULT_CHROMA_TOLERANCE,
    preload: Boolean(entry.preload),
    urgent: Boolean(entry.urgent),
    microIdle: Boolean(entry.microIdle),
    badgeLabel:
      entry.badgeLabel ||
      DEFAULT_BADGES[id] ||
      (emotionKey ? `✨ ${emotionKey}` : `🎬 ${id}`),
    fallbackDurationMs:
      typeof entry.fallbackDurationMs === 'number' && entry.fallbackDurationMs > 0
        ? entry.fallbackDurationMs
        : 4000,
    semanticRule:
      entry.semanticRule ||
      (category === 'talk'
        ? `Spoken delivery (${entry.mood || 'neutral'} mood).`
        : category === 'listen'
          ? 'Attentive listening while user speaks.'
          : category === 'think'
            ? 'Brief thinking pose.'
            : category === 'idle'
              ? 'Resting idle loop.'
              : `Triggered reaction (${emotionKey || id}).`),
  };
}

export function buildManifestFromRaw(raw: AkaneManifestRaw): AkaneManifest {
  const baseUrl = raw.baseUrl || '/videos';
  const idle = (raw.clips?.idle ?? []).map((e) => normalizeEntry(e, 'idle', baseUrl));
  const talk = (raw.clips?.talk ?? []).map((e) => normalizeEntry(e, 'talk', baseUrl));
  const listen = (raw.clips?.listen ?? []).map((e) =>
    normalizeEntry(e, 'listen', baseUrl)
  );
  const think = (raw.clips?.think ?? []).map((e) => normalizeEntry(e, 'think', baseUrl));

  const react: Record<string, ResolvedManifestClip[]> = {};
  for (const [emotionKey, entries] of Object.entries(raw.clips?.react ?? {})) {
    react[emotionKey] = (entries ?? []).map((e) =>
      normalizeEntry(e, 'react', baseUrl, emotionKey)
    );
  }

  const allClips: ResolvedManifestClip[] = [
    ...idle,
    ...talk,
    ...listen,
    ...think,
    ...Object.values(react).flat(),
  ];

  const byId: Record<string, ResolvedManifestClip> = {};
  for (const clip of allClips) {
    byId[clip.id] = clip;
    byId[clip.file] = clip;
  }

  return {
    character: raw.character || 'akane',
    outfit: raw.outfit || 'default',
    still: raw.still || '/akane/akane_still.png',
    baseUrl,
    clips: { idle, talk, listen, think, react },
    allClips,
    byId,
  };
}

const FALLBACK_MANIFEST_RAW: AkaneManifestRaw = {
  character: 'akane',
  outfit: 'default',
  still: '/akane/akane_still.png',
  baseUrl: '/videos',
  clips: {
    idle: [
      { id: 'idle_1', file: 'idle_1.mp4', weight: 100, cooldownMs: 0, preload: true },
    ],
    talk: [
      { id: 'talk_1', file: 'talk_1.mp4', mood: 'neutral', weight: 100, preload: true },
      { id: 'talk_2', file: 'talk_2.mp4', mood: 'warm', weight: 90, preload: true },
      { id: 'talk_3', file: 'talk_3.mp4', mood: 'calm', weight: 80, preload: true },
      { id: 'talk_4', file: 'talk_4.mp4', mood: 'playful', weight: 75, preload: false },
    ],
    listen: [
      { id: '1_listen', file: '1_listen.mp4', weight: 100, preload: true },
      { id: 'listen_2', file: 'listen_2.mp4', weight: 85, preload: false },
    ],
    think: [
      { id: 'think_1', file: 'think_1.mp4', weight: 100, preload: true },
    ],
    react: {
      greet: [{ id: '1_greet', file: '1_greet.mp4', weight: 100, cooldownMs: 0, urgent: true, preload: true }],
      happy: [{ id: 'happy', file: 'happy.mp4', weight: 100, cooldownMs: 12000, preload: true }],
      giggle: [{ id: 'giggle', file: 'giggle.mp4', weight: 100, cooldownMs: 12000 }],
      laugh: [{ id: 'laugh', file: 'laugh.mp4', weight: 100, cooldownMs: 12000 }],
      proud: [{ id: 'proud', file: 'proud.mp4', weight: 100, cooldownMs: 12000 }],
      shy: [{ id: 'shy', file: 'shy.mp4', weight: 100, cooldownMs: 12000 }],
      curious: [{ id: 'curious', file: 'curious.mp4', weight: 100, cooldownMs: 12000 }],
      surprised: [
        { id: 'surprised', file: 'surprised.mp4', weight: 100, cooldownMs: 12000 },
        { id: 'surprised_2', file: 'surprised_2.mp4', weight: 75, cooldownMs: 12000 },
      ],
      annoyed: [{ id: 'annoyed', file: 'annoyed.mp4', weight: 100, cooldownMs: 12000 }],
      worried: [{ id: 'worried', file: 'worried.mp4', weight: 100, cooldownMs: 12000 }],
      sad: [
        { id: 'sad', file: 'sad.mp4', weight: 100, cooldownMs: 12000 },
        { id: 'sad_2', file: 'sad_2.mp4', weight: 70, cooldownMs: 12000 },
      ],
      sleepy: [
        { id: 'sleepy', file: 'sleepy.mp4', weight: 100, cooldownMs: 12000 },
        { id: 'sleepy_2', file: 'sleepy_2.mp4', weight: 70, cooldownMs: 12000 },
      ],
      cheer: [{ id: 'cheer', file: 'cheer.mp4', weight: 100, cooldownMs: 25000, urgent: true }],
      dance: [{ id: 'dance', file: 'dance.mp4', weight: 100, cooldownMs: 25000 }],
      tease: [{ id: 'tease', file: 'tease.mp4', weight: 100, cooldownMs: 25000 }],
      scold: [
        { id: 'scold', file: 'scold.mp4', weight: 100, cooldownMs: 25000 },
        { id: 'scold_2', file: 'scold_2.mp4', weight: 70, cooldownMs: 25000 },
      ],
      shake_no: [{ id: 'shake_no', file: 'shake_no.mp4', weight: 100, cooldownMs: 25000 }],
    },
  },
};

let cachedManifest: AkaneManifest = buildManifestFromRaw(FALLBACK_MANIFEST_RAW);
let manifestLoadPromise: Promise<AkaneManifest> | null = null;

export function getManifestSync(): AkaneManifest {
  return cachedManifest;
}

export async function loadAkaneManifest(): Promise<AkaneManifest> {
  if (typeof window === 'undefined') {
    return cachedManifest;
  }
  if (!manifestLoadPromise) {
    manifestLoadPromise = fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as AkaneManifestRaw;
        cachedManifest = buildManifestFromRaw(raw);
        return cachedManifest;
      })
      .catch(() => cachedManifest);
  }
  return manifestLoadPromise;
}

const blobUrlCache = new Map<string, string>();
const inFlightClipLoads = new Map<string, Promise<string>>();

export function getCachedClipPlayableUrl(src: string): string {
  return blobUrlCache.get(src) || src;
}

export async function preloadClipToMemory(
  src: string,
  signal?: AbortSignal
): Promise<string> {
  const existing = blobUrlCache.get(src);
  if (existing) return existing;

  const inflight = inFlightClipLoads.get(src);
  if (inflight) return inflight;

  const promise = fetch(src, { signal, cache: 'force-cache' })
    .then(async (res) => {
      if (!res.ok) return src;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      blobUrlCache.set(src, objUrl);
      return objUrl;
    })
    .catch(() => src)
    .finally(() => {
      inFlightClipLoads.delete(src);
    });

  inFlightClipLoads.set(src, promise);
  return promise;
}

export async function preloadCoreClips(
  manifest: AkaneManifest,
  signal?: AbortSignal
): Promise<void> {
  const flagged = manifest.allClips.filter((c) => c.preload);
  const core = (flagged.length > 0 ? flagged : manifest.allClips).slice(0, 8);
  for (const clip of core) {
    if (signal?.aborted) break;
    await preloadClipToMemory(clip.src, signal);
  }
}

export function pickWeightedClip(
  pool: ResolvedManifestClip[],
  opts?: {
    lastClipId?: string | null;
    lastPlayedAtById?: Record<string, number>;
    now?: number;
    respectPerClipCooldown?: boolean;
  }
): ResolvedManifestClip | null {
  if (pool.length === 0) return null;
  const now = opts?.now ?? Date.now();
  const lastId = opts?.lastClipId ?? null;
  const lastById = opts?.lastPlayedAtById ?? {};
  const checkCooldown = opts?.respectPerClipCooldown ?? true;

  let candidates = pool.filter((clip) => {
    if (checkCooldown && clip.cooldownMs > 0) {
      const elapsed = now - (lastById[clip.id] ?? 0);
      if (elapsed < clip.cooldownMs) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return null;
  }

  // Never play the same clip twice in a row when alternatives exist
  if (lastId && candidates.length > 1) {
    candidates = candidates.filter((c) => c.id !== lastId);
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const totalWeight = candidates.reduce((acc, c) => acc + Math.max(1, c.weight), 0);
  let r = Math.random() * totalWeight;
  for (const clip of candidates) {
    r -= Math.max(1, clip.weight);
    if (r <= 0) return clip;
  }
  return candidates[0];
}

export function resolveReactionOrClip(
  manifest: AkaneManifest,
  keyOrClipId: string,
  opts?: {
    lastClipId?: string | null;
    lastPlayedAtById?: Record<string, number>;
    now?: number;
    respectPerClipCooldown?: boolean;
  }
): ResolvedManifestClip | null {
  const normalized = keyOrClipId.trim();
  const alias = normalized === 'wave' || normalized === '1_greet' ? 'greet' : normalized;

  const reactPool = manifest.clips.react[alias] || manifest.clips.react[normalized];
  if (reactPool && reactPool.length > 0) {
    return pickWeightedClip(reactPool, opts);
  }

  const direct = manifest.byId[normalized] || manifest.byId[alias];
  if (!direct) return null;

  if (opts?.respectPerClipCooldown !== false && direct.cooldownMs > 0) {
    const now = opts?.now ?? Date.now();
    const elapsed = now - (opts?.lastPlayedAtById?.[direct.id] ?? 0);
    if (elapsed < direct.cooldownMs) return null;
  }
  return direct;
}

export function pickTalkClipForMood(
  manifest: AkaneManifest,
  mood: TalkMood,
  lastClipId?: string | null
): ResolvedManifestClip {
  const pool = manifest.clips.talk;
  const moodMatches = pool.filter((c) => c.mood === mood);
  const nonRepeatMood = lastClipId
    ? moodMatches.filter((c) => c.id !== lastClipId)
    : moodMatches;
  const candidatePool = nonRepeatMood.length > 0 ? nonRepeatMood : pool;
  const picked =
    pickWeightedClip(candidatePool, {
      lastClipId,
      respectPerClipCooldown: false,
    }) ||
    pool[0] ||
    manifest.clips.idle[0];
  return picked;
}

export const EXPRESSION_TOOL_IDS = [
  'greet',
  'goodbye',
  'happy',
  'cheer',
  'giggle',
  'comfort',
  'sad',
  'worried',
  'proud',
  'blush',
  'tease',
  'scold',
  'annoyed',
  'pout',
  'surprised',
  'curious',
  'think',
  'sleepy',
  'hug',
  'wait',
  'nod_yes',
  'shake_no',
] as const;

export const GESTURE_TOOL_IDS = [
  '1_greet',
  'cheer',
  'dance',
  'tease',
  'scold',
  'scold_2',
  'shake_no',
] as const;

export { buildAkaneSystemInstruction } from './akanePersona.ts';

