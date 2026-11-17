import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  DEFAULT_CHROMA_TOLERANCE,
  getCachedClipPlayableUrl,
  getManifestSync,
  loadAkaneManifest,
  preloadClipToMemory,
  preloadCoreClips,
} from '../config/videoManifest';
import { AnimationDirectorEngine } from '../utils/animationDirector';
import type {
  AkaneManifest,
  AvatarActivityState,
  AvatarRenderMode,
  CharacterState,
  CompanionMode,
  DirectorDecision,
  DirectorSnapshot,
  GazeCoordinates,
  OutfitStyle,
  ResolvedManifestClip,
  TalkMood,
  TriggerSource,
} from '../types/akane';

export interface TriggerRequestOptions {
  source: TriggerSource;
  reason?: string;
  isModelSpeaking?: boolean;
  bypassCooldown?: boolean;
  urgent?: boolean;
  eventKey?: string;
}

export interface AkaneVideoCharacterHandle {
  requestClip: (clipId: string, options: TriggerRequestOptions) => DirectorDecision;
  getSnapshot: () => DirectorSnapshot;
}

export interface AkaneVideoCharacterProps {
  activityState: AvatarActivityState;
  audioLevel: number;
  isUserSpeaking: boolean;
  interruptedSeq: number;
  outfitStyle: OutfitStyle;
  mood?: TalkMood;
  framingZoom?: number;
  framingOffsetY?: number;
  gaze?: GazeCoordinates;
  avatarRenderMode?: AvatarRenderMode;
  companionMode?: CompanionMode;
  onAvatarClick?: () => void;
  onSnapshotChange?: (snapshot: DirectorSnapshot) => void;
}

interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Pre-measured tight foreground bounds for Akane 720x1280 still/neutral pose (with headroom + arm margin)
const DEFAULT_CROP_RECT: CropRect = {
  left: 0.215,
  top: 0.185,
  width: 0.57,
  height: 0.607,
};

const CROSSFADE_MS = 150;
const RELEASE_INACTIVE_DELAY_MS = 190;
const AUDIO_PLAY_THRESHOLD = 0.018;
const AUDIO_START_HOLD_MS = 80;
const AUDIO_SILENCE_STOP_MS = 350;
const BREATHING_CYCLE_MS = 4500;

const DEFAULT_KEY_COLOR: [number, number, number] = [0.09, 0.94, 0.08];

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  uniform sampler2D u_texA;
  uniform sampler2D u_texB;
  uniform float u_mix;
  uniform vec3 u_keyColorA;
  uniform vec3 u_keyColorB;
  uniform float u_toleranceA;
  uniform float u_toleranceB;
  uniform vec4 u_cropRect;
  uniform int u_outfitMode;
  varying vec2 v_texCoord;

  vec4 chromaKeySample(sampler2D tex, vec2 uv, vec3 keyCol, float tolerance) {
    vec4 color = texture2D(tex, uv);
    float r = color.r;
    float g = color.g;
    float b = color.b;

    float maxRB = max(r, b);
    float greenExcess = g - maxRB;

    float chromaDist = length(vec2(r - keyCol.r, b - keyCol.b));
    float keyStrength = greenExcess - chromaDist * 0.45;

    float lowEdge = max(0.03, tolerance * 0.50);
    float highEdge = max(lowEdge + 0.06, tolerance * 1.35);
    float alpha = 1.0 - smoothstep(lowEdge, highEdge, keyStrength);

    float luminance = (r + g + b) / 3.0;
    if (luminance > 0.74 && greenExcess < tolerance * 1.15) {
      alpha = 1.0;
    }

    float spillFactor = smoothstep(0.015, highEdge, greenExcess);
    float cleanG = mix(g, min(g, maxRB * 0.95 + 0.015), spillFactor);
    vec3 rgb = vec3(r, cleanG, b);

    if (alpha > 0.02 && alpha < 0.95) {
      rgb = mix(rgb * 0.92, rgb, alpha);
    }

    if (u_outfitMode != 0) {
      float redness = r - max(cleanG, b);
      float isCrimsonGarment = smoothstep(0.08, 0.22, redness) * (1.0 - smoothstep(0.45, 0.75, cleanG));
      if (u_outfitMode == 1) {
        vec3 indigo = vec3(rgb.b * 0.55 + 0.10, rgb.g * 0.65 + 0.08, rgb.r * 0.85 + 0.16);
        rgb = mix(rgb, indigo, isCrimsonGarment * 0.85);
      } else if (u_outfitMode == 2) {
        vec3 sakura = vec3(min(1.0, rgb.r * 1.05 + 0.10), min(1.0, rgb.g * 0.95 + 0.16), min(1.0, rgb.b * 1.05 + 0.20));
        rgb = mix(rgb, sakura, isCrimsonGarment * 0.80);
      }
    }

    return vec4(rgb, alpha);
  }

  void main() {
    vec2 croppedUv = vec2(
      u_cropRect.x + v_texCoord.x * u_cropRect.z,
      u_cropRect.y + v_texCoord.y * u_cropRect.w
    );
    vec4 colA = chromaKeySample(u_texA, croppedUv, u_keyColorA, u_toleranceA);
    vec4 colB = chromaKeySample(u_texB, croppedUv, u_keyColorB, u_toleranceB);
    vec4 blended = mix(colA, colB, u_mix);
    gl_FragColor = vec4(blended.rgb * blended.a, blended.a);
  }
