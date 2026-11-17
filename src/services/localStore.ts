import type {
  LanguageCode,
  LightingPreset,
  MemoryCategory,
  MemoryEntry,
  MemoryStore,
  MissionItem,
  MissionPriority,
  OutfitStyle,
  SleepTimerMinutes,
  UserPreferences,
} from '../types/akane';

export const MEMORY_STORAGE_KEY = 'akane_pro_memory_v1';
export const MISSIONS_STORAGE_KEY = 'akane_pro_missions_v1';
export const PREFS_STORAGE_KEY = 'akane_pro_prefs_v1';
export const AFFECTION_STORAGE_KEY = 'akane_pro_affection_v1';
export const DIARY_STORAGE_KEY = 'akane_pro_diary_v1';
export const FLASHCARDS_STORAGE_KEY = 'akane_pro_flashcards_v1';
export const GRAPH_STORAGE_KEY = 'akane_pro_graph_v1';
export const MEETINGS_STORAGE_KEY = 'akane_pro_meetings_v1';

const DEFAULT_MEMORY: MemoryStore = {
  userName: '',
  universityOrWork: '',
  dailyHabits: '',
  entries: [],
  updatedAt: new Date().toISOString(),
};

const DEFAULT_PREFS: UserPreferences = {
  backgroundMode: 'dark',
  companionMode: 'companion',
  outfitStyle: 'default',
  ambientSoundscape: 'off',
  ambientVolume: 0.35,
  nightWhisperMode: false,
  isStudying: false,
  framingZoom: 1.0,
  framingOffsetY: 0,
  language: 'ar',
  arabicDialect: 'ar_eg',
  avatarRenderMode: 'vrm_3d',
  incognitoMode: false,
  personaBoundaries: {
    humor: 75,
    strictness: 40,
    empathy: 90,
    proactivity: 65,
  },
  voiceEmotionDetection: true,
  smartBargeIn: true,
  nonVerbalCues: true,
  biggerText: false,
  lightingPreset: 'auto',
  sleepTimerMinutes: 0,
  adultConfirmed: false,
  onboardingCompleted: false,
};

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function loadMemoryStore(): MemoryStore {
  const stored = safeRead<Partial<MemoryStore>>(MEMORY_STORAGE_KEY, {});
  return {
    userName: typeof stored.userName === 'string' ? stored.userName : '',
    universityOrWork: typeof stored.universityOrWork === 'string' ? stored.universityOrWork : '',
    dailyHabits: typeof stored.dailyHabits === 'string' ? stored.dailyHabits : '',
    entries: Array.isArray(stored.entries) ? stored.entries : [],
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : DEFAULT_MEMORY.updatedAt,
  };
}

export function saveMemoryStore(store: MemoryStore): MemoryStore {
  const next: MemoryStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  safeWrite(MEMORY_STORAGE_KEY, next);
  return next;
}

export function addMemoryEntry(
  store: MemoryStore,
  content: string,
  category: MemoryCategory,
  source: 'voice' | 'manual'
): MemoryStore {
  const trimmed = content.trim();
  if (!trimmed) return store;

  const exists = store.entries.some(
    (entry) => entry.content.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) return store;

  const entry: MemoryEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: trimmed,
    category,
    source,
    createdAt: new Date().toISOString(),
  };

  return saveMemoryStore({
    ...store,
    entries: [entry, ...store.entries],
  });
}

export function removeMemoryEntry(store: MemoryStore, id: string): MemoryStore {
  return saveMemoryStore({
    ...store,
    entries: store.entries.filter((e) => e.id !== id),
  });
}

