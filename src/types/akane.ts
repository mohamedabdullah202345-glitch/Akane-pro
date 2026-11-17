export type CompanionMode =
  | 'companion'
  | 'tsundere'
  | 'wife'
  | 'strict_dev'
  | 'cheerful_friend'
  | 'mentor_coach';

export type BackgroundMode = 'dark' | 'transparent';

export type OutfitStyle = 'default' | 'outfit_1' | 'outfit_2';

export type AmbientSoundscape = 'off' | 'rain' | 'whitenoise';

export type MemoryCategory = 'fact' | 'preference' | 'event' | 'open_loop' | 'goal' | 'reminder';

export type MemoryV2Kind = 'fact' | 'preference' | 'event' | 'open_loop';

export interface MemoryV2Item {
  id: string;
  uid: string;
  kind: MemoryV2Kind;
  content: string;
  dueAt?: string;
  importance: number;
  resolved: boolean;
  source: 'voice' | 'chat' | 'manual';
  lastMentionedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummaryItem {
  id: string;
  uid: string;
  summary: string;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: MemoryCategory;
  source: 'voice' | 'manual';
  createdAt: string;
}

export interface MemoryStore {
  userName: string;
  universityOrWork: string;
  dailyHabits: string;
  entries: MemoryEntry[];
  updatedAt: string;
}

export type MissionPriority = 'low' | 'medium' | 'high';
export type MissionStatus = 'pending' | 'completed';

export interface MissionItem {
  id: string;
  title: string;
  description: string;
  priority: MissionPriority;
  status: MissionStatus;
  createdAt: string;
  completedAt?: string;
}

export type LanguageCode = 'en' | 'ar';

export type LightingPreset = 'auto' | 'morning' | 'day' | 'evening' | 'night';

export type SleepTimerMinutes = 0 | 15 | 30 | 60;

export type ArabicDialect = 'ar_eg' | 'ar_gulf' | 'ar_fusha' | 'en';

export type AvatarRenderMode = 'vrm_3d' | 'video' | 'anime_live2d' | 'hybrid';

export interface PersonaBoundaries {
  humor: number;
  strictness: number;
  empathy: number;
  proactivity: number;
}

export interface UserPreferences {
  backgroundMode: BackgroundMode;
  companionMode: CompanionMode;
  outfitStyle: OutfitStyle;
  ambientSoundscape: AmbientSoundscape;
  ambientVolume: number;
  nightWhisperMode: boolean;
  isStudying: boolean;
  framingZoom: number;
  framingOffsetY: number;
  language: LanguageCode;
  arabicDialect: ArabicDialect;
  avatarRenderMode: AvatarRenderMode;
  incognitoMode: boolean;
  personaBoundaries: PersonaBoundaries;
  voiceEmotionDetection: boolean;
  smartBargeIn: boolean;
  nonVerbalCues: boolean;
  biggerText: boolean;
  lightingPreset: LightingPreset;
  sleepTimerMinutes: SleepTimerMinutes;
  adultConfirmed: boolean;
  onboardingCompleted: boolean;
}

export type LiveConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type AvatarActivityState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type CharacterState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'reacting'
  | 'interrupted';

export type TalkMood = 'neutral' | 'warm' | 'calm' | 'playful' | string;

export type TriggerSource = 'user' | 'tool' | 'audio' | 'vad' | 'idle' | 'vision';

export type VisionEventType =
  | 'on_camera'
  | 'face_appear'
  | 'face_disappear'
  | 'wave'
  | 'thumbs_up'
  | 'smile'
  | 'yawn'
  | 'look_away'
  | 'nod'
  | 'shake';

export interface VisionEventPayload {
  type: VisionEventType;
  systemText: string;
  clipKey: string;
  urgent: boolean;
  priority: number;
  cooldownMs: number;
}

export interface ManifestClipEntry {
  id?: string;
  file: string;
  mood?: TalkMood;
  weight?: number;
  cooldownMs?: number;
  chromaTolerance?: number;
  preload?: boolean;
  urgent?: boolean;
  microIdle?: boolean;
  badgeLabel?: string;
  fallbackDurationMs?: number;
  semanticRule?: string;
}

export interface ResolvedManifestClip {
  id: string;
  file: string;
  src: string;
  category: 'idle' | 'talk' | 'listen' | 'think' | 'react';
  emotionKey?: string;
  mood?: TalkMood;
  weight: number;
  cooldownMs: number;
  chromaTolerance: number;
  preload: boolean;
  urgent: boolean;
  microIdle: boolean;
  badgeLabel: string;
  fallbackDurationMs: number;
  semanticRule: string;
}

export interface AkaneManifestRaw {
  character: string;
  outfit: string;
  still?: string;
  baseUrl?: string;
  clips: {
    idle: ManifestClipEntry[];
    talk: ManifestClipEntry[];
    listen: ManifestClipEntry[];
    think: ManifestClipEntry[];
    react: Record<string, ManifestClipEntry[]>;
  };
}

export interface AkaneManifest {
  character: string;
  outfit: string;
  still: string;
  baseUrl: string;
  clips: {
    idle: ResolvedManifestClip[];
    talk: ResolvedManifestClip[];
    listen: ResolvedManifestClip[];
    think: ResolvedManifestClip[];
    react: Record<string, ResolvedManifestClip[]>;
  };
  allClips: ResolvedManifestClip[];
  byId: Record<string, ResolvedManifestClip>;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'akane';
  text: string;
  expression?: string;
  timestamp: string;
}

export interface PendingUrlAction {
  id: string;
  url: string;
  label: string;
}

export interface DirectorDecision {
  id: string;
  source: TriggerSource;
  requested: string;
  resolved: string;
  outcome:
    | 'played'
    | 'ignored_cooldown'
    | 'ignored_per_clip_cooldown'
    | 'ignored_not_speaking'
    | 'ignored_priority'
    | 'ignored_debounce'
    | 'ignored_same_clip'
    | 'idle_loop';
  reason: string;
  timestamp: string;
}

export interface DirectorSnapshot {
  characterState: CharacterState;
  activeClipId: string;
  activeBadge: string;
  activeSource: TriggerSource;
  cooldownRemainingMs: number;
  isOverridePlaying: boolean;
  lastDecision: DirectorDecision | null;
  recentDecisions: DirectorDecision[];
}

export type BridgeSecurityLevel = 'A' | 'B' | 'C';

export type BridgeActivityStatus =
  | 'executed'
  | 'pending_approval'
  | 'approved'
  | 'denied'
  | 'blocked'
  | 'error'
  | 'emergency_stopped';

export interface BridgeTaintState {
  active: boolean;
  sourceLabel: string;
  recordedAt: string | null;
  expiresAt: string | null;
}

export interface BridgeAllowedApp {
  id: string;
  label: string;
  command: string;
  args?: string[];
}

export interface BridgeSettings {
  allowedFolders: string[];
  allowedApps: BridgeAllowedApp[];
}

export interface BridgePendingApproval {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  level: BridgeSecurityLevel;
  escalatedFromTaint: boolean;
  taintOrigin?: string;
  createdAt: string;
  expiresAt: string;
}

export interface BridgeActivityItem {
  id: string;
  time: string;
  tool: string;
  args: Record<string, unknown>;
  level: BridgeSecurityLevel;
  status: BridgeActivityStatus;
  summary: string;
  result?: string;
  taintOrigin?: string;
}

export interface BridgeStatePayload {
  ok: boolean;
  emergencyStopped: boolean;
  taintState: BridgeTaintState;
  settings: BridgeSettings;
  pendingApprovals: BridgePendingApproval[];
  activities: BridgeActivityItem[];
}

export type VoiceEmotion = 'neutral' | 'stressed' | 'cheerful' | 'hurried' | 'tired';

export interface AffectionState {
  level: number;
  xp: number;
  maxExp: number;
  title: string;
  streakDays: number;
  hearts: number;
  lastActiveDate: string;
}

export interface GazeCoordinates {
  x: number;
  y: number;
  isContact: boolean;
  fatigueScore: number;
  attentionScore: number;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  category: 'person' | 'project' | 'habit' | 'goal' | 'preference' | 'concept';
  importance: number;
}

export interface KnowledgeGraphLink {
  source: string;
  target: string;
  relation: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  mood: string;
  akaneNote: string;
  achievements: string[];
}

export interface FlashcardItem {
  id: string;
  question: string;
  answer: string;
  subject?: string;
  lastReviewed?: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

export interface MeetingScribeSession {
  id: string;
  title: string;
  createdAt: string;
  transcript: string[];
  summary: string;
  actionItems: string[];
}

export interface SystemWatchdogData {
  cpuUsagePercent: number;
  ramUsagePercent: number;
  batteryLevelPercent?: number;
  isCharging?: boolean;
  status: 'nominal' | 'warning' | 'critical';
  alertMessage?: string;
  lastAlertTime?: string;
}

export interface PomodoroState {
  active: boolean;
  phase: 'focus' | 'break';
  timeLeftSeconds: number;
  completedCycles: number;
}

export interface DeStressState {
  active: boolean;
  phase: 'inhale' | 'hold' | 'exhale' | 'rest';
  timeLeftSeconds: number;
  cycleCount: number;
}