`;

const SAMPLE_CORNER_FRAG_SRC = `
  precision mediump float;
  uniform sampler2D u_tex;
  void main() {
    vec4 c1 = texture2D(u_tex, vec2(0.02, 0.02));
    vec4 c2 = texture2D(u_tex, vec2(0.98, 0.02));
    gl_FragColor = (c1 + c2) * 0.5;
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

function releaseVideoElement(vid: HTMLVideoElement | null): void {
  if (!vid) return;
  try {
    vid.pause();
    vid.loop = false;
    vid.removeAttribute('src');
    vid.load();
  } catch {
    // Ignore cleanup errors
  }
}

function computeBoundingBoxFromVideo(vid: HTMLVideoElement): CropRect | null {
  try {
    if (vid.videoWidth === 0 || vid.videoHeight === 0) return null;
    const sw = 180;
    const sh = Math.max(180, Math.round(sw * (vid.videoHeight / vid.videoWidth)));
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0, sw, sh);
    const pixels = ctx.getImageData(0, 0, sw, sh).data;

    let minX = sw;
    let maxX = 0;
    let minY = sh;
    let maxY = 0;
    let hits = 0;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const greenExcess = g - Math.max(r, b);
        if (greenExcess < 36) {
          hits++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (hits < 80 || maxX <= minX || maxY <= minY) return null;

    const nMinX = minX / sw;
    const nMaxX = maxX / sw;
    const nMinY = minY / sh;
    const nMaxY = maxY / sh;

    // Keep head & raised hands safely inside while anchoring bottom edge tight
    const top = Math.max(0, nMinY - 0.032);
    const bottom = Math.min(1, nMaxY + 0.008);
    const height = Math.max(0.35, bottom - top);

    const rawWidth = nMaxX - nMinX;
    const centerX = (nMinX + nMaxX) * 0.5;
    const width = Math.min(1, Math.max(rawWidth * 1.65, height * 0.66));
    const left = Math.max(0, Math.min(1 - width, centerX - width * 0.5));

    return { left, top, width, height };
  } catch {
    return null;
  }
}

export const AkaneVideoCharacter = React.forwardRef<
  AkaneVideoCharacterHandle,
  AkaneVideoCharacterProps
>(function AkaneVideoCharacter(
  {
    activityState,
    audioLevel,
    isUserSpeaking,
    interruptedSeq,
    outfitStyle,
    mood = 'neutral',
    framingZoom = 1.0,
    framingOffsetY = 0,
    gaze = { x: 0, y: 0, isContact: true, fatigueScore: 0, attentionScore: 1 },
    avatarRenderMode = 'hybrid',
    companionMode = 'cheerful_friend',
    onAvatarClick,
    onSnapshotChange,
  },
  ref
) {
  const initialManifest = getManifestSync();
  const initialIdle = initialManifest.clips.idle[0];

  const gazeX = gaze?.x || 0;
  const gazeY = gaze?.y || 0;
  const [sway, setSway] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let animId: number;
    const startTime = performance.now();
    const update = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const breath = Math.sin(elapsed * 1.5) * 3.2;
      const swayX = Math.sin(elapsed * 0.75) * 2.2 + gazeX * 9;
      const swayY = breath + gazeY * 5.5;
      setSway({ x: swayX, y: swayY });
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [gazeX, gazeY]);

  const [manifest, setManifest] = useState<AkaneManifest>(initialManifest);
  const [activeClip, setActiveClip] = useState<ResolvedManifestClip>(initialIdle);
  const [characterState, setCharacterState] = useState<CharacterState>('idle');
  const [cropRect, setCropRect] = useState<CropRect>(DEFAULT_CROP_RECT);
  const [stageDims, setStageDims] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const [webglReady, setWebglReady] = useState(true);

  const stageOuterRef = useRef<HTMLDivElement | null>(null);
  const breathingLayerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);

  const directorRef = useRef<AnimationDirectorEngine>(
    new AnimationDirectorEngine(initialManifest, { debug: isDebugEnabled() })
  );

  const manifestRef = useRef<AkaneManifest>(initialManifest);
  const outfitRef = useRef<OutfitStyle>(outfitStyle);
  const moodRef = useRef<TalkMood>(mood);
  const activityRef = useRef<AvatarActivityState>(activityState);
  const cropRectRef = useRef<CropRect>(DEFAULT_CROP_RECT);
  const hasComputedCropRef = useRef<boolean>(false);
  const prefersReducedMotionRef = useRef<boolean>(prefersReducedMotion);

  outfitRef.current = outfitStyle;
  moodRef.current = mood;
  activityRef.current = activityState;
  prefersReducedMotionRef.current = prefersReducedMotion;

  const activeSlotRef = useRef<0 | 1>(0);
  const mixProgressRef = useRef<number>(0);
  const mixStartValueRef = useRef<number>(0);
  const mixStartTimeRef = useRef<number>(0);
  const mixTargetRef = useRef<number>(0);

  const slotClipIdsRef = useRef<[string, string]>([initialIdle.id, '']);
  const slotToleranceRef = useRef<[number, number]>([
    initialIdle.chromaTolerance,
    DEFAULT_CHROMA_TOLERANCE,
  ]);
  const slotKeyColorRef = useRef<[[number, number, number], [number, number, number]]>([
    [...DEFAULT_KEY_COLOR],
    [...DEFAULT_KEY_COLOR],
  ]);
  const keyColorCacheRef = useRef<Map<string, [number, number, number]>>(new Map());
  const pendingCornerSampleSlotRef = useRef<[boolean, boolean]>([true, false]);

  const characterStateRef = useRef<CharacterState>('idle');
  const activeClipRef = useRef<ResolvedManifestClip>(initialIdle);
  const isTabHiddenRef = useRef<boolean>(false);
  const videoFrameReadyRef = useRef<boolean>(false);

  const safetyTimerRef = useRef<number | null>(null);
  const releaseHiddenTimerRef = useRef<number | null>(null);
  const audioStartTimerRef = useRef<number | null>(null);
  const audioSilenceTimerRef = useRef<number | null>(null);
  const queueCheckTimerRef = useRef<number | null>(null);
  const prevInterruptedSeqRef = useRef<number>(interruptedSeq);
  const prevUserSpeakingRef = useRef<boolean>(isUserSpeaking);

  const clearPlaybackTimers = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (releaseHiddenTimerRef.current !== null) {
      window.clearTimeout(releaseHiddenTimerRef.current);
      releaseHiddenTimerRef.current = null;
    }
  }, []);

  const clearSpeechGateTimers = useCallback(() => {
    if (audioStartTimerRef.current !== null) {
      window.clearTimeout(audioStartTimerRef.current);
      audioStartTimerRef.current = null;
    }
    if (audioSilenceTimerRef.current !== null) {
      window.clearTimeout(audioSilenceTimerRef.current);
      audioSilenceTimerRef.current = null;
    }
  }, []);

  const publishSnapshot = useCallback(() => {
    onSnapshotChange?.(directorRef.current.getSnapshot());
  }, [onSnapshotChange]);

  const scheduleReleaseInactiveSlot = useCallback((inactiveSlot: 0 | 1) => {
    if (releaseHiddenTimerRef.current !== null) {
      window.clearTimeout(releaseHiddenTimerRef.current);
    }
    releaseHiddenTimerRef.current = window.setTimeout(() => {
      if (activeSlotRef.current === inactiveSlot) return;
      const inactiveVid = inactiveSlot === 0 ? videoARef.current : videoBRef.current;
      slotClipIdsRef.current[inactiveSlot] = '';
      pendingCornerSampleSlotRef.current[inactiveSlot] = false;
      releaseVideoElement(inactiveVid);
    }, RELEASE_INACTIVE_DELAY_MS);
  }, []);

  const startCrossfadeToSlot = useCallback(
    (nextSlot: 0 | 1, prevSlot: 0 | 1) => {
      activeSlotRef.current = nextSlot;
      mixStartValueRef.current = mixProgressRef.current;
      mixStartTimeRef.current = performance.now();
      mixTargetRef.current = nextSlot;
      scheduleReleaseInactiveSlot(prevSlot);
    },
    [scheduleReleaseInactiveSlot]
  );

  const loadSlotAndDisplay = useCallback(
    (
      slot: 0 | 1,
      clip: ResolvedManifestClip,
      freezeFrameZero: boolean,
      onReadyToFade: () => void
    ) => {
      const vid = slot === 0 ? videoARef.current : videoBRef.current;
      if (!vid) return;

      vid.muted = true;
      vid.playsInline = true;
      vid.loop = false;

      slotToleranceRef.current[slot] = clip.chromaTolerance || DEFAULT_CHROMA_TOLERANCE;
      const cachedColor = keyColorCacheRef.current.get(clip.id);
      if (cachedColor) {
        slotKeyColorRef.current[slot] = cachedColor;
        pendingCornerSampleSlotRef.current[slot] = false;
      } else {
        slotKeyColorRef.current[slot] = [...DEFAULT_KEY_COLOR];
        pendingCornerSampleSlotRef.current[slot] = true;
      }

      const startDecodeAndDisplay = (playableUrl: string) => {
        if (slotClipIdsRef.current[slot] !== clip.id) {
          slotClipIdsRef.current[slot] = clip.id;
          vid.src = playableUrl;
          vid.load();
        } else {
          try {
            vid.currentTime = 0;
          } catch {
            // Ignore seek failure
          }
        }

        const begin = () => {
          try {
            vid.currentTime = 0;
            if (freezeFrameZero) {
              vid.pause();
            } else if (!isTabHiddenRef.current) {
              const p = vid.play();
              if (p && typeof p.catch === 'function') {
                p.catch(() => {});
              }
            }
          } catch {
            // Ignore playback restriction
          }
          onReadyToFade();
        };

        if (vid.readyState >= 2) {
          begin();
        } else {
          const onLoadedData = () => {
            vid.removeEventListener('loadeddata', onLoadedData);
            begin();
          };
          vid.addEventListener('loadeddata', onLoadedData, { once: true });
        }
      };

      const cachedBlobUrl = getCachedClipPlayableUrl(clip.src);
      if (cachedBlobUrl !== clip.src) {
        startDecodeAndDisplay(cachedBlobUrl);
      } else {
        void preloadClipToMemory(clip.src).then(() => {});
        startDecodeAndDisplay(clip.src);
      }
    },
    []
  );

  const executeDirectorAction = useCallback(
    (action: ReturnType<AnimationDirectorEngine['requestClip']>) => {
      if (action.type === 'noop' || !action.clip) {
        publishSnapshot();
        return;
      }

      clearPlaybackTimers();
      const targetClip = action.clip;
      const nextState = action.state ?? 'idle';
      const isIdle = nextState === 'idle';

      characterStateRef.current = nextState;
      activeClipRef.current = targetClip;
      setCharacterState(nextState);
      setActiveClip(targetClip);
      publishSnapshot();

      const prevSlot = activeSlotRef.current;
      const nextSlot: 0 | 1 = prevSlot === 0 ? 1 : 0;

      // Freeze idle_1 cleanly at neutral frame 0 (no looping!); play non-idle clips once
      loadSlotAndDisplay(nextSlot, targetClip, isIdle, () => {
        startCrossfadeToSlot(nextSlot, prevSlot);
      });

      if (!isIdle) {
        safetyTimerRef.current = window.setTimeout(() => {
          if (activeClipRef.current.id !== targetClip.id) return;
          const resetAction = directorRef.current.forceReturnToStill(
            `Safety timeout after ${targetClip.id} -> returned to still`
          );
          executeDirectorAction(resetAction);
        }, targetClip.fallbackDurationMs + 2000);
      }
    },
    [clearPlaybackTimers, loadSlotAndDisplay, publishSnapshot, startCrossfadeToSlot]
  );

  const handleVideoEnded = useCallback(
    (slotIdx: 0 | 1) => {
      if (slotIdx !== activeSlotRef.current) return;
      if (characterStateRef.current === 'idle') return;
      const action = directorRef.current.onClipEnded();
      executeDirectorAction(action);
    },
    [executeDirectorAction]
  );

  const requestClip = useCallback(
    (clipId: string, options: TriggerRequestOptions): DirectorDecision => {
      const action = directorRef.current.requestClip({
        clipId,
        source: options.source,
        reason: options.reason,
        isModelSpeaking: options.isModelSpeaking,
        bypassCooldown: options.bypassCooldown,
        urgent: options.urgent,
        eventKey: options.eventKey,
        mood: moodRef.current,
      });
      executeDirectorAction(action);
      return action.decision;
    },
    [executeDirectorAction]
  );

  useImperativeHandle(
    ref,
    () => ({
      requestClip,
      getSnapshot: () => directorRef.current.getSnapshot(),
    }),
    [requestClip]
  );

  // Sync manifest + preload core clips
  useEffect(() => {
    const controller = new AbortController();
    void loadAkaneManifest().then((loaded) => {
      if (controller.signal.aborted) return;
      manifestRef.current = loaded;
      directorRef.current.setManifest(loaded);
      setManifest(loaded);
      void preloadCoreClips(loaded, controller.signal);
    });
    return () => controller.abort();
  }, []);

  // Poll at most 1 queued trigger only when needed (every 300ms)
  useEffect(() => {
    queueCheckTimerRef.current = window.setInterval(() => {
      if (!directorRef.current.getState().queued) return;
      const nextAction = directorRef.current.checkQueuedTrigger();
      if (nextAction) {
        executeDirectorAction(nextAction);
      }
    }, 300);
    return () => {
      if (queueCheckTimerRef.current !== null) {
        window.clearInterval(queueCheckTimerRef.current);
      }
    };
  }, [executeDirectorAction]);

  // Respect prefers-reduced-motion dynamically
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefersReducedMotion(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Track stage container size across resize + orientationchange
  useEffect(() => {
    const el = stageOuterRef.current;
    const measure = () => {
      if (el) {
        setStageDims({
          width: el.clientWidth || window.innerWidth,
          height: el.clientHeight || window.innerHeight,
        });
      } else {
        setStageDims({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    };
    measure();

    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  // Barge-in / user interruption stops speech talk clip back to still idle cleanly
  useEffect(() => {
    const seqChanged = interruptedSeq !== prevInterruptedSeqRef.current;
    prevInterruptedSeqRef.current = interruptedSeq;

    const userInterruptedSpeaking =
      isUserSpeaking &&
      !prevUserSpeakingRef.current &&
      characterStateRef.current === 'speaking';
    prevUserSpeakingRef.current = isUserSpeaking;

    if (seqChanged || userInterruptedSpeaking) {
      clearSpeechGateTimers();
      directorRef.current.resetUtteranceSpeechGate();
      if (characterStateRef.current === 'speaking') {
        const action = directorRef.current.forceReturnToStill(
          'User interrupted speech -> returned to still'
        );
        executeDirectorAction(action);
      }
    }
  }, [clearSpeechGateTimers, executeDirectorAction, interruptedSeq, isUserSpeaking]);

  // Speaking gate: max 1 talk clip per utterance (>80ms audio), return to still on 350ms silence
  useEffect(() => {
    const audioActive = audioLevel > AUDIO_PLAY_THRESHOLD;

    if (audioActive) {
      if (audioSilenceTimerRef.current !== null) {
        window.clearTimeout(audioSilenceTimerRef.current);
        audioSilenceTimerRef.current = null;
      }

      if (
        !directorRef.current.getState().isPlayingNonIdle &&
        audioStartTimerRef.current === null
      ) {
        audioStartTimerRef.current = window.setTimeout(() => {
          audioStartTimerRef.current = null;
          if (directorRef.current.getState().isPlayingNonIdle) return;
          requestClip(`talk:${moodRef.current}`, {
            source: 'audio',
            reason: `Utterance started (>80ms audio, mood=${moodRef.current})`,
          });
        }, AUDIO_START_HOLD_MS);
      }
      return;
    }

    if (audioStartTimerRef.current !== null) {
      window.clearTimeout(audioStartTimerRef.current);
      audioStartTimerRef.current = null;
    }

    if (activityState !== 'speaking' && audioSilenceTimerRef.current === null) {
      audioSilenceTimerRef.current = window.setTimeout(() => {
        audioSilenceTimerRef.current = null;
        directorRef.current.resetUtteranceSpeechGate();
        if (characterStateRef.current === 'speaking') {
          const action = directorRef.current.forceReturnToStill(
            'Audio silent 350ms -> returned to still'
          );
          executeDirectorAction(action);
        }
      }, AUDIO_SILENCE_STOP_MS);
    }
  }, [activityState, audioLevel, executeDirectorAction, requestClip]);

  useEffect(() => {
    return () => {
      clearSpeechGateTimers();
    };
  }, [clearSpeechGateTimers]);

  // WebGL Chroma-Key + Bounding-Box Crop + Subtle Sine Breathing
  useEffect(() => {
    const canvas = canvasRef.current;
    const vidA = videoARef.current;
    const vidB = videoBRef.current;
    if (!canvas || !vidA || !vidB) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });

    if (!gl) {
      setWebglReady(false);
      return;
    }

    const vertMain = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fragMain = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    const vertCorner = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fragCorner = compileShader(gl, gl.FRAGMENT_SHADER, SAMPLE_CORNER_FRAG_SRC);

    if (!vertMain || !fragMain || !vertCorner || !fragCorner) {
      setWebglReady(false);
      return;
    }

    const mainProgram = gl.createProgram();
    const cornerProgram = gl.createProgram();
    if (!mainProgram || !cornerProgram) {
      setWebglReady(false);
      return;
    }

    gl.attachShader(mainProgram, vertMain);
    gl.attachShader(mainProgram, fragMain);
    gl.linkProgram(mainProgram);

    gl.attachShader(cornerProgram, vertCorner);
    gl.attachShader(cornerProgram, fragCorner);
    gl.linkProgram(cornerProgram);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
      gl.STATIC_DRAW
    );

    const bindQuadForProgram = (prog: WebGLProgram) => {
      gl.useProgram(prog);
      const pLoc = gl.getAttribLocation(prog, 'a_position');
      if (pLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);
      }
      const tLoc = gl.getAttribLocation(prog, 'a_texCoord');
      if (tLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.enableVertexAttribArray(tLoc);
        gl.vertexAttribPointer(tLoc, 2, gl.FLOAT, false, 0, 0);
      }
    };

    const createVideoTexture = (unit: number) => {
      const tex = gl.createTexture();
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0])
      );
      return tex;
    };

    const texA = createVideoTexture(gl.TEXTURE0);
    const texB = createVideoTexture(gl.TEXTURE1);

    const sampleTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sampleTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const sampleFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      sampleTex,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const cornerPixel = new Uint8Array(4);
    const sampleCornerKeyFromTexture = (texUnitIdx: 0 | 1, clipId: string) => {
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFbo);
        gl.viewport(0, 0, 1, 1);
        bindQuadForProgram(cornerProgram);
        const uTex = gl.getUniformLocation(cornerProgram, 'u_tex');
        gl.uniform1i(uTex, texUnitIdx);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, cornerPixel);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (
          cornerPixel[3] > 200 &&
          cornerPixel[1] > cornerPixel[0] &&
          cornerPixel[1] > cornerPixel[2]
        ) {
          const rgb: [number, number, number] = [
            cornerPixel[0] / 255,
            cornerPixel[1] / 255,
            cornerPixel[2] / 255,
          ];
          keyColorCacheRef.current.set(clipId, rgb);
          slotKeyColorRef.current[texUnitIdx] = rgb;
          return;
        }
      } catch {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      slotKeyColorRef.current[texUnitIdx] = [...DEFAULT_KEY_COLOR];
    };

    const uTexA = gl.getUniformLocation(mainProgram, 'u_texA');
    const uTexB = gl.getUniformLocation(mainProgram, 'u_texB');
    const uMix = gl.getUniformLocation(mainProgram, 'u_mix');
    const uKeyColorA = gl.getUniformLocation(mainProgram, 'u_keyColorA');
    const uKeyColorB = gl.getUniformLocation(mainProgram, 'u_keyColorB');
    const uToleranceA = gl.getUniformLocation(mainProgram, 'u_toleranceA');
    const uToleranceB = gl.getUniformLocation(mainProgram, 'u_toleranceB');
    const uCropRect = gl.getUniformLocation(mainProgram, 'u_cropRect');
    const uOutfitMode = gl.getUniformLocation(mainProgram, 'u_outfitMode');

    let rafId = 0;
    let isDisposed = false;
    let needsUploadStill = false;

    const render = (nowMs: number) => {
      if (isDisposed || isTabHiddenRef.current) {
        rafId = 0;
        return;
      }

      const refVid = activeSlotRef.current === 0 ? vidA : vidB;
      if (refVid.videoWidth > 0 && refVid.videoHeight > 0) {
        // Compute tight non-green character bounding box once from first decoded frame
        if (!hasComputedCropRef.current && refVid.readyState >= 2) {
          hasComputedCropRef.current = true;
          const computed = computeBoundingBoxFromVideo(refVid);
          if (computed) {
            cropRectRef.current = computed;
            setCropRect(computed);
          }
        }

        const crop = cropRectRef.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        const croppedVideoW = Math.max(1, refVid.videoWidth * crop.width);
        const croppedVideoH = Math.max(1, refVid.videoHeight * crop.height);
        const desiredW = rect.width > 0 ? Math.round(rect.width * dpr) : croppedVideoW;
        const targetW = Math.min(croppedVideoW * 2, Math.max(320, desiredW));
        const targetH = Math.round(targetW * (croppedVideoH / croppedVideoW));

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
      }

      // 150ms crossfade progression
      if (mixProgressRef.current !== mixTargetRef.current) {
        const elapsed = Math.max(0, nowMs - mixStartTimeRef.current);
        const t = Math.min(1, elapsed / CROSSFADE_MS);
        mixProgressRef.current =
          mixStartValueRef.current +
          (mixTargetRef.current - mixStartValueRef.current) * t;
      }

      // Subtle breathing life ONLY in still idle pose (scale 1.000 -> 1.006, 1-2px Y shift over 4.5s)
      const breathEl = breathingLayerRef.current;
      if (breathEl) {
        if (characterStateRef.current === 'idle' && !prefersReducedMotionRef.current) {
          const theta = ((nowMs % BREATHING_CYCLE_MS) / BREATHING_CYCLE_MS) * Math.PI * 2;
          const wave = (1 - Math.cos(theta)) * 0.5;
          const bScale = 1 + 0.006 * wave;
          const bShiftY = -1.5 * wave;
          breathEl.style.transform = `translate3d(0, ${bShiftY.toFixed(2)}px, 0) scale(${bScale.toFixed(5)})`;
        } else {
          breathEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
        }
      }

      // Upload video textures actively while playing a non-idle clip or finishing crossfade / first idle frame
      const isActiveMotion =
        characterStateRef.current !== 'idle' ||
        mixProgressRef.current !== mixTargetRef.current ||
        needsUploadStill ||
        !videoFrameReadyRef.current;

      let uploadedAny = false;
      if (isActiveMotion) {
        if (vidA.readyState >= 2) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texA);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vidA);
          uploadedAny = true;
          if (pendingCornerSampleSlotRef.current[0] && slotClipIdsRef.current[0]) {
            pendingCornerSampleSlotRef.current[0] = false;
            sampleCornerKeyFromTexture(0, slotClipIdsRef.current[0]);
          }
        }
        if (vidB.readyState >= 2) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, texB);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vidB);
          uploadedAny = true;
          if (pendingCornerSampleSlotRef.current[1] && slotClipIdsRef.current[1]) {
            pendingCornerSampleSlotRef.current[1] = false;
            sampleCornerKeyFromTexture(1, slotClipIdsRef.current[1]);
          }
        }
        needsUploadStill = false;
      } else if (videoFrameReadyRef.current) {
        // Re-draw static frozen idle frame cleanly when resizing or switching outfit
        uploadedAny = true;
      }

      if (uploadedAny) {
        const crop = cropRectRef.current;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        bindQuadForProgram(mainProgram);

        const outfitInt =
          outfitRef.current === 'outfit_1'
            ? 1
            : outfitRef.current === 'outfit_2'
              ? 2
              : 0;

        gl.uniform1i(uTexA, 0);
        gl.uniform1i(uTexB, 1);
        gl.uniform1f(uMix, mixProgressRef.current);
        gl.uniform3fv(uKeyColorA, slotKeyColorRef.current[0]);
        gl.uniform3fv(uKeyColorB, slotKeyColorRef.current[1]);
        gl.uniform1f(uToleranceA, slotToleranceRef.current[0]);
        gl.uniform1f(uToleranceB, slotToleranceRef.current[1]);
        gl.uniform4f(uCropRect, crop.left, crop.top, crop.width, crop.height);
        gl.uniform1i(uOutfitMode, outfitInt);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!videoFrameReadyRef.current) {
          videoFrameReadyRef.current = true;
          setVideoFrameReady(true);
        }
      }

      rafId = window.requestAnimationFrame(render);
    };

    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      isTabHiddenRef.current = hidden;
      const activeVid = activeSlotRef.current === 0 ? vidA : vidB;
      if (hidden) {
        if (rafId !== 0) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
        try {
          activeVid.pause();
        } catch {
          // Ignore
        }
      } else {
        if (characterStateRef.current !== 'idle') {
          try {
            activeVid.play().catch(() => {});
          } catch {
            // Ignore
          }
        }
        needsUploadStill = true;
        if (rafId === 0 && !isDisposed) {
          rafId = window.requestAnimationFrame(render);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    isTabHiddenRef.current = document.hidden;

    // Load idle_1.mp4 strictly on neutral frame 0 (no looping!)
    const bootIdle = manifestRef.current.clips.idle[0];
    slotClipIdsRef.current = [bootIdle.id, ''];
    slotToleranceRef.current[0] = bootIdle.chromaTolerance;
    pendingCornerSampleSlotRef.current[0] = true;

    vidA.muted = true;
    vidA.playsInline = true;
    vidA.loop = false;
    vidA.src = getCachedClipPlayableUrl(bootIdle.src);
    vidA.load();
    const onBootIdleFrame = () => {
      try {
        vidA.currentTime = 0;
        vidA.pause();
      } catch {
        // Ignore
      }
      needsUploadStill = true;
    };
    vidA.addEventListener('loadeddata', onBootIdleFrame, { once: true });

    if (!document.hidden) {
      rafId = window.requestAnimationFrame(render);
    }

    return () => {
      isDisposed = true;
      vidA.removeEventListener('loadeddata', onBootIdleFrame);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      clearPlaybackTimers();
      releaseVideoElement(vidA);
      releaseVideoElement(vidB);
      gl.deleteFramebuffer(sampleFbo);
      gl.deleteTexture(sampleTex);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteBuffer(posBuffer);
      gl.deleteBuffer(texCoordBuffer);
      gl.deleteProgram(mainProgram);
      gl.deleteProgram(cornerProgram);
      gl.deleteShader(vertMain);
      gl.deleteShader(fragMain);
      gl.deleteShader(vertCorner);
      gl.deleteShader(fragCorner);
    };
  }, [clearPlaybackTimers]);

  useEffect(() => {
    publishSnapshot();
  }, [activeClip, characterState, publishSnapshot]);

  // Height-first bottom-anchored responsive scaling:
  // Mobile (portrait < 768px): ~93% of stage height; Desktop: ~90% of stage height
  const isMobileViewport = stageDims.width < 768;
  const baseHeightFraction = isMobileViewport ? 0.93 : 0.90;
  const clampedZoom = Math.min(1.4, Math.max(1.0, framingZoom));
  const croppedAspect =
    (cropRect.width * 720) / Math.max(1, cropRect.height * 1280);
  const frameHeightPx = Math.max(
    260,
    Math.round(stageDims.height * baseHeightFraction * clampedZoom)
  );
  const frameWidthPx = Math.round(frameHeightPx * croppedAspect);

  return (
    <div
      ref={stageOuterRef}
      className="relative z-10 w-full h-full flex items-end justify-center overflow-hidden pointer-events-none"
    >
      {/* Permanent dual hidden video buffers (never remounted; inactive released after 150ms fade) */}
      <video
        ref={videoARef}
        muted
        playsInline
        preload="auto"
        onEnded={() => handleVideoEnded(0)}
        className="hidden"
      />
      <video
        ref={videoBRef}
        muted
        playsInline
        preload="auto"
        onEnded={() => handleVideoEnded(1)}
        className="hidden"
      />

      {/* Responsive bottom-anchored frame box with user zoom/vertical offset and smooth floating physics */}
      <div
        onClick={onAvatarClick}
        className="relative shrink-0 overflow-hidden cursor-pointer pointer-events-auto"
        style={{
          width: `${frameWidthPx}px`,
          height: `${frameHeightPx}px`,
          transform: `translate3d(${sway.x * 0.35}px, ${sway.y * 0.45 + framingOffsetY}px, 0)`,
          transition: 'transform 0.15s ease-out',
        }}
      >
        {/* Subtle breathing layer active only during idle still pose */}
        <div
          ref={breathingLayerRef}
          className="relative w-full h-full origin-bottom"
        >
          {/* Instant still image cropped identically until WebGL draws frame 0 */}
          <div
            className={`absolute inset-0 overflow-hidden transition-opacity duration-200 ${
              videoFrameReady && webglReady ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <img
              src={manifest.still}
              alt="Akane resting pose"
              className="absolute max-w-none drop-shadow-[0_18px_45px_rgba(0,0,0,0.65)]"
              style={{
                width: `${(1 / cropRect.width) * 100}%`,
                height: `${(1 / cropRect.height) * 100}%`,
                left: `${-(cropRect.left / cropRect.width) * 100}%`,
                top: `${-(cropRect.top / cropRect.height) * 100}%`,
              }}
            />
          </div>

          {webglReady ? (
            <canvas
              ref={canvasRef}
              className={`w-full h-full block drop-shadow-[0_18px_45px_rgba(0,0,0,0.65)] transition-opacity duration-200 ${
                videoFrameReady ? 'opacity-100' : 'opacity-0'
              }`}
              aria-label={`Akane (${activeClip.badgeLabel})`}
            />
          ) : (
            <div className="mb-20 px-6 py-4 rounded-2xl bg-rose-950/50 border border-rose-500/30 text-xs text-rose-100">
              WebGL Chroma Key unavailable in this browser context.
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