export function loadMissions(): MissionItem[] {
  const stored = safeRead<MissionItem[]>(MISSIONS_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

export function saveMissions(missions: MissionItem[]): MissionItem[] {
  safeWrite(MISSIONS_STORAGE_KEY, missions);
  return missions;
}

export function createMission(
  missions: MissionItem[],
  title: string,
  description = '',
  priority: MissionPriority = 'medium'
): { missions: MissionItem[]; created: MissionItem | null } {
  const trimmed = title.trim();
  if (!trimmed) return { missions, created: null };

  const item: MissionItem = {
    id: `mis_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: trimmed,
    description: description.trim(),
    priority,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const next = [item, ...missions];
  saveMissions(next);
  return { missions: next, created: item };
}

export function toggleMissionStatus(
  missions: MissionItem[],
  missionId: string
): { missions: MissionItem[]; completedNow: boolean; target?: MissionItem } {
  let completedNow = false;
  let target: MissionItem | undefined;

  const next = missions.map((m) => {
    if (m.id !== missionId) return m;
    const nextStatus = m.status === 'completed' ? 'pending' : 'completed';
    completedNow = nextStatus === 'completed';
    target = {
      ...m,
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined,
    };
    return target;
  });

  saveMissions(next);
  return { missions: next, completedNow, target };
}

export function deleteMission(missions: MissionItem[], missionId: string): MissionItem[] {
  const next = missions.filter((m) => m.id !== missionId);
  saveMissions(next);
  return next;
}

export function loadPreferences(): UserPreferences {
  const stored = safeRead<Partial<UserPreferences>>(PREFS_STORAGE_KEY, {});
  const outfit: OutfitStyle =
    stored.outfitStyle === 'outfit_1' || stored.outfitStyle === 'outfit_2'
      ? stored.outfitStyle
      : 'default';

  return {
    backgroundMode: stored.backgroundMode === 'transparent' ? 'transparent' : 'dark',
    companionMode:
      stored.companionMode === 'tsundere' || stored.companionMode === 'wife'
        ? stored.companionMode
        : 'companion',
    outfitStyle: outfit,
    ambientSoundscape:
      stored.ambientSoundscape === 'rain' || stored.ambientSoundscape === 'whitenoise'
        ? stored.ambientSoundscape
        : 'off',
    ambientVolume:
      typeof stored.ambientVolume === 'number' &&
      stored.ambientVolume >= 0 &&
      stored.ambientVolume <= 1
        ? stored.ambientVolume
        : DEFAULT_PREFS.ambientVolume,
    nightWhisperMode: Boolean(stored.nightWhisperMode),
    isStudying: Boolean(stored.isStudying),
    framingZoom:
      typeof stored.framingZoom === 'number' &&
      Number.isFinite(stored.framingZoom)
        ? Math.min(1.4, Math.max(1.0, stored.framingZoom))
        : 1.0,
    framingOffsetY:
      typeof stored.framingOffsetY === 'number' &&
      Number.isFinite(stored.framingOffsetY)
        ? Math.min(80, Math.max(-80, Math.round(stored.framingOffsetY)))
        : 0,
    language: (stored.language === 'ar' ? 'ar' : 'en') as LanguageCode,
    arabicDialect:
      stored.arabicDialect === 'ar_eg' ||
      stored.arabicDialect === 'ar_gulf' ||
      stored.arabicDialect === 'ar_fusha' ||
      stored.arabicDialect === 'en'
        ? stored.arabicDialect
        : DEFAULT_PREFS.arabicDialect,
    avatarRenderMode:
      stored.avatarRenderMode === 'video' ||
      stored.avatarRenderMode === 'anime_live2d' ||
      stored.avatarRenderMode === 'hybrid'
        ? stored.avatarRenderMode
        : DEFAULT_PREFS.avatarRenderMode,
    incognitoMode: Boolean(stored.incognitoMode),
    personaBoundaries: {
      humor: typeof stored.personaBoundaries?.humor === 'number' ? stored.personaBoundaries.humor : 75,
      strictness: typeof stored.personaBoundaries?.strictness === 'number' ? stored.personaBoundaries.strictness : 40,
      empathy: typeof stored.personaBoundaries?.empathy === 'number' ? stored.personaBoundaries.empathy : 90,
      proactivity: typeof stored.personaBoundaries?.proactivity === 'number' ? stored.personaBoundaries.proactivity : 65,
    },
    voiceEmotionDetection: stored.voiceEmotionDetection !== false,
    smartBargeIn: stored.smartBargeIn !== false,
    nonVerbalCues: stored.nonVerbalCues !== false,
    biggerText: Boolean(stored.biggerText),
    lightingPreset: (
      stored.lightingPreset === 'morning' ||
      stored.lightingPreset === 'day' ||
      stored.lightingPreset === 'evening' ||
      stored.lightingPreset === 'night'
        ? stored.lightingPreset
        : 'auto'
    ) as LightingPreset,
    sleepTimerMinutes: (
      stored.sleepTimerMinutes === 15 ||
      stored.sleepTimerMinutes === 30 ||
      stored.sleepTimerMinutes === 60
        ? stored.sleepTimerMinutes
        : 0
    ) as SleepTimerMinutes,
    adultConfirmed: Boolean(stored.adultConfirmed),
    onboardingCompleted: Boolean(stored.onboardingCompleted),
  };
}

export function savePreferences(prefs: UserPreferences): void {
  safeWrite(PREFS_STORAGE_KEY, prefs);
}

// Affection System
export function loadAffectionState(): {
  level: number;
  xp: number;
  maxExp: number;
  title: string;
  streakDays: number;
  hearts: number;
  lastActiveDate: string;
} {
  const fallback = {
    level: 1,
    xp: 0,
    maxExp: 100,
    title: 'New Acquaintance',
    streakDays: 1,
    hearts: 3,
    lastActiveDate: new Date().toISOString().slice(0, 10),
  };
  return safeRead(AFFECTION_STORAGE_KEY, fallback);
}

export function saveAffectionState(state: ReturnType<typeof loadAffectionState>): void {
  safeWrite(AFFECTION_STORAGE_KEY, state);
}

// Diary Entries
export function loadDiaryEntries(): any[] {
  return safeRead(DIARY_STORAGE_KEY, []);
}

export function saveDiaryEntries(entries: any[]): any[] {
  safeWrite(DIARY_STORAGE_KEY, entries);
  return entries;
}

// Flashcards
export function loadFlashcards(): any[] {
  return safeRead(FLASHCARDS_STORAGE_KEY, [
    {
      id: 'fc_1',
      question: 'What is Time Complexity of QuickSort average vs worst?',
      answer: 'Average: O(n log n), Worst: O(n^2) when bad pivot selected.',
      subject: 'Algorithms',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
    },
    {
      id: 'fc_2',
      question: 'Explain React 19 Action and useActionState hook.',
      answer: 'Actions manage async transitions and form submissions with pending state, error handling, and optimistic updates.',
      subject: 'React',
      intervalDays: 2,
      easeFactor: 2.5,
      repetitions: 0,
    },
  ]);
}

export function saveFlashcards(cards: any[]): any[] {
  safeWrite(FLASHCARDS_STORAGE_KEY, cards);
  return cards;
}

// Knowledge Graph
export function loadKnowledgeGraph(): { nodes: any[]; links: any[] } {
  return safeRead(GRAPH_STORAGE_KEY, {
    nodes: [
      { id: 'user', label: 'User', category: 'person', importance: 10 },
      { id: 'akane', label: 'Akane', category: 'person', importance: 10 },
      { id: 'akane_pro', label: 'Akane Pro Project', category: 'project', importance: 9 },
      { id: 'coding', label: 'TypeScript & React', category: 'habit', importance: 8 },
      { id: 'focus', label: 'Deep Work & Productivity', category: 'goal', importance: 8 },
    ],
    links: [
      { source: 'akane', target: 'user', relation: 'Companion / Care' },
      { source: 'user', target: 'akane_pro', relation: 'Building' },
      { source: 'user', target: 'coding', relation: 'Daily Stack' },
      { source: 'akane', target: 'focus', relation: 'Encouraging' },
    ],
  });
}

export function saveKnowledgeGraph(graph: { nodes: any[]; links: any[] }): void {
  safeWrite(GRAPH_STORAGE_KEY, graph);
}

export async function clearAllLocalData(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('akane_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.push(MEMORY_STORAGE_KEY, MISSIONS_STORAGE_KEY, PREFS_STORAGE_KEY);
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage removal failure
  }

  try {
    if ('caches' in window) {
      const names = await window.caches.keys();
      await Promise.all(names.map((name) => window.caches.delete(name)));
    }
  } catch {
    // Ignore cache wipe failure
  }
}
