import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArabicDialect,
  AvatarActivityState,
  ChatTurn,
  CompanionMode,
  LiveConnectionState,
  MemoryStore,
  MemoryV2Item,
  MemoryV2Kind,
  MissionItem,
  MissionPriority,
  OutfitStyle,
  PendingUrlAction,
  PersonaBoundaries,
} from '../types/akane';
import { isSecureMediaContext, formatMediaError } from './useVisionLayer';

interface UseAkaneLiveOptions {
  mode: CompanionMode;
  dialect?: ArabicDialect;
  boundaries?: PersonaBoundaries;
  incognito?: boolean;
  memory: MemoryStore;
  missions: MissionItem[];
  memoryV2Top10: MemoryV2Item[];
  followUpItem: MemoryV2Item | null;
  isStudying: boolean;
  adultConfirmed: boolean;
  getAuthToken: (forceRefresh?: boolean) => Promise<string | null>;
  onToolClip: (
    clipId: string,
    reason: string,
    isModelSpeaking: boolean,
    urgent?: boolean,
    eventKey?: string
  ) => void;
  onToolOutfit: (outfit: OutfitStyle) => void;
  onSaveMemoryV2: (input: {
    kind: MemoryV2Kind;
    content: string;
    dueAt?: string;
    importance?: number;
    source: 'voice' | 'chat';
  }) => void;
  onManageMission: (
    action: 'create' | 'complete' | 'delete',
    payload: {
      title?: string;
      description?: string;
      priority?: MissionPriority;
      missionId?: string;
    }
  ) => void;
  onOpenUrl: (action: PendingUrlAction) => void;
  onDesktopTool?: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ handled: boolean; summary: string; data?: Record<string, unknown> }>;
  onVoiceConfirmCheck?: (spokenText: string) => boolean;
  onFollowUpUsed?: (memoryId: string) => void;
  onSessionEnd?: (sessionTurns: ChatTurn[]) => void;
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function upsertTurn(prev: ChatTurn[], nextTurn: ChatTurn): ChatTurn[] {
  const idx = prev.findIndex((t) => t.id === nextTurn.id);
  if (idx >= 0) {
    const updated = [...prev];
    updated[idx] = nextTurn;
    return updated;
  }
  return [...prev, nextTurn].slice(-30);
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function useAkaneLive({
  mode,
  dialect = 'ar_eg',
  boundaries,
  incognito = false,
  memory,
  missions,
  memoryV2Top10,
  followUpItem,
  isStudying,
  adultConfirmed,
  getAuthToken,
  onToolClip,
  onToolOutfit,
  onSaveMemoryV2,
  onManageMission,
  onOpenUrl,
  onDesktopTool,
  onVoiceConfirmCheck,
  onFollowUpUsed,
  onSessionEnd,
}: UseAkaneLiveOptions) {
  const [liveState, setLiveState] = useState<LiveConnectionState>('disconnected');
  const [activityState, setActivityState] = useState<AvatarActivityState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [interruptedSeq, setInterruptedSeq] = useState(0);
  const [isSendingText, setIsSendingText] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [liveCaption, setLiveCaption] = useState<string>('');

  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isReconnectingVisible, setIsReconnectingVisible] = useState(false);
  const [isCalmPaused, setIsCalmPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const pendingOutputCaptionRef = useRef<string>('');
  const currentLiveTurnIdRef = useRef<string | null>(null);
  const turnSeqRef = useRef<number>(0);
  const userSpeechTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectBannerTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const manualDisconnectRef = useRef<boolean>(false);
  const wasConnectedRef = useRef<boolean>(false);
  const lastAudioChunkAtRef = useRef<number>(0);
  const lastConversationActivityRef = useRef<number>(Date.now());
  const silencePromptSentForIdleRef = useRef<boolean>(false);
  const greetingSentSessionIdRef = useRef<number>(0);
  const wakeGreetingPendingRef = useRef<boolean>(false);

  const isSessionOpeningRef = useRef<boolean>(false);
  const sessionCounterRef = useRef<number>(0);
  const activeSessionIdRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  const turnsRef = useRef<ChatTurn[]>(turns);

  const memoryRef = useRef(memory);
  const missionsRef = useRef(missions);
  const memoryV2Top10Ref = useRef(memoryV2Top10);
  const followUpItemRef = useRef(followUpItem);
  const modeRef = useRef(mode);
  const dialectRef = useRef(dialect);
  const boundariesRef = useRef(boundaries);
  const incognitoRef = useRef(incognito);
  const isStudyingRef = useRef(isStudying);
  const adultConfirmedRef = useRef(adultConfirmed);
  const isMutedRef = useRef(isMuted);
  const isPausedRef = useRef(isPaused);
  const isCalmPausedRef = useRef(isCalmPaused);
  const activityRef = useRef(activityState);
  const getAuthTokenRef = useRef(getAuthToken);
  const onDesktopToolRef = useRef(onDesktopTool);
  const onVoiceConfirmCheckRef = useRef(onVoiceConfirmCheck);
  const onFollowUpUsedRef = useRef(onFollowUpUsed);
  const onSessionEndRef = useRef(onSessionEnd);

  turnsRef.current = turns;
  memoryRef.current = memory;
  missionsRef.current = missions;
  memoryV2Top10Ref.current = memoryV2Top10;
  followUpItemRef.current = followUpItem;
  modeRef.current = mode;
  dialectRef.current = dialect;
  boundariesRef.current = boundaries;
  incognitoRef.current = incognito;
  isStudyingRef.current = isStudying;
  adultConfirmedRef.current = adultConfirmed;
  isMutedRef.current = isMuted;
  isPausedRef.current = isPaused;
  isCalmPausedRef.current = isCalmPaused;
  activityRef.current = activityState;
  getAuthTokenRef.current = getAuthToken;
  onDesktopToolRef.current = onDesktopTool;
  onVoiceConfirmCheckRef.current = onVoiceConfirmCheck;
  onFollowUpUsedRef.current = onFollowUpUsed;
  onSessionEndRef.current = onSessionEnd;

  const ensureSingleAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // iOS Safari audio playback unlock on first user interaction
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  const clearScheduledAudio = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      nextStartTimeRef.current = audioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const clearUserSpeaking = useCallback(() => {
    if (userSpeechTimerRef.current !== null) {
      window.clearTimeout(userSpeechTimerRef.current);
      userSpeechTimerRef.current = null;
    }
    setIsUserSpeaking(false);
  }, []);

  const markUserSpeaking = useCallback(() => {
    lastConversationActivityRef.current = Date.now();
    silencePromptSentForIdleRef.current = false;
    setIsUserSpeaking(true);
    if (userSpeechTimerRef.current !== null) {
      window.clearTimeout(userSpeechTimerRef.current);
    }
    userSpeechTimerRef.current = window.setTimeout(() => {
      userSpeechTimerRef.current = null;
      setIsUserSpeaking(false);
    }, 950);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (reconnectBannerTimerRef.current !== null) {
      window.clearTimeout(reconnectBannerTimerRef.current);
      reconnectBannerTimerRef.current = null;
    }
  }, []);

  const sendVideoFrame = useCallback((base64Jpeg: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (isMutedRef.current || isPausedRef.current) return;
    try {
      ws.send(
        JSON.stringify({
          type: 'video',
          data: base64Jpeg,
          mimeType: 'image/jpeg',
        })
      );
    } catch {
      // Ignore transient WS frame send failure
    }
  }, []);

  const sendLiveSystemText = useCallback((systemText: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (isPausedRef.current) return;
    try {
      ws.send(JSON.stringify({ type: 'text', text: systemText }));
    } catch {
      // Ignore transient WS text send failure
    }
  }, []);

  // Sync updated tasks to active live session for get_tasks accuracy
  useEffect(() => {
    const ws = wsRef.current;
    if (liveState === 'connected' && ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'tasks_sync', missions }));
      } catch {
        // Ignore
      }
    }
  }, [liveState, missions]);

  const isModelCurrentlySpeaking = useCallback((forceSpeaking = false) => {
    if (forceSpeaking) return true;
    if (activityRef.current === 'speaking') return true;
    if (activeSourcesRef.current.size > 0) return true;
    return Date.now() - lastAudioChunkAtRef.current < 1500;
  }, []);

  const handleServerToolCall = useCallback(
    (
      name: string,
      args: Record<string, unknown>,
      source: 'voice' | 'chat' = 'voice',
      forceSpeaking = false,
      callId?: string
    ) => {
      const speakingNow = isModelCurrentlySpeaking(forceSpeaking);

      if (name.startsWith('desktop_') && onDesktopToolRef.current) {
        void onDesktopToolRef.current(name, args).then((res) => {
          if (
            callId &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            try {
              wsRef.current.send(
                JSON.stringify({
                  type: 'tool_result',
                  callId,
                  result: {
                    status: 'ok',
                    summary: res.summary,
                    ...(res.data ? { data: res.data } : {}),
                  },
                })
              );
            } catch {
              // Ignore WS send failure
            }
          }
        });
        return;
      }

      if (
        name === 'emotion_set' ||
        name === 'set_expression' ||
        name === 'trigger_akane_expression'
      ) {
        const emotion =
          typeof args.emotion === 'string'
            ? args.emotion
            : typeof args.expression === 'string'
              ? args.expression
              : '';
        if (!emotion || emotion === 'none') return;
        const reason =
          typeof args.reason === 'string' ? args.reason : 'Model emotion_set tool call';
        const isUrgent =
          emotion === 'greet' || emotion === 'goodbye' || emotion === 'cheer';
        onToolClip(
          emotion,
          reason,
          speakingNow,
          isUrgent,
          `${source}_turn_${turnSeqRef.current}`
        );
      } else if (name === 'play_gesture') {
        const gesture = typeof args.gesture === 'string' ? args.gesture : '';
        if (!gesture) return;
        const reason =
          typeof args.reason === 'string' ? args.reason : 'Model play_gesture tool call';
        onToolClip(
          gesture,
          reason,
          speakingNow,
          gesture === '1_greet' || gesture === 'cheer',
          `${source}_turn_${turnSeqRef.current}`
        );
      } else if (name === 'change_outfit') {
        const outfit = args.outfit;
        if (outfit === 'default' || outfit === 'outfit_1' || outfit === 'outfit_2') {
          onToolOutfit(outfit);
        }
      } else if (name === 'remember') {
        const rawKind = typeof args.kind === 'string' ? args.kind : 'fact';
        const kind: MemoryV2Kind =
          rawKind === 'preference' || rawKind === 'event' || rawKind === 'open_loop'
            ? rawKind
            : 'fact';
        const content = typeof args.content === 'string' ? args.content.trim() : '';
        const dueAt = typeof args.dueAt === 'string' ? args.dueAt.trim() : undefined;
        const importance =
          typeof args.importance === 'number' && Number.isFinite(args.importance)
            ? args.importance
            : undefined;
        if (content) {
          onSaveMemoryV2({
            kind,
            content,
            dueAt,
            importance,
            source,
          });
        }
      } else if (name === 'add_task') {
        const title = typeof args.title === 'string' ? args.title.trim() : '';
        if (title) {
          onManageMission('create', {
            title,
            description:
              typeof args.description === 'string' ? args.description : undefined,
            priority:
              args.priority === 'low' || args.priority === 'high'
                ? args.priority
                : 'medium',
          });
        }
      } else if (name === 'open_url') {
        const rawUrl = typeof args.url === 'string' ? args.url.trim() : '';
        const label =
          typeof args.label === 'string' && args.label.trim()
            ? args.label.trim()
            : rawUrl;
        if (onDesktopToolRef.current) {
          void onDesktopToolRef.current(name, args).then((res) => {
            if (
              callId &&
              wsRef.current &&
              wsRef.current.readyState === WebSocket.OPEN
            ) {
              try {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'tool_result',
                    callId,
                    result: { status: 'ok', summary: res.summary },
                  })
                );
              } catch {
                // Ignore
              }
            }
          });
        }
        if (/^https?:\/\//i.test(rawUrl)) {
          onOpenUrl({
            id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            url: rawUrl,
            label,
          });
        }
      }
    },
    [
      isModelCurrentlySpeaking,
      onManageMission,
      onOpenUrl,
      onSaveMemoryV2,
      onToolClip,
      onToolOutfit,
    ]
  );

  const play24kPcmChunk = useCallback(
    (base64: string, sessionId: number) => {
      if (sessionId !== activeSessionIdRef.current) return;
      try {
        const ctx = ensureSingleAudioContext();
        const float32 = base64Pcm16ToFloat32(base64);
        if (float32.length === 0) return;

        console.log(`[audio] play chunk from session ${sessionId}`);

        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.copyToChannel(new Float32Array(float32), 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const startTime = Math.max(ctx.currentTime + 0.015, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + buffer.duration;

        lastAudioChunkAtRef.current = Date.now();
        lastConversationActivityRef.current = Date.now();
        silencePromptSentForIdleRef.current = false;
        activeSourcesRef.current.add(source);
        setActivityState('speaking');

        let sum = 0;
        for (let i = 0; i < float32.length; i += 8) {
          sum += float32[i] * float32[i];
        }
        const rms = Math.sqrt(sum / Math.max(1, Math.floor(float32.length / 8)));
        setAudioLevel(Math.min(1, rms * 3.5));

        source.onended = () => {
          activeSourcesRef.current.delete(source);
          if (activeSourcesRef.current.size === 0) {
            setAudioLevel(0);
            setActivityState(wsRef.current ? 'listening' : 'idle');
          }
        };
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? `Audio playback error: ${err.message}`
            : 'Audio playback failed.'
        );
      }
    },
    [ensureSingleAudioContext]
  );

  const cleanupAudioAndSocket = useCallback(
    (nextState: LiveConnectionState = 'disconnected') => {
      clearScheduledAudio();

      if (processorRef.current) {
        try {
          processorRef.current.onaudioprocess = null;
          processorRef.current.disconnect();
        } catch {
          // Ignore
        }
        processorRef.current = null;
      }

      if (micSourceRef.current) {
        try {
          micSourceRef.current.disconnect();
        } catch {
          // Ignore
        }
        micSourceRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // Ignore
          }
        });
        mediaStreamRef.current = null;
      }

      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'Client closed');
          }
        } catch {
          // Ignore
        }
      }

      pendingOutputCaptionRef.current = '';
      currentLiveTurnIdRef.current = null;
      clearUserSpeaking();
      setAudioLevel(0);
      setLiveState(nextState);
      setActivityState('idle');
    },
    [clearScheduledAudio, clearUserSpeaking]
  );

  const disconnectLive = useCallback(
    (preserveCalmFlag = false) => {
      const hadSession = wasConnectedRef.current && turnsRef.current.length > 0;
      const snapshotTurns = hadSession ? [...turnsRef.current] : [];

      manualDisconnectRef.current = true;
      wasConnectedRef.current = false;
      reconnectAttemptsRef.current = 0;
      isSessionOpeningRef.current = false;
      activeSessionIdRef.current = 0;
      clearReconnectTimer();
      setIsReconnectingVisible(false);
      if (!preserveCalmFlag) {
        setIsCalmPaused(false);
      }
      setIsMuted(false);
      setIsPaused(false);
      cleanupAudioAndSocket('disconnected');

      if (hadSession && snapshotTurns.length > 0) {
        onSessionEndRef.current?.(snapshotTurns);
      }
    },
    [cleanupAudioAndSocket, clearReconnectTimer]
  );

  const startLiveSession = useCallback(
    async (isRetry = false) => {
      if (isSessionOpeningRef.current) return;
      isSessionOpeningRef.current = true;

      if (!isRetry) {
        manualDisconnectRef.current = false;
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        setIsReconnectingVisible(false);
      }

      cleanupAudioAndSocket(isRetry ? 'reconnecting' : 'connecting');

      const sessionId = ++sessionCounterRef.current;
      activeSessionIdRef.current = sessionId;
      console.log(`[audio] start session ${sessionId}`);

      try {
        if (!adultConfirmedRef.current) {
          throw new Error('Please confirm you are 18+ before starting a live session.');
        }

        // Synchronous iOS audio unlock inside direct tap handler before async awaits
        const audioCtx = ensureSingleAudioContext();

        const rawToken = await getAuthTokenRef.current();
        const idToken = rawToken || 'guest_local_user';

        if (!isSecureMediaContext()) {
          throw new Error(
            'Live microphone requires HTTPS or localhost. Plain HTTP cannot open the mic.'
          );
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone API unavailable in this browser context.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (
          !mountedRef.current ||
          manualDisconnectRef.current ||
          sessionId !== activeSessionIdRef.current
        ) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/live?token=${encodeURIComponent(idToken)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        let receivedServerError: string | null = null;

        const scheduleReconnectIfTransient = (reasonMsg: string) => {
          if (sessionId !== activeSessionIdRef.current) return;
          if (manualDisconnectRef.current || !mountedRef.current) return;
          if (!wasConnectedRef.current) {
            setErrorMessage(reasonMsg);
            cleanupAudioAndSocket('error');
            return;
          }
          const attempt = reconnectAttemptsRef.current + 1;
          if (attempt > 3) {
            clearReconnectTimer();
            setIsReconnectingVisible(false);
            setErrorMessage(`${reasonMsg} (reconnect failed after 3 attempts)`);
            wasConnectedRef.current = false;
            cleanupAudioAndSocket('error');
            return;
          }
          reconnectAttemptsRef.current = attempt;
          const delayMs = 900 * Math.pow(1.8, attempt - 1);
          cleanupAudioAndSocket('reconnecting');
          if (reconnectBannerTimerRef.current === null) {
            reconnectBannerTimerRef.current = window.setTimeout(() => {
              reconnectBannerTimerRef.current = null;
              setIsReconnectingVisible(true);
            }, 3000);
          }
          if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!manualDisconnectRef.current && mountedRef.current) {
              void startLiveSession(true);
            }
          }, delayMs);
        };

        ws.onopen = () => {
          if (sessionId !== activeSessionIdRef.current) {
            try {
              ws.close(1000, 'Stale session');
            } catch {
              // Ignore
            }
            return;
          }
          try {
            ws.send(
              JSON.stringify({
                type: 'init',
                mode: modeRef.current,
                memory: memoryRef.current,
                missions: missionsRef.current,
                memoryV2Top10: memoryV2Top10Ref.current,
                followUpItem: followUpItemRef.current,
                isStudying: isStudyingRef.current,
                adultConfirmed: adultConfirmedRef.current,
                dialect: dialectRef.current,
                boundaries: boundariesRef.current,
                incognito: incognitoRef.current,
              })
            );
          } catch (err) {
            scheduleReconnectIfTransient(
              err instanceof Error ? err.message : 'Failed to initialize live stream.'
            );
          }
        };

        ws.onmessage = (event) => {
          if (sessionId !== activeSessionIdRef.current) return;
          try {
            const msg = JSON.parse(event.data as string) as {
              type?: string;
              audio?: string;
              text?: string;
              callId?: string;
              name?: string;
              args?: Record<string, unknown>;
              error?: string;
              retryable?: boolean;
              code?: number;
              reason?: string;
            };

            if (msg.type === 'ready') {
              wasConnectedRef.current = true;
              reconnectAttemptsRef.current = 0;
              clearReconnectTimer();
              setIsReconnectingVisible(false);
              setIsCalmPaused(false);
              lastConversationActivityRef.current = Date.now();
              silencePromptSentForIdleRef.current = false;
              setErrorMessage(null);
              setLiveState('connected');
              setActivityState('listening');

              if (followUpItemRef.current) {
                onFollowUpUsedRef.current?.(followUpItemRef.current.id);
              }

              // Proactivity rule: warm wake or time-based greeting + optional ONE follow-up
              const pendingWake = wakeGreetingPendingRef.current;
              wakeGreetingPendingRef.current = false;
              if (
                pendingWake ||
                (!isRetry &&
                  !isStudyingRef.current &&
                  greetingSentSessionIdRef.current !== sessionId)
              ) {
                greetingSentSessionIdRef.current = sessionId;
                window.setTimeout(() => {
                  if (
                    sessionId === activeSessionIdRef.current &&
                    ws.readyState === WebSocket.OPEN &&
                    !isStudyingRef.current &&
                    !isPausedRef.current
                  ) {
                    const cue = pendingWake
                      ? '[user woke you up after quiet pause — greet him warmly in 1 short gentle sentence]'
                      : followUpItemRef.current
                        ? `[session started — greet him warmly for the time of day and weave in ONE natural follow-up question about "${followUpItemRef.current.content}"]`
                        : '[session started — give him a short, lively time-of-day greeting in 1-2 sentences]';
                    ws.send(JSON.stringify({ type: 'text', text: cue }));
                  }
                }, 600);
              }

              if (processorRef.current) {
                try {
                  processorRef.current.disconnect();
                } catch {
                  // Ignore
                }
              }
              if (micSourceRef.current) {
                try {
                  micSourceRef.current.disconnect();
                } catch {
                  // Ignore
                }
              }

              const source = audioCtx.createMediaStreamSource(stream);
              const processor = audioCtx.createScriptProcessor(4096, 1, 1);
              micSourceRef.current = source;
              processorRef.current = processor;
              source.connect(processor);
              processor.connect(audioCtx.destination);

              processor.onaudioprocess = (e) => {
                if (sessionId !== activeSessionIdRef.current) return;
                if (ws.readyState !== WebSocket.OPEN) return;
                if (isMutedRef.current || isPausedRef.current) return;
                try {
                  const rawChannel = e.inputBuffer.getChannelData(0);
                  let micSum = 0;
                  for (let i = 0; i < rawChannel.length; i += 8) {
                    micSum += rawChannel[i] * rawChannel[i];
                  }
                  const micRms = Math.sqrt(
                    micSum / Math.max(1, Math.floor(rawChannel.length / 8))
                  );
                  if (micRms > 0.028) {
                    markUserSpeaking();
                    if (micRms > 0.05 && activeSourcesRef.current.size > 0) {
                      clearScheduledAudio();
                      setAudioLevel(0);
                      setActivityState('listening');
                      setInterruptedSeq((seq) => seq + 1);
                    }
                  }
                  const resampled = downsampleTo16k(rawChannel, audioCtx.sampleRate);
                  const base64 = float32ToPcm16Base64(resampled);
                  ws.send(JSON.stringify({ type: 'audio', audio: base64 }));
                } catch {
                  // Ignore single audio frame error
                }
              };
            } else if (msg.type === 'audio' && msg.audio) {
              if (!isPausedRef.current) {
                play24kPcmChunk(msg.audio, sessionId);
              }
            } else if (msg.type === 'input_transcript' && msg.text) {
              markUserSpeaking();
              onVoiceConfirmCheckRef.current?.(msg.text);
            } else if (msg.type === 'interrupted') {
              clearScheduledAudio();
              pendingOutputCaptionRef.current = '';
              currentLiveTurnIdRef.current = null;
              setAudioLevel(0);
              setActivityState('listening');
              setInterruptedSeq((seq) => seq + 1);
              markUserSpeaking();
            } else if (msg.type === 'output_transcript' && msg.text) {
              lastConversationActivityRef.current = Date.now();
              if (!currentLiveTurnIdRef.current) {
                currentLiveTurnIdRef.current = `live_${sessionId}_${++turnSeqRef.current}`;
              }
              pendingOutputCaptionRef.current += msg.text;
              setLiveCaption(pendingOutputCaptionRef.current.trim());
            } else if (msg.type === 'turn_complete') {
              const finalized = pendingOutputCaptionRef.current.trim();
              const turnId =
                currentLiveTurnIdRef.current ||
                `live_${sessionId}_${++turnSeqRef.current}`;
              if (finalized) {
                lastConversationActivityRef.current = Date.now();
                setTurns((prev) =>
                  upsertTurn(prev, {
                    id: turnId,
                    role: 'akane',
                    text: finalized,
                    timestamp: new Date().toISOString(),
                  })
                );
              }
              pendingOutputCaptionRef.current = '';
              currentLiveTurnIdRef.current = null;
            } else if (msg.type === 'tool_call' && msg.name) {
              handleServerToolCall(msg.name, msg.args ?? {}, 'voice', false, msg.callId);
            } else if (msg.type === 'error') {
              const detail = msg.error || 'Gemini Live connection failed.';
              receivedServerError = detail;
              if (msg.retryable && wasConnectedRef.current) {
                scheduleReconnectIfTransient(detail);
              } else {
                wasConnectedRef.current = false;
                setErrorMessage(detail);
                cleanupAudioAndSocket('error');
              }
            } else if (msg.type === 'closed') {
              if (msg.retryable && wasConnectedRef.current) {
                scheduleReconnectIfTransient(
                  msg.reason || `Live stream closed (code ${msg.code ?? 1006})`
                );
              } else if (receivedServerError) {
                setErrorMessage(receivedServerError);
                cleanupAudioAndSocket('error');
              } else {
                cleanupAudioAndSocket('disconnected');
              }
            }
          } catch {
            // Ignore malformed packet
          }
        };

        ws.onerror = () => {
          if (sessionId !== activeSessionIdRef.current || wsRef.current !== ws) return;
          scheduleReconnectIfTransient(
            receivedServerError || 'WebSocket connection to /live failed.'
          );
        };

        ws.onclose = (ev) => {
          if (sessionId !== activeSessionIdRef.current || wsRef.current !== ws) return;
          if (ev.code === 1008) {
            wasConnectedRef.current = false;
            setErrorMessage(ev.reason || 'Sign in required for Live voice.');
            cleanupAudioAndSocket('error');
            return;
          }
          if (!manualDisconnectRef.current && ev.code !== 1000) {
            scheduleReconnectIfTransient(
              receivedServerError ||
                ev.reason ||
                `Live WebSocket closed unexpectedly (code ${ev.code})`
            );
          } else if (receivedServerError) {
            setErrorMessage(receivedServerError);
            cleanupAudioAndSocket('error');
          } else {
            cleanupAudioAndSocket('disconnected');
          }
        };
      } catch (err) {
        if (sessionId === activeSessionIdRef.current) {
          setErrorMessage(formatMediaError(err, 'Microphone'));
          cleanupAudioAndSocket('error');
        }
      } finally {
        isSessionOpeningRef.current = false;
      }
    },
    [
      cleanupAudioAndSocket,
      clearReconnectTimer,
      clearScheduledAudio,
      ensureSingleAudioContext,
      handleServerToolCall,
      markUserSpeaking,
      play24kPcmChunk,
    ]
  );

  const enterCalmMode = useCallback(() => {
    setIsCalmPaused(true);
    disconnectLive(true);
  }, [disconnectLive]);

  // Silence proactivity (75s check-in) + Calm mode (120s auto-pause to save cost)
  useEffect(() => {
    if (liveState !== 'connected') return;
    const timer = window.setInterval(() => {
      if (isCalmPausedRef.current || activityRef.current === 'speaking') {
        return;
      }
      const idleMs = Date.now() - lastConversationActivityRef.current;

      if (idleMs >= 120_000) {
        enterCalmMode();
        return;
      }

      if (
        !isStudyingRef.current &&
        !isPausedRef.current &&
        !isMutedRef.current &&
        !silencePromptSentForIdleRef.current &&
        idleMs >= 75_000
      ) {
        silencePromptSentForIdleRef.current = true;
        sendLiveSystemText(
          '[user has been quiet for ~75s — offer one short, affectionate, playful check-in]'
        );
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [enterCalmMode, liveState, sendLiveSystemText]);

  const connectLive = useCallback(async () => {
    if (
      isSessionOpeningRef.current ||
      liveState === 'connecting' ||
      liveState === 'connected' ||
      liveState === 'reconnecting'
    ) {
      return;
    }
    setIsCalmPaused(false);
    setErrorMessage(null);
    await startLiveSession(false);
  }, [liveState, startLiveSession]);

  const wakeFromCalmMode = useCallback(async () => {
    setIsCalmPaused(false);
    setErrorMessage(null);
    wakeGreetingPendingRef.current = true;
    await startLiveSession(false);
  }, [startLiveSession]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        clearScheduledAudio();
      } else {
        lastConversationActivityRef.current = Date.now();
      }
      return next;
    });
  }, [clearScheduledAudio]);

  const sendTextMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSendingText) return;

      setErrorMessage(null);
      lastConversationActivityRef.current = Date.now();
      silencePromptSentForIdleRef.current = false;

      const userTurnId = `user_${Date.now()}_${++turnSeqRef.current}`;
      const userTurn: ChatTurn = {
        id: userTurnId,
        role: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
      };
      setTurns((prev) => upsertTurn(prev, userTurn));

      onVoiceConfirmCheckRef.current?.(trimmed);

      if (liveState === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
        } catch (err) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Failed to send message over live socket.'
          );
        }
        return;
      }

      setIsSendingText(true);
      setActivityState('thinking');

      try {
        const idToken = await getAuthTokenRef.current();
        if (!idToken) {
          throw new Error('Please sign in with Google before chatting with Akane.');
        }

        const historyPayload = turnsRef.current.slice(-8).map((t) => ({
          role: t.role === 'akane' ? ('model' as const) : ('user' as const),
          text: t.text,
        }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
            mode: modeRef.current,
            memory: memoryRef.current,
            missions: missionsRef.current,
            memoryV2Top10: memoryV2Top10Ref.current,
            followUpItem: followUpItemRef.current,
            isStudying: isStudyingRef.current,
            adultConfirmed: adultConfirmedRef.current,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          toolCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || 'Chat request failed.');
        }

        if (followUpItemRef.current) {
          onFollowUpUsedRef.current?.(followUpItemRef.current.id);
        }

        const reply = data.reply || 'I am right here, habibi.';
        setLiveCaption(reply);
        const chatTurnId = `chat_${Date.now()}_${++turnSeqRef.current}`;
        setTurns((prev) =>
          upsertTurn(prev, {
            id: chatTurnId,
            role: 'akane',
            text: reply,
            timestamp: new Date().toISOString(),
          })
        );

        for (const call of data.toolCalls ?? []) {
          if (call.name) {
            handleServerToolCall(call.name, call.args ?? {}, 'chat', true);
          }
        }
        setActivityState('idle');
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to reach Gemini API.'
        );
        setActivityState('idle');
      } finally {
        setIsSendingText(false);
      }
    },
    [handleServerToolCall, isSendingText, liveState]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disconnectLive();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          void audioCtxRef.current.close();
        } catch {
          // Ignore close errors
        }
        audioCtxRef.current = null;
      }
    };
  }, [disconnectLive]);

  return {
    liveState,
    activityState,
    audioLevel,
    isUserSpeaking,
    interruptedSeq,
    isSendingText,
    errorMessage,
    setErrorMessage,
    turns,
    liveCaption,
    isMuted,
    isPaused,
    isReconnectingVisible,
    isCalmPaused,
    connectLive,
    disconnectLive: () => disconnectLive(false),
    enterCalmMode,
    wakeFromCalmMode,
    toggleMute,
    togglePause,
    sendTextMessage,
    sendVideoFrame,
    sendLiveSystemText,
    clearError: () => {
      setErrorMessage(null);
      if (liveState === 'error') {
        setLiveState('disconnected');
      }
    },
  };
}
