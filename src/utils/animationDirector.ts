import {
  MIN_NON_SPEECH_STILLNESS_MS,
  pickTalkClipForMood,
  resolveReactionOrClip,
} from '../config/videoManifest';
import type {
  AkaneManifest,
  CharacterState,
  DirectorDecision,
  DirectorSnapshot,
  ResolvedManifestClip,
  TalkMood,
  TriggerSource,
} from '../types/akane';

export const ROUTINE_IGNORED_EMOTIONS = new Set([
  'none',
  'idle',
  'wait',
  'neutral',
  'calm',
]);

export const EMOTIONAL_TOOL_KEYS = new Set([
  'greet',
  'goodbye',
  'happy',
  'cheer',
  'giggle',
  'laugh',
  'comfort',
  'sad',
  'worried',
  'proud',
  'shy',
  'blush',
  'tease',
  'scold',
  'annoyed',
  'pout',
  'surprised',
  'sleepy',
  'hug',
  'shake_no',
  'dance',
  '1_greet',
]);

export interface DirectorRequest {
  clipId: string;
  source: TriggerSource;
  reason?: string;
  isModelSpeaking?: boolean;
  bypassCooldown?: boolean;
  urgent?: boolean;
  eventKey?: string;
  mood?: TalkMood;
}

export interface DirectorAction {
  type: 'play' | 'return_idle' | 'noop';
  clip?: ResolvedManifestClip;
  state?: CharacterState;
  decision: DirectorDecision;
}

export class AnimationDirectorEngine {
  private characterState: CharacterState = 'idle';
  private activeClip: ResolvedManifestClip;
  private activeSource: TriggerSource = 'idle';
  private isPlayingNonIdle = false;
  private lastNonIdleClipId: string | null = null;
  private lastNonSpeechEndedAt = 0;
  private lastEventKey = '';
  private lastEventKeyAt = 0;
  private queued: { req: DirectorRequest; enqueuedAt: number } | null = null;
  private speechClipPlayedInUtterance = false;
  private recentDecisions: DirectorDecision[] = [];
  private debugEnabled: boolean;
  private onDebugLine?: (line: string) => void;

  constructor(
    private manifest: AkaneManifest,
    opts?: { debug?: boolean; onDebugLine?: (line: string) => void }
  ) {
    this.activeClip = manifest.clips.idle[0];
    this.debugEnabled = Boolean(opts?.debug);
    this.onDebugLine = opts?.onDebugLine;
  }

  public setManifest(manifest: AkaneManifest): void {
    this.manifest = manifest;
    if (this.characterState === 'idle') {
      this.activeClip = manifest.clips.idle[0];
    }
  }

  public setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  public getState(): {
    characterState: CharacterState;
    activeClip: ResolvedManifestClip;
    activeSource: TriggerSource;
    isPlayingNonIdle: boolean;
    queued: boolean;
  } {
    return {
      characterState: this.characterState,
      activeClip: this.activeClip,
      activeSource: this.activeSource,
      isPlayingNonIdle: this.isPlayingNonIdle,
      queued: Boolean(this.queued),
    };
  }

  public getSnapshot(now = Date.now()): DirectorSnapshot {
    const restRem = this.isPlayingNonIdle
      ? MIN_NON_SPEECH_STILLNESS_MS
      : Math.max(0, MIN_NON_SPEECH_STILLNESS_MS - (now - this.lastNonSpeechEndedAt));

    return {
      characterState: this.characterState,
      activeClipId: this.activeClip.id,
      activeBadge: this.activeClip.badgeLabel,
      activeSource: this.activeSource,
      cooldownRemainingMs: restRem,
      isOverridePlaying: this.isPlayingNonIdle,
      lastDecision: this.recentDecisions[0] ?? null,
      recentDecisions: this.recentDecisions,
    };
  }

  private emitDecision(
    source: TriggerSource,
    requested: string,
    resolved: string,
    outcome: DirectorDecision['outcome'],
    reason: string,
    now: number
  ): DirectorDecision {
    const accepted = outcome === 'played' || outcome === 'idle_loop';
    const decision: DirectorDecision = {
      id: `dir_${now}_${Math.random().toString(36).slice(2, 6)}`,
      source,
      requested,
      resolved,
      outcome,
      reason,
      timestamp: new Date(now).toISOString(),
    };
    this.recentDecisions = [decision, ...this.recentDecisions].slice(0, 20);

    const logLine = `[AnimationDirector] ${source}, ${resolved}, ${
      accepted ? 'accepted' : 'ignored'
    }, ${reason}`;
    if (this.debugEnabled) {
      if (this.onDebugLine) {
        this.onDebugLine(logLine);
      } else {
        console.log(logLine);
      }
    }
    return decision;
  }

  public resetUtteranceSpeechGate(): void {
    this.speechClipPlayedInUtterance = false;
  }

  public forceReturnToStill(reason: string, now = Date.now()): DirectorAction {
    const wasNonSpeech =
      this.isPlayingNonIdle && this.activeClip.category !== 'talk';
    if (wasNonSpeech) {
      this.lastNonSpeechEndedAt = now;
    }

    this.isPlayingNonIdle = false;
    this.characterState = 'idle';
    this.activeSource = 'idle';
    this.activeClip = this.manifest.clips.idle[0];

    const decision = this.emitDecision(
      'idle',
      this.activeClip.id,
      this.activeClip.id,
      'idle_loop',
      reason,
      now
    );

    return {
      type: 'return_idle',
      clip: this.activeClip,
      state: 'idle',
      decision,
    };
  }

  public onClipEnded(now = Date.now()): DirectorAction {
    if (!this.isPlayingNonIdle) {
      return {
        type: 'noop',
        decision: {
          id: `dir_${now}`,
          source: 'idle',
          requested: this.activeClip.id,
          resolved: this.activeClip.id,
          outcome: 'idle_loop',
          reason: 'Already in still idle',
          timestamp: new Date(now).toISOString(),
        },
      };
    }

    const finished = this.activeClip;
    const isNonSpeech = finished.category !== 'talk';
    if (isNonSpeech) {
      this.lastNonSpeechEndedAt = now;
    }

    this.isPlayingNonIdle = false;
    this.characterState = 'idle';
    this.activeSource = 'idle';
    this.activeClip = this.manifest.clips.idle[0];

    const decision = this.emitDecision(
      'idle',
      this.activeClip.id,
      this.activeClip.id,
      'idle_loop',
      `Clip ${finished.id} ended -> returned to still idle`,
      now
    );

    return {
      type: 'return_idle',
      clip: this.activeClip,
      state: 'idle',
      decision,
    };
  }

  public checkQueuedTrigger(now = Date.now()): DirectorAction | null {
    if (!this.queued) return null;
    if (this.isPlayingNonIdle) return null;

    // Drop stale queued item after 8 seconds
    if (now - this.queued.enqueuedAt > 8_000) {
      const stale = this.queued;
      this.queued = null;
      this.emitDecision(
        stale.req.source,
        stale.req.clipId,
        this.activeClip.id,
        'ignored_debounce',
        `Dropped stale queued ${stale.req.clipId} after 8s`,
        now
      );
      return null;
    }

    const restElapsed = now - this.lastNonSpeechEndedAt;
    if (restElapsed < MIN_NON_SPEECH_STILLNESS_MS) {
      return null;
    }

    const next = this.queued;
    this.queued = null;
    return this.requestClip(next.req, now);
  }

  public requestClip(req: DirectorRequest, now = Date.now()): DirectorAction {
    const {
      clipId,
      source,
      reason = 'Triggered',
      isModelSpeaking = false,
      bypassCooldown = false,
      urgent = false,
      eventKey,
      mood = 'neutral',
    } = req;

    if (source === 'idle') {
      return this.forceReturnToStill(reason, now);
    }

    // Disallow automatic VAD listening clip triggers — listening holds still idle cleanly
    if (source === 'vad') {
      const decision = this.emitDecision(
        source,
        clipId,
        clipId,
        'ignored_priority',
        'Listening holds still idle pose',
        now
      );
      return { type: 'noop', decision };
    }

    // Ignore routine/neutral tool calls or tool calls without real speaking or emotion
    if (source === 'tool') {
      const norm = clipId.trim().toLowerCase();
      if (ROUTINE_IGNORED_EMOTIONS.has(norm) || !EMOTIONAL_TOOL_KEYS.has(norm)) {
        const decision = this.emitDecision(
          source,
          clipId,
          clipId,
          'ignored_priority',
          `Ignored routine/non-emotional tool call (${clipId})`,
          now
        );
        return { type: 'noop', decision };
      }
      if (!isModelSpeaking && !urgent && !bypassCooldown) {
        const decision = this.emitDecision(
          source,
          clipId,
          clipId,
          'ignored_not_speaking',
          'Ignored tool call when model audio is not active',
          now
        );
        return { type: 'noop', decision };
      }
    }

    // Resolve target clip
    let resolved: ResolvedManifestClip | null = null;
    if (source === 'audio' || clipId.startsWith('talk')) {
      if (this.speechClipPlayedInUtterance && !bypassCooldown) {
        const decision = this.emitDecision(
          source,
          clipId,
          clipId,
          'ignored_debounce',
          'At most one talk clip per utterance; keeping current/still',
          now
        );
        return { type: 'noop', decision };
      }
      resolved = pickTalkClipForMood(
        this.manifest,
        mood,
        this.lastNonIdleClipId
      );
    } else {
      resolved = resolveReactionOrClip(this.manifest, clipId, {
        lastClipId: bypassCooldown ? null : this.lastNonIdleClipId,
        respectPerClipCooldown: false,
      });
    }

    if (!resolved || resolved.category === 'idle') {
      const decision = this.emitDecision(
        source,
        clipId,
        clipId,
        'ignored_priority',
        `Unknown or idle clip "${clipId}"`,
        now
      );
      return { type: 'noop', decision };
    }

    // Never play the same non-idle clip twice in a row
    if (!bypassCooldown && resolved.id === this.lastNonIdleClipId) {
      const decision = this.emitDecision(
        source,
        clipId,
        resolved.id,
        'ignored_same_clip',
        `Prevented repeat of ${resolved.id} twice in a row`,
        now
      );
      return { type: 'noop', decision };
    }

    // Never play two reaction clips for one event
    if (
      resolved.category !== 'talk' &&
      eventKey &&
      this.lastEventKey === eventKey &&
      now - this.lastEventKeyAt < 10_000
    ) {
      const decision = this.emitDecision(
        source,
        clipId,
        resolved.id,
        'ignored_debounce',
        `Prevented chained reaction for same event (${eventKey})`,
        now
      );
      return { type: 'noop', decision };
    }

    const isNonSpeech = resolved.category !== 'talk';
    const elapsedSinceNonSpeechEnd = now - this.lastNonSpeechEndedAt;
    const in6sStillnessRest =
      isNonSpeech &&
      this.lastNonSpeechEndedAt > 0 &&
      elapsedSinceNonSpeechEnd < MIN_NON_SPEECH_STILLNESS_MS;

    // Urgent vision/user wave may replace an active talk clip immediately, but never chain after another reaction during 6s rest
    const canPreemptTalk =
      (urgent || source === 'vision' || source === 'user') &&
      this.isPlayingNonIdle &&
      this.activeClip.category === 'talk' &&
      !in6sStillnessRest;

    if (!bypassCooldown && ((this.isPlayingNonIdle && !canPreemptTalk) || in6sStillnessRest)) {
      const blockReason = this.isPlayingNonIdle
        ? `Clip ${this.activeClip.id} currently playing`
        : `6s stillness rest active (${Math.ceil(
            (MIN_NON_SPEECH_STILLNESS_MS - elapsedSinceNonSpeechEnd) / 1000
          )}s left)`;

      // Never queue another reaction while resting/reacting for tool calls (prevent chaining!)
      if (source === 'tool' || (this.isPlayingNonIdle && this.activeClip.category !== 'talk')) {
        const decision = this.emitDecision(
          source,
          clipId,
          resolved.id,
          in6sStillnessRest ? 'ignored_cooldown' : 'ignored_priority',
          `Dropped: ${blockReason}`,
          now
        );
        return { type: 'noop', decision };
      }

      // Queue max 1 (drop any older queued trigger)
      const replacedNote = this.queued ? ` (replaced older queued ${this.queued.req.clipId})` : '';
      this.queued = { req, enqueuedAt: now };
      const decision = this.emitDecision(
        source,
        clipId,
        resolved.id,
        in6sStillnessRest ? 'ignored_cooldown' : 'ignored_priority',
        `Queued (max 1): ${blockReason}${replacedNote}`,
        now
      );
      return { type: 'noop', decision };
    }

    // Accepted — start playback (1 clip at a time)
    if (source === 'audio' || resolved.category === 'talk') {
      this.speechClipPlayedInUtterance = true;
    }
    if (isNonSpeech && eventKey) {
      this.lastEventKey = eventKey;
      this.lastEventKeyAt = now;
    }

    this.isPlayingNonIdle = true;
    this.activeClip = resolved;
    this.activeSource = source;
    this.lastNonIdleClipId = resolved.id;
    this.characterState = resolved.category === 'talk' ? 'speaking' : 'reacting';

    const decision = this.emitDecision(
      source,
      clipId,
      resolved.id,
      'played',
      reason,
      now
    );

    return {
      type: 'play',
      clip: resolved,
      state: this.characterState,
      decision,
    };
  }
}
