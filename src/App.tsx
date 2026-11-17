import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  Brain,
  CheckSquare,
  ExternalLink,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Moon,
  PhoneOff,
  Send,
  Settings,
  Shirt,
  Sparkles,
  Sun,
  Video,
  VideoOff,
  BookOpen,
  Flame,
  Terminal,
  FileText,
  Layers,
  Heart,
  Wind,
  X,
} from 'lucide-react';
import {
  AkaneAvatarStage,
  type AkaneAvatarStageHandle,
} from './components/AkaneAvatarStage';
import { DesktopActivityPanel } from './components/DesktopActivityPanel';
import { DirectorDrawer } from './components/DirectorDrawer';
import { FirstRunOnboarding } from './components/FirstRunOnboarding';
import { MemoryDrawer } from './components/MemoryDrawer';
import { MissionsDrawer } from './components/MissionsDrawer';
import { OfflineIndicator } from './components/PWAInstallButton';
import { SettingsDrawer } from './components/SettingsDrawer';
import { StudioDrawer } from './components/StudioDrawer';
import { CompanionDiaryDrawer } from './components/CompanionDiaryDrawer';
import { DeStressModeOverlay } from './components/DeStressModeOverlay';
import { PomodoroTimerWidget } from './components/PomodoroTimerWidget';
import { PairProgrammerDrawer } from './components/PairProgrammerDrawer';
import { MeetingScribeDrawer } from './components/MeetingScribeDrawer';
import { FlashcardsStudyDrawer } from './components/FlashcardsStudyDrawer';
import { SystemWatchdogWidget } from './components/SystemWatchdogWidget';
import { ProactiveCheckinToast } from './components/ProactiveCheckinToast';
import { proactiveEngine, type ProactiveCheckinEvent } from './services/proactiveEngine';
import { affectionService } from './services/affectionService';
import { nonVerbalAudioService } from './services/nonVerbalAudioService';
import { voiceEmotionService } from './services/voiceEmotionService';
import {
  loadDiaryEntries,
  saveDiaryEntries,
  loadFlashcards,
  saveFlashcards,
} from './services/localStore';
import { useAkaneLive } from './hooks/useAkaneLive';
import { useDesktopBridge } from './hooks/useDesktopBridge';
import { isSecureMediaContext, useVisionLayer } from './hooks/useVisionLayer';
import { TRANSLATIONS } from './i18n/translations';
import { ambientAudio } from './services/ambientAudio';
import {
  auth,
  getFreshIdToken,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
} from './services/firebaseClient';
import {
  clearAllLocalData,
  createMission,
  deleteMission,
  loadMemoryStore,
  loadMissions,
  loadPreferences,
  saveMemoryStore,
  saveMissions,
  savePreferences,
  toggleMissionStatus,
} from './services/localStore';
import {
  createUserTask,
  deleteAllUserData,
  deleteUserTask,
  ensureUserProfile,
  forgetMemoryItem,
  listMemoryV2,
  listSessionSummaries,
  listUserTasks,
  markMemoryMentioned,
  saveMemoryV2Item,
  saveSessionSummary,
  selectSessionMemories,
  updateUserTaskStatus,
} from './services/memoryV2';
import type {
  ChatTurn,
  DirectorSnapshot,
  MemoryStore,
  MemoryV2Item,
  MemoryV2Kind,
  MissionItem,
  MissionPriority,
  OutfitStyle,
  PendingUrlAction,
  SessionSummaryItem,
  UserPreferences,
  VisionEventPayload,
} from './types/akane';

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [prefs, setPrefs] = useState<UserPreferences>(() => loadPreferences());
  const [memory, setMemory] = useState<MemoryStore>(() => loadMemoryStore());
  const [memoriesV2, setMemoriesV2] = useState<MemoryV2Item[]>([]);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummaryItem[]>([]);
  const [missions, setMissions] = useState<MissionItem[]>(() => loadMissions());
  const [pendingUrl, setPendingUrl] = useState<PendingUrlAction | null>(null);

  const [openDrawer, setOpenDrawer] = useState<
    | 'none'
    | 'studio'
    | 'memory'
    | 'missions'
    | 'director'
    | 'settings'
    | 'diary'
    | 'pair_prog'
    | 'meetings'
    | 'flashcards'
  >('none');
  const [isDeStressOpen, setIsDeStressOpen] = useState(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState(false);
  const [isWatchdogOpen, setIsWatchdogOpen] = useState(false);
  const [affection, setAffection] = useState(() => affectionService.getState());
  const [diaryEntries, setDiaryEntries] = useState(() => loadDiaryEntries());
  const [flashcards, setFlashcards] = useState(() => loadFlashcards());
  const [meetingSessions, setMeetingSessions] = useState<any[]>([]);
  const [directorSnapshot, setDirectorSnapshot] = useState<DirectorSnapshot | null>(null);
  const [textInputOpen, setTextInputOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [sleepSecondsRemaining, setSleepSecondsRemaining] = useState<number | null>(null);
  const [activeProactiveCheckin, setActiveProactiveCheckin] = useState<ProactiveCheckinEvent | null>(null);

  const stageRef = useRef<AkaneAvatarStageHandle | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const authUserRef = useRef<User | null>(authUser);
  authUserRef.current = authUser;

  const stopAllRef = useRef<() => void>(() => {});
  const talkShortcutRef = useRef<() => void>(() => {});
  const bridgeNoticeRef = useRef<(msg: string) => void>(() => {});

  const desktopBridge = useDesktopBridge({
    onEmergencyStopCallback: () => stopAllRef.current(),
    onTalkShortcutCallback: () => talkShortcutRef.current(),
    onBridgeNotice: (msg) => bridgeNoticeRef.current(msg),
  });

  const [insecureHttpWarning, setInsecureHttpWarning] = useState(false);

  useEffect(() => {
    setInsecureHttpWarning(!isSecureMediaContext());
  }, []);

  const t = TRANSLATIONS[prefs.language];

  // Auth listener + Firestore Memory v2 & Tasks hydration
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);

      if (!user) {
        setMemoriesV2([]);
        setSessionSummaries([]);
        return;
      }

      void (async () => {
        try {
          await ensureUserProfile(user, prefs.companionMode, false);
          const [v2Items, summaries, remoteTasks] = await Promise.all([
            listMemoryV2(user.uid),
            listSessionSummaries(user.uid),
            listUserTasks(user.uid),
          ]);
          setMemoriesV2(v2Items);
          setSessionSummaries(summaries);
          if (remoteTasks.length > 0) {
            setMissions(saveMissions(remoteTasks));
          }
        } catch (err) {
          console.error('[Firestore Sync]', err);
        }
      })();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Top-10 ranked Memory v2 items + ONE natural follow-up item for session start
  const { top10: memoryV2Top10, followUpItem } = useMemo(
    () => selectSessionMemories(memoriesV2),
    [memoriesV2]
  );

  // Sync RTL, language, bigger-text class, transparent mode, and localStorage prefs
  useEffect(() => {
    const rootEl = document.documentElement;
    const bodyEl = document.body;

    rootEl.dir = prefs.language === 'ar' ? 'rtl' : 'ltr';
    rootEl.lang = prefs.language;
    rootEl.classList.toggle('bigger-text', prefs.biggerText);

    const useTransparentBg =
      prefs.backgroundMode === 'transparent' || desktopBridge.companionMode;
    if (useTransparentBg) {
      rootEl.classList.add('widget-transparent');
      bodyEl.classList.remove('bg-[#0B0C0A]');
      bodyEl.classList.add('bg-transparent');
    } else {
      rootEl.classList.remove('widget-transparent');
      bodyEl.classList.remove('bg-transparent');
      bodyEl.classList.add('bg-[#0B0C0A]');
    }
    savePreferences(prefs);
  }, [prefs, desktopBridge.companionMode]);

  useEffect(() => {
    ambientAudio.setSoundscape(prefs.ambientSoundscape, prefs.ambientVolume);
    return () => {
      ambientAudio.stop();
    };
  }, [prefs.ambientSoundscape, prefs.ambientVolume]);

  const updatePrefs = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => ({
      ...prev,
      ...patch,
      ...(typeof patch.framingZoom === 'number'
        ? { framingZoom: Math.min(1.4, Math.max(1.0, patch.framingZoom)) }
        : {}),
      ...(typeof patch.framingOffsetY === 'number'
        ? { framingOffsetY: Math.min(80, Math.max(-80, patch.framingOffsetY)) }
        : {}),
    }));
  }, []);

  const handleToolClip = useCallback(
    (
      clipId: string,
      reason: string,
      isModelSpeaking: boolean,
      urgent = false,
      eventKey?: string
    ) => {
      stageRef.current?.requestClip(clipId, {
        source: 'tool',
        reason,
        isModelSpeaking,
        urgent,
        eventKey,
      });
    },
    []
  );

  const handleToolOutfit = useCallback((outfitStyle: OutfitStyle) => {
    setPrefs((prev) => ({ ...prev, outfitStyle }));
  }, []);

  const handleSaveMemoryV2 = useCallback(
    (input: {
      kind: MemoryV2Kind;
      content: string;
      dueAt?: string;
      importance?: number;
      source: 'voice' | 'chat' | 'manual';
    }) => {
      if (prefs.incognitoMode) return;
      const clean = input.content.trim();
      if (!clean) return;

      const user = authUserRef.current;
      if (user) {
        void (async () => {
          try {
            await ensureUserProfile(user, prefs.companionMode, false);
            const saved = await saveMemoryV2Item(user.uid, input);
            setMemoriesV2((prev) => [saved, ...prev]);
          } catch (err) {
            console.error('[Save Memory v2]', err);
          }
        })();
      } else {
        const nowIso = new Date().toISOString();
        const localItem: MemoryV2Item = {
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          uid: 'local',
          kind: input.kind,
          content: clean,
          dueAt: input.dueAt,
          importance: input.importance ?? 6,
          resolved: false,
          source: input.source,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setMemoriesV2((prev) => [localItem, ...prev]);
      }
    },
    [prefs.companionMode]
  );

  const handleForgetMemoryV2 = useCallback((memoryId: string) => {
    setMemoriesV2((prev) => prev.filter((item) => item.id !== memoryId));
    const user = authUserRef.current;
    if (user && !memoryId.startsWith('local')) {
      void forgetMemoryItem(user.uid, memoryId).catch((err) => {
        console.error('[Forget Memory v2]', err);
      });
    }
  }, []);

  const handleFollowUpUsed = useCallback((memoryId: string) => {
    const user = authUserRef.current;
    if (user) {
      void markMemoryMentioned(user.uid, memoryId).catch(() => {});
    }
  }, []);

  const handleSessionEnd = useCallback(
    (sessionTurns: ChatTurn[]) => {
      const user = authUserRef.current;
      if (!user || sessionTurns.length === 0) return;

      void (async () => {
        try {
          const token = await getFreshIdToken();
          if (!token) return;
          const res = await fetch('/api/session/summary', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ turns: sessionTurns }),
          });
          const data = (await res.json()) as { summary?: string };
          const summaryText =
            data.summary?.trim() ||
            `Completed session with ${sessionTurns.length} turns.`;
          await ensureUserProfile(user, prefs.companionMode, true);
          const saved = await saveSessionSummary(
            user.uid,
            summaryText,
            sessionTurns.length
          );
          setSessionSummaries((prev) => [saved, ...prev].slice(0, 10));
        } catch (err) {
          console.error('[Session Summary]', err);
        }
      })();
    },
    [prefs.companionMode]
  );

  const handleManageMission = useCallback(
    (
      action: 'create' | 'complete' | 'delete',
      payload: {
        title?: string;
        description?: string;
        priority?: MissionPriority;
        missionId?: string;
      }
    ) => {
      const user = authUserRef.current;

      setMissions((prev) => {
        if (action === 'create' && payload.title) {
          const res = createMission(
            prev,
            payload.title,
            payload.description || '',
            payload.priority || 'medium'
          );
          if (user && res.created) {
            void ensureUserProfile(user, prefs.companionMode, false)
              .then(() =>
                createUserTask(
                  user.uid,
                  res.created!.title,
                  res.created!.description,
                  res.created!.priority,
                  res.created!.id
                )
              )
              .catch(() => {});
          }
          return res.missions;
        }
        if (action === 'complete') {
          const match =
            prev.find((m) => m.id === payload.missionId) ||
            prev.find(
              (m) =>
                m.status === 'pending' &&
                payload.title &&
                m.title.toLowerCase().includes(payload.title.toLowerCase())
            );
          if (!match) return prev;
          const res = toggleMissionStatus(prev, match.id);
          if (user && res.target) {
            void updateUserTaskStatus(user.uid, match.id, res.target.status).catch(
              () => {}
            );
          }
          return res.missions;
        }
        if (action === 'delete') {
          const match =
            prev.find((m) => m.id === payload.missionId) ||
            prev.find(
              (m) =>
                payload.title &&
                m.title.toLowerCase().includes(payload.title.toLowerCase())
            );
          if (!match) return prev;
          if (user) {
            void deleteUserTask(user.uid, match.id).catch(() => {});
          }
          return deleteMission(prev, match.id);
        }
        return prev;
      });
    },
    [prefs.companionMode]
  );

  const {
    liveState,
    activityState,
    audioLevel,
    isUserSpeaking,
    interruptedSeq,
    isSendingText,
    errorMessage,
    setErrorMessage,
    liveCaption,
    isMuted,
    isPaused,
    isReconnectingVisible,
    isCalmPaused,
    connectLive,
    disconnectLive,
    enterCalmMode,
    wakeFromCalmMode,
    toggleMute,
    sendTextMessage,
    sendVideoFrame,
    sendLiveSystemText,
    clearError,
  } = useAkaneLive({
    mode: prefs.companionMode,
    dialect: prefs.arabicDialect,
    boundaries: prefs.personaBoundaries,
    incognito: prefs.incognitoMode,
    memory,
    missions,
    memoryV2Top10,
    followUpItem,
    isStudying: prefs.isStudying,
    adultConfirmed: prefs.adultConfirmed,
    getAuthToken: getFreshIdToken,
    onToolClip: handleToolClip,
    onToolOutfit: handleToolOutfit,
    onSaveMemoryV2: handleSaveMemoryV2,
    onManageMission: handleManageMission,
    onOpenUrl: setPendingUrl,
    onDesktopTool: desktopBridge.executeDesktopTool,
    onVoiceConfirmCheck: desktopBridge.handleVoiceConfirmation,
    onFollowUpUsed: handleFollowUpUsed,
    onSessionEnd: handleSessionEnd,
  });

  bridgeNoticeRef.current = (msg: string) => {
    setErrorMessage(msg);
  };

  const handleInstantVisionClip = useCallback((ev: VisionEventPayload) => {
    stageRef.current?.requestClip(ev.clipKey, {
      source: 'vision',
      reason: `Vision Layer A: ${ev.systemText}`,
      urgent: ev.urgent,
      bypassCooldown: ev.urgent,
      eventKey: `vision_${ev.type}`,
    });
  }, []);

  const {
    isCameraOn,
    cameraStream,
    cameraVideoRef,
    isScreenSharing,
    screenVideoRef,
    screenShareWarning,
    lastDetectedEvent,
    gaze: visionGaze,
    dismissScreenShareWarning,
    toggleCamera,
    stopCamera,
    toggleScreenShare,
    stopScreenShare,
  } = useVisionLayer({
    isLiveConnected: liveState === 'connected',
    isMuted,
    isPaused,
    sendVideoFrame,
    sendVisionText: sendLiveSystemText,
    onInstantVisionClip: handleInstantVisionClip,
    onVisionError: setErrorMessage,
  });

  // Proactive Companion Engine lifecycle & telemetry
  useEffect(() => {
    proactiveEngine.start();
    const unsub = proactiveEngine.subscribe((event) => {
      nonVerbalAudioService.playCue(event.cueType);
      setActiveProactiveCheckin(event);
    });
    return () => {
      unsub();
      proactiveEngine.stop();
    };
  }, []);

  useEffect(() => {
    if (visionGaze) {
      proactiveEngine.updateVisionTelemetry(visionGaze.fatigueScore, visionGaze.isContact);
    }
  }, [visionGaze]);

  useEffect(() => {
    proactiveEngine.setStudyingMode(prefs.isStudying);
  }, [prefs.isStudying]);

  useEffect(() => {
    if (isUserSpeaking || activityState === 'speaking') {
      proactiveEngine.recordUserActivity();
    }
  }, [isUserSpeaking, activityState]);

  const handleEndCall = useCallback(() => {
    stopCamera();
    stopScreenShare();
    disconnectLive();
  }, [disconnectLive, stopCamera, stopScreenShare]);

  stopAllRef.current = handleEndCall;
  talkShortcutRef.current = () => {
    if (isCalmPaused) {
      void wakeFromCalmMode();
      return;
    }
    if (
      liveState === 'connected' ||
      liveState === 'connecting' ||
      liveState === 'reconnecting'
    ) {
      handleEndCall();
    } else {
      void connectLive();
    }
  };

  // Sleep Timer countdown effect -> enters Calm Mode cleanly when elapsed
  useEffect(() => {
    if (prefs.sleepTimerMinutes === 0) {
      setSleepSecondsRemaining(null);
      return;
    }

    let remaining = prefs.sleepTimerMinutes * 60;
    setSleepSecondsRemaining(remaining);

    const id = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(id);
        setSleepSecondsRemaining(null);
        stopCamera();
        stopScreenShare();
        enterCalmMode();
        setPrefs((prev) => ({
          ...prev,
          sleepTimerMinutes: 0,
          nightWhisperMode: true,
        }));
      } else {
        setSleepSecondsRemaining(remaining);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [prefs.sleepTimerMinutes, enterCalmMode, stopCamera, stopScreenShare]);

  // Mirror active camera stream into visible small PIP preview
  useEffect(() => {
    const preview = previewVideoRef.current;
    if (!preview) return;
    if (cameraStream) {
      preview.srcObject = cameraStream;
      preview.play().catch(() => {});
    } else {
      preview.pause();
      preview.srcObject = null;
    }
  }, [cameraStream, isCameraOn]);

  const handleGoogleSignIn = async () => {
    try {
      clearError();
      await signInWithGoogle();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Google Sign-In cancelled or failed.'
      );
    }
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftText.trim()) return;
    const msg = draftText;
    setDraftText('');
    void sendTextMessage(msg);
  };

  const handleSleepToggle = () => {
    if (isCalmPaused) {
      void wakeFromCalmMode();
    } else {
      stopCamera();
      stopScreenShare();
      enterCalmMode();
    }
  };

  const handleToggleMissionManual = (id: string) => {
    const res = toggleMissionStatus(missions, id);
    setMissions(res.missions);
    if (authUser && res.target) {
      void updateUserTaskStatus(authUser.uid, id, res.target.status).catch(() => {});
    }
    if (res.completedNow) {
      stageRef.current?.requestClip('cheer', {
        source: 'user',
        reason: 'User completed mission manually',
        urgent: true,
      });
    }
  };

  const handleDeleteAllData = async () => {
    handleEndCall();
    if (authUserRef.current) {
      await deleteAllUserData(authUserRef.current.uid);
    }
    await clearAllLocalData();
    setMemory({
      userName: '',
      universityOrWork: '',
      dailyHabits: '',
      entries: [],
      updatedAt: new Date().toISOString(),
    });
    setMemoriesV2([]);
    setSessionSummaries([]);
    setMissions([]);
    setPrefs((prev) => ({
      ...loadPreferences(),
      language: prev.language,
      adultConfirmed: prev.adultConfirmed,
      onboardingCompleted: true,
    }));
  };

  const isTransparent =
    prefs.backgroundMode === 'transparent' || desktopBridge.companionMode;
  const isCallActive =
    liveState === 'connected' ||
    liveState === 'connecting' ||
    liveState === 'reconnecting';
  const pendingMissionCount = missions.filter((m) => m.status === 'pending').length;

  // Silent reconnect hides reconnect message for the first 3 seconds
  const statusLabel = isCalmPaused
    ? t.status.calm
    : liveState === 'connecting'
      ? t.status.connecting
      : liveState === 'reconnecting'
        ? isReconnectingVisible
          ? t.status.beRightBack
          : t.status.connected
        : liveState === 'error'
          ? t.status.error
          : isPaused
            ? t.status.paused
            : activityState === 'speaking'
              ? t.status.speaking
              : liveState === 'connected' || activityState === 'listening'
                ? isMuted
                  ? t.status.muted
                  : t.status.listening
                : activityState === 'thinking'
                  ? t.status.thinking
                  : t.status.idle;

  const statusDotClass =
    liveState === 'error'
      ? 'bg-[#A3202B] shadow-[0_0_10px_rgba(163,32,43,0.9)]'
      : liveState === 'connecting' || isReconnectingVisible
        ? 'bg-[#E0A030] shadow-[0_0_10px_rgba(224,160,48,0.9)] animate-pulse'
        : isCalmPaused
          ? 'bg-[#E0A030]/80'
          : activityState === 'speaking' || liveState === 'connected'
            ? 'bg-[#17BD7F] shadow-[0_0_10px_rgba(23,189,127,0.9)]'
            : 'bg-[#A3202B]/80';

  const micRingMode: 'still' | 'pulsing' | 'moving' | 'glowing' =
    activityState === 'thinking' ||
    isSendingText ||
    liveState === 'connecting' ||
    liveState === 'reconnecting'
      ? 'moving'
      : activityState === 'speaking'
        ? 'glowing'
        : liveState === 'connected' && !isMuted && !isPaused
          ? 'pulsing'
          : 'still';

  const handlePrimaryMicClick = () => {
    if (isCalmPaused) {
      void wakeFromCalmMode();
      return;
    }
    if (liveState === 'connected') {
      toggleMute();
      return;
    }
    if (liveState === 'connecting' || liveState === 'reconnecting') {
      handleEndCall();
      return;
    }
    void connectLive();
  };

  if (desktopBridge.companionMode) {
    return (
      <div className="relative w-screen h-screen overflow-hidden bg-transparent text-[#F5F1EC]">
        <main className="fixed inset-0 z-0 flex items-end justify-center overflow-hidden">
          <AkaneAvatarStage
            ref={stageRef}
            activityState={activityState}
            audioLevel={audioLevel}
            isUserSpeaking={isUserSpeaking}
            interruptedSeq={interruptedSeq}
            isLiveConnected={liveState === 'connected' || liveState === 'reconnecting'}
            backgroundMode="transparent"
            companionMode={prefs.companionMode}
            avatarRenderMode={prefs.avatarRenderMode}
            gaze={visionGaze}
            outfitStyle={prefs.outfitStyle}
            nightWhisperMode={false}
            lightingPreset="night"
            mood={
              prefs.companionMode === 'tsundere'
                ? 'playful'
                : prefs.companionMode === 'wife'
                  ? 'warm'
                  : 'neutral'
            }
            framingZoom={prefs.framingZoom}
            framingOffsetY={prefs.framingOffsetY}
            onSnapshotChange={setDirectorSnapshot}
            onSwitchRenderMode={(m) => handleUpdatePrefs({ avatarRenderMode: m })}
            onAvatarClick={() => {
              const res = affectionService.addXp(10);
              setAffection(res.nextState);
              nonVerbalAudioService.playCue('chuckle');
            }}
          />
        </main>

        {liveCaption && (
          <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-sm">
            <div className="rounded-2xl bg-[#0B0C0A]/90 backdrop-blur-xl border border-[#A3202B]/40 px-4 py-2.5 text-center shadow-2xl">
              <p className="text-lg text-[#F5F1EC] leading-snug">{liveCaption}</p>
            </div>
          </div>
        )}

        {desktopBridge.pendingApprovals[0] && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xs rounded-2xl bg-[#0B0C0A]/95 border border-[#E0A030] p-4 shadow-2xl">
            <p className="text-base font-semibold text-[#E0A030]">
              {desktopBridge.pendingApprovals[0].summary}
            </p>
            {desktopBridge.pendingApprovals[0].taintOrigin && (
              <p className="mt-1 text-base text-[#F5F1EC]/80 font-mono">
                {desktopBridge.pendingApprovals[0].taintOrigin}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  void desktopBridge.approveAction(desktopBridge.pendingApprovals[0].id)
                }
                className="flex-1 min-h-[48px] py-2 rounded-2xl bg-[#17BD7F] text-base font-bold text-[#0B0C0A]"
              >
                {t.common.allow}
              </button>
              <button
                type="button"
                onClick={() =>
                  void desktopBridge.denyAction(desktopBridge.pendingApprovals[0].id)
                }
                className="flex-1 min-h-[48px] py-2 rounded-2xl bg-[#A3202B] text-base font-bold text-[#F5F1EC]"
              >
                {t.common.deny}
              </button>
            </div>
          </div>
        )}

        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#0B0C0A]/85 backdrop-blur-xl border border-[#A3202B]/40">
          <button
            type="button"
            onClick={() => talkShortcutRef.current()}
            className="min-h-[48px] px-4 rounded-2xl bg-[#A3202B] text-[#F5F1EC] text-base font-semibold"
          >
            {isCallActive ? t.dock.endCall : t.dock.talk}
          </button>
          <button
            type="button"
            onClick={() => void desktopBridge.toggleClickThrough()}
            className={`min-h-[48px] px-3 rounded-2xl border text-base ${
              desktopBridge.clickThrough
                ? 'bg-[#E0A030] border-[#E0A030] text-[#0B0C0A] font-semibold'
                : 'border-[#F5F1EC]/20 text-[#F5F1EC]'
            }`}
          >
            {desktopBridge.clickThrough ? 'Locked' : 'Pass-Through'}
          </button>
          <button
            type="button"
            onClick={() => void desktopBridge.triggerEmergencyStop()}
            className="min-h-[48px] px-3 rounded-2xl bg-[#A3202B] text-[#F5F1EC] text-base font-semibold"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={() => void desktopBridge.toggleCompanionMode(false)}
            className="min-h-[48px] px-3 rounded-2xl text-[#F5F1EC]/85 hover:text-[#F5F1EC] text-base"
          >
            Studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col ${
        isTransparent ? 'bg-transparent' : 'bg-[#0B0C0A]'
      } text-[#F5F1EC]`}
    >
      {/* Slim Header: Name + Status + AI Companion Disclosure + ONLY 3 Header Icons (+ always-reachable 1-tap End Call when live) */}
      <header className="fixed top-3 inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl flex items-center justify-between gap-2 px-4 py-1.5 rounded-3xl bg-[#0B0C0A]/82 backdrop-blur-2xl border border-[#F5F1EC]/15 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${statusDotClass}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-lg font-bold text-[#F5F1EC] truncate">
                {t.akaneName}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#A3202B]/30 border border-[#A3202B]/50 text-[#FF8597] font-semibold flex items-center gap-1">
                <Heart className="w-3 h-3 fill-[#E62739] text-[#E62739]" />
                <span>Lv.{affection.level} {affection.title}</span>
              </span>
              {affection.streakDays > 0 && (
                <span className="text-xs text-amber-400 font-mono hidden sm:inline" title="سلسلة الأيام النشطة">
                  🔥 {affection.streakDays}d
                </span>
              )}
              {prefs.incognitoMode && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 border border-purple-400 text-purple-200">
                  خفي
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isCallActive && (
              <button
                type="button"
                onClick={handleEndCall}
                className="min-h-[48px] px-3.5 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-semibold flex items-center gap-1.5 shadow-lg"
                aria-label={t.header.endCall}
              >
                <PhoneOff className="w-5 h-5 shrink-0" />
                <span className="hidden sm:inline">{t.header.endCall}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setOpenDrawer((cur) => (cur === 'memory' ? 'none' : 'memory'))
              }
              className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center border ${
                openDrawer === 'memory'
                  ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                  : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC] hover:bg-white/10'
              }`}
              title={t.header.memory}
              aria-label={t.header.memory}
            >
              <Brain className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setOpenDrawer((cur) => (cur === 'studio' ? 'none' : 'studio'))
              }
              className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center border ${
                openDrawer === 'studio'
                  ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                  : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC] hover:bg-white/10'
              }`}
              title={t.header.studio}
              aria-label={t.header.studio}
            >
              <Shirt className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setOpenDrawer((cur) => (cur === 'settings' ? 'none' : 'settings'))
              }
              className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center border ${
                openDrawer === 'settings'
                  ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                  : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC] hover:bg-white/10'
              }`}
              title={t.header.settings}
              aria-label={t.header.settings}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Slim Start-Edge Sidebar (Character stage + slim sidebar + right Activity panel) */}
      <nav
        aria-label="Desktop Navigation"
        className="hidden md:flex fixed top-24 start-4 z-30 flex-col gap-2 p-2 rounded-3xl bg-[#0B0C0A]/85 backdrop-blur-2xl border border-[#F5F1EC]/15 shadow-2xl"
      >
        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'studio' ? 'none' : 'studio'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'studio'
              ? 'bg-[#A3202B] text-[#F5F1EC]'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title={t.header.studio}
          aria-label={t.header.studio}
        >
          <Sparkles className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'memory' ? 'none' : 'memory'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'memory'
              ? 'bg-[#A3202B] text-[#F5F1EC]'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title={t.header.memory}
          aria-label={t.header.memory}
        >
          <Brain className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'missions' ? 'none' : 'missions'))
          }
          className={`relative min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'missions'
              ? 'bg-[#A3202B] text-[#F5F1EC]'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title={t.settings.openMissions}
          aria-label={t.settings.openMissions}
        >
          <CheckSquare className="w-5 h-5" />
          {pendingMissionCount > 0 && (
            <span className="absolute top-1.5 end-1.5 w-2.5 h-2.5 rounded-full bg-[#17BD7F]" />
          )}
        </button>

        {/* Diary */}
        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'diary' ? 'none' : 'diary'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'diary'
              ? 'bg-[#A3202B] text-[#F5F1EC]'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title="مذكرات أكاني اليومية"
        >
          <BookOpen className="w-5 h-5" />
        </button>

        {/* Pomodoro */}
        <button
          type="button"
          onClick={() => setIsPomodoroOpen(!isPomodoroOpen)}
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            isPomodoroOpen
              ? 'bg-amber-600 text-white'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title="وضع التركيز العميق (Pomodoro)"
        >
          <Flame className="w-5 h-5" />
        </button>

        {/* De-Stress */}
        <button
          type="button"
          onClick={() => setIsDeStressOpen(true)}
          className="min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10"
          title="جلسة التنفس وتخفيف التوتر"
        >
          <Wind className="w-5 h-5" />
        </button>

        {/* Pair Programmer */}
        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'pair_prog' ? 'none' : 'pair_prog'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'pair_prog'
              ? 'bg-blue-600 text-white'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title="المبرمج المساعد الصوتي"
        >
          <Terminal className="w-5 h-5" />
        </button>

        {/* Meeting Scribe */}
        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'meetings' ? 'none' : 'meetings'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'meetings'
              ? 'bg-emerald-600 text-white'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title="محضر الاجتماعات"
        >
          <FileText className="w-5 h-5" />
        </button>

        {/* Flashcards */}
        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'flashcards' ? 'none' : 'flashcards'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'flashcards'
              ? 'bg-amber-500 text-black font-bold'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title="بطاقات المذاكرة الذكية"
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* System Watchdog */}
        <button
          type="button"
          onClick={() => setIsWatchdogOpen(!isWatchdogOpen)}
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            isWatchdogOpen
              ? 'bg-red-600 text-white'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title="مراقب صحة وموارد الجهاز"
        >
          <Activity className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'director' ? 'none' : 'director'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'director'
              ? 'bg-[#A3202B] text-[#F5F1EC]'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title={t.settings.openDirector}
          aria-label={t.settings.openDirector}
        >
          <Activity className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setOpenDrawer((cur) => (cur === 'settings' ? 'none' : 'settings'))
          }
          className={`min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center ${
            openDrawer === 'settings'
              ? 'bg-[#A3202B] text-[#F5F1EC]'
              : 'text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10'
          }`}
          title={t.header.settings}
          aria-label={t.header.settings}
        >
          <Settings className="w-5 h-5" />
        </button>
      </nav>

      {/* Persistent Red "Sharing" Bar when Screen Share active */}
      {isScreenSharing && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-1.5 rounded-2xl bg-[#A3202B] text-[#F5F1EC] text-base font-semibold shadow-2xl border border-[#F5F1EC]/30">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F5F1EC] animate-pulse" />
          <span>{t.sharing.barLabel}</span>
          <button
            type="button"
            onClick={stopScreenShare}
            className="min-h-[48px] px-4 rounded-xl bg-[#0B0C0A]/45 hover:bg-[#0B0C0A]/75 text-base font-semibold"
          >
            {t.sharing.stop}
          </button>
        </div>
      )}

      {/* Offline Banner */}
      <OfflineIndicator message={t.common.offline} />

      {/* Full-Screen Character Stage (HUD, Captions & Dock overlay without shrinking her) */}
      <main className="fixed inset-0 z-0 flex items-end justify-center overflow-hidden">
        <AkaneAvatarStage
          ref={stageRef}
          activityState={activityState}
          audioLevel={audioLevel}
          isUserSpeaking={isUserSpeaking}
          interruptedSeq={interruptedSeq}
          isLiveConnected={liveState === 'connected' || liveState === 'reconnecting'}
          backgroundMode={prefs.backgroundMode}
          companionMode={prefs.companionMode}
          avatarRenderMode={prefs.avatarRenderMode}
          gaze={visionGaze}
          outfitStyle={prefs.outfitStyle}
          nightWhisperMode={prefs.nightWhisperMode}
          lightingPreset={prefs.lightingPreset}
          mood={
            prefs.companionMode === 'tsundere'
              ? 'playful'
              : prefs.companionMode === 'cheerful_friend'
                ? 'happy'
                : prefs.companionMode === 'wife'
                  ? 'warm'
                  : 'neutral'
          }
          framingZoom={prefs.framingZoom}
          framingOffsetY={prefs.framingOffsetY}
          onSnapshotChange={setDirectorSnapshot}
          onSwitchRenderMode={(m) => handleUpdatePrefs({ avatarRenderMode: m })}
          onAvatarClick={() => {
            const res = affectionService.addXp(10);
            setAffection(res.nextState);
            nonVerbalAudioService.playCue('chuckle');
          }}
        />

        {/* Hidden capture elements for Camera & Screen Share */}
        <video
          ref={cameraVideoRef}
          autoPlay
          muted
          playsInline
          className="hidden"
        />
        <video
          ref={screenVideoRef}
          autoPlay
          muted
          playsInline
          className="hidden"
        />

        {/* Small Mirrored Camera Preview with Persistent Red Live Badge & 1-Tap Off */}
        {isCameraOn && (
          <div className="fixed bottom-36 end-4 z-30 w-40 sm:w-48 rounded-2xl overflow-hidden bg-[#0B0C0A] border-2 border-[#A3202B] shadow-2xl">
            <div className="relative aspect-[4/3] bg-black">
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover -scale-x-100"
              />
              <div className="absolute top-2 start-2 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#A3202B] text-base font-semibold text-[#F5F1EC]">
                <span className="w-2 h-2 rounded-full bg-[#F5F1EC] animate-pulse" />
                <span>{t.sharing.camBadge}</span>
              </div>
              <button
                type="button"
                onClick={stopCamera}
                className="absolute bottom-2 end-2 min-w-[48px] min-h-[48px] px-3 rounded-xl bg-[#0B0C0A]/85 hover:bg-[#A3202B] text-base font-semibold text-[#F5F1EC]"
                aria-label={t.dock.cameraOff}
              >
                {t.sharing.camOff}
              </button>
              {lastDetectedEvent && (
                <span className="absolute bottom-2 start-2 px-2 py-0.5 rounded-lg bg-[#0B0C0A]/80 text-base font-mono text-[#F5F1EC]">
                  {lastDetectedEvent.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Safe Open URL Action Card */}
        {pendingUrl && (
          <div className="fixed bottom-36 start-4 z-30 max-w-xs rounded-2xl bg-[#0B0C0A]/95 backdrop-blur-xl border border-[#A3202B]/45 p-4 shadow-2xl flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base text-[#F5F1EC]/75 font-medium">
                {t.akaneName}
              </p>
              <a
                href={pendingUrl.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingUrl(null)}
                className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-[#F5F1EC] hover:text-[#17BD7F] underline truncate max-w-[200px]"
              >
                <span className="truncate">{pendingUrl.label}</span>
                <ExternalLink className="w-4 h-4 shrink-0" />
              </a>
            </div>
            <button
              type="button"
              onClick={() => setPendingUrl(null)}
              className="min-w-[48px] min-h-[48px] rounded-xl text-[#F5F1EC]/80 hover:text-[#F5F1EC] flex items-center justify-center"
              aria-label={t.common.dismiss}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Plain HTTP Security Warning */}
        {insecureHttpWarning && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] rounded-2xl bg-[#0B0C0A]/95 border border-[#E0A030] px-4 py-3 text-base text-[#F5F1EC] flex items-center justify-between gap-3 shadow-2xl">
            <span>
              Camera, mic &amp; screen share require HTTPS or localhost.
            </span>
            <button
              type="button"
              onClick={() => setInsecureHttpWarning(false)}
              className="min-h-[48px] px-3 rounded-xl text-[#E0A030] font-semibold shrink-0"
            >
              {t.common.dismiss}
            </button>
          </div>
        )}

        {/* Mobile Screen Share Warning */}
        {screenShareWarning && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] rounded-2xl bg-[#0B0C0A]/95 border border-[#E0A030] px-4 py-3 text-base text-[#F5F1EC] flex items-center justify-between gap-3 shadow-2xl">
            <span>{screenShareWarning}</span>
            <button
              type="button"
              onClick={dismissScreenShareWarning}
              className="min-h-[48px] px-3 rounded-xl text-[#E0A030] font-semibold shrink-0"
            >
              {t.common.dismiss}
            </button>
          </div>
        )}

        {/* Reconnecting banner ONLY after 3 seconds of silent retry */}
        {isReconnectingVisible && !errorMessage && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[calc(100%-2rem)] rounded-2xl bg-[#0B0C0A]/92 border border-[#E0A030]/70 px-4 py-3 text-center text-base font-medium text-[#E0A030] shadow-2xl">
            {t.status.beRightBack}
          </div>
        )}

        {/* API / Auth / Mic / Camera Error Banner */}
        {errorMessage && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] rounded-2xl bg-[#0B0C0A]/95 border border-[#A3202B] px-4 py-3 text-base text-[#F5F1EC] flex items-center justify-between gap-3 shadow-2xl">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={clearError}
              className="min-h-[48px] px-3 rounded-xl text-[#F5F1EC] hover:bg-white/10 font-semibold shrink-0"
            >
              {t.common.dismiss}
            </button>
          </div>
        )}
      </main>

      {/* One-Hand Bottom Stack: Captions -> Calm Card (optional) -> 5-Button Dock -> Text Input UNDER Dock */}
      <footer className="fixed bottom-0 inset-x-0 z-30 pb-safe px-3 flex flex-col items-center gap-2.5 pointer-events-none">
        {/* Captions Bubble (>=18px ivory over character) */}
        {liveCaption && !isCalmPaused && (
          <div className="pointer-events-none w-full max-w-[540px] px-2">
            <div className="rounded-2xl bg-[#0B0C0A]/86 backdrop-blur-xl border border-[#F5F1EC]/15 px-5 py-3 text-center shadow-[0_8px_32px_rgba(0,0,0,0.65)]">
              <p className="text-lg text-[#F5F1EC] leading-relaxed">{liveCaption}</p>
            </div>
          </div>
        )}

        {/* Calm Mode / Sleep Wake Card in Thumb Zone */}
        {isCalmPaused && (
          <div className="pointer-events-auto w-full max-w-md rounded-3xl bg-[#0B0C0A]/90 backdrop-blur-2xl border border-[#F5F1EC]/20 p-4 text-center space-y-3 shadow-2xl">
            <p className="font-display text-lg font-bold text-[#F5F1EC]">
              {t.calm.title}
            </p>
            <p className="text-base text-[#F5F1EC]/80">{t.calm.subtitle}</p>
            <button
              type="button"
              onClick={() => void wakeFromCalmMode()}
              className="w-full min-h-[52px] rounded-2xl bg-[#17BD7F] hover:bg-[#19cf8b] text-[#0B0C0A] text-base font-bold flex items-center justify-center gap-2 shadow-lg"
            >
              <Sun className="w-5 h-5" />
              <span>{t.calm.wakeButton}</span>
            </button>
          </div>
        )}

        {/* Sleep countdown pill if active */}
        {sleepSecondsRemaining !== null && !isCalmPaused && (
          <div className="pointer-events-none px-3 py-1 rounded-2xl bg-[#0B0C0A]/80 border border-[#F5F1EC]/15 text-base font-mono text-[#17BD7F]">
            {t.calm.timerLabel}{' '}
            {Math.floor(sleepSecondsRemaining / 60)}:
            {String(sleepSecondsRemaining % 60).padStart(2, '0')}
          </div>
        )}

        {/* Bottom Dock: MAX 5 Buttons (Camera, Screen Share, Big Center Mic, Chat, Sleep) */}
        <div
          role="toolbar"
          aria-label="Primary Controls"
          className="pointer-events-auto flex items-center justify-center gap-2 sm:gap-3 px-3 py-2 rounded-3xl bg-[#0B0C0A]/88 backdrop-blur-2xl border border-[#A3202B]/40 shadow-[0_12px_40px_rgba(0,0,0,0.75)] max-w-full"
        >
          {/* 1. Camera */}
          <button
            type="button"
            onClick={() => void toggleCamera()}
            className={`min-w-[48px] min-h-[48px] px-3 rounded-2xl border flex items-center justify-center gap-1.5 text-base font-medium ${
              isCameraOn
                ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:bg-white/10'
            }`}
            title={isCameraOn ? t.dock.cameraOff : t.dock.camera}
            aria-label={isCameraOn ? t.dock.cameraOff : t.dock.camera}
          >
            {isCameraOn ? (
              <Video className="w-5 h-5 shrink-0" />
            ) : (
              <VideoOff className="w-5 h-5 shrink-0" />
            )}
            <span className="hidden sm:inline">{t.dock.camera}</span>
          </button>

          {/* 2. Screen Share */}
          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            className={`min-w-[48px] min-h-[48px] px-3 rounded-2xl border flex items-center justify-center gap-1.5 text-base font-medium ${
              isScreenSharing
                ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:bg-white/10'
            }`}
            title={isScreenSharing ? t.dock.stopShare : t.dock.share}
            aria-label={isScreenSharing ? t.dock.stopShare : t.dock.share}
          >
            {isScreenSharing ? (
              <MonitorOff className="w-5 h-5 shrink-0" />
            ) : (
              <Monitor className="w-5 h-5 shrink-0" />
            )}
            <span className="hidden md:inline">
              {isScreenSharing ? t.dock.stopShare : t.dock.share}
            </span>
          </button>

          {/* 3. Big Center Mic Button with 4 Ring States: still / pulsing / moving / glowing */}
          <div className="relative flex items-center justify-center shrink-0">
            {micRingMode === 'moving' && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1.5 rounded-full mic-ring-thinking"
              />
            )}
            {micRingMode === 'pulsing' && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2 rounded-full border-2 border-[#A3202B] mic-ring-listening"
              />
            )}
            {micRingMode === 'glowing' && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2 rounded-full bg-[#17BD7F]/35 blur-md"
                style={{
                  transform: `scale(${1 + Math.min(0.28, audioLevel * 0.45)})`,
                }}
              />
            )}
            <button
              type="button"
              onClick={handlePrimaryMicClick}
              className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center border-2 shadow-xl ${
                micRingMode === 'glowing'
                  ? 'bg-[#17BD7F] border-[#F5F1EC] text-[#0B0C0A]'
                  : isMuted || isCalmPaused
                    ? 'bg-[#6F0E19] border-[#A3202B] text-[#F5F1EC]'
                    : 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC] hover:bg-[#b82834]'
              }`}
              title={
                isCalmPaused
                  ? t.dock.wake
                  : liveState === 'connected'
                    ? isMuted
                      ? t.status.muted
                      : t.status.listening
                    : t.dock.talk
              }
              aria-label={
                isCalmPaused
                  ? t.dock.wake
                  : liveState === 'connected'
                    ? t.status.listening
                    : t.dock.talk
              }
            >
              {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
            </button>
          </div>

          {/* 4. Chat (toggles text input directly UNDER the dock) */}
          <button
            type="button"
            onClick={() => setTextInputOpen((v) => !v)}
            className={`min-w-[48px] min-h-[48px] px-3 rounded-2xl border flex items-center justify-center gap-1.5 text-base font-medium ${
              textInputOpen
                ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:bg-white/10'
            }`}
            title={t.dock.chat}
            aria-label={t.dock.chat}
          >
            <MessageSquare className="w-5 h-5 shrink-0" />
            <span className="hidden sm:inline">{t.dock.chat}</span>
          </button>

          {/* 5. Sleep Mode (Calm rest / Wake) */}
          <button
            type="button"
            onClick={handleSleepToggle}
            className={`min-w-[48px] min-h-[48px] px-3 rounded-2xl border flex items-center justify-center gap-1.5 text-base font-medium ${
              isCalmPaused || sleepSecondsRemaining !== null
                ? 'bg-[#6F0E19] border-[#A3202B] text-[#F5F1EC]'
                : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:bg-white/10'
            }`}
            title={isCalmPaused ? t.dock.wake : t.dock.sleep}
            aria-label={isCalmPaused ? t.dock.wake : t.dock.sleep}
          >
            <Moon className="w-5 h-5 shrink-0" />
            <span className="hidden sm:inline">
              {isCalmPaused ? t.dock.wake : t.dock.sleep}
            </span>
          </button>
        </div>

        {/* Text Input Directly UNDER the Dock */}
        {textInputOpen && (
          <form
            onSubmit={handleSubmitText}
            className="pointer-events-auto w-full max-w-[460px] flex items-center gap-2 rounded-2xl bg-[#0B0C0A]/92 backdrop-blur-2xl border border-[#F5F1EC]/20 p-2 shadow-2xl"
          >
            <input
              type="text"
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={
                memory.userName
                  ? `${t.dock.sendPlaceholder} (${memory.userName})`
                  : t.dock.sendPlaceholder
              }
              disabled={isSendingText}
              className="flex-1 min-w-0 min-h-[48px] bg-transparent px-3 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/45 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draftText.trim() || isSendingText}
              className="min-w-[48px] min-h-[48px] px-3 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] disabled:opacity-40 text-[#F5F1EC] flex items-center justify-center shrink-0"
              aria-label={t.dock.send}
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        )}
      </footer>

      {/* Drawers */}
      <StudioDrawer
        isOpen={openDrawer === 'studio'}
        onClose={() => setOpenDrawer('none')}
        t={t}
        prefs={prefs}
        sleepSecondsRemaining={sleepSecondsRemaining}
        onUpdatePrefs={updatePrefs}
      />

      <MemoryDrawer
        isOpen={openDrawer === 'memory'}
        onClose={() => setOpenDrawer('none')}
        t={t}
        memory={memory}
        memoriesV2={memoriesV2}
        sessionSummaries={sessionSummaries}
        isSignedIn={Boolean(authUser)}
        onUpdateProfile={(patch) =>
          setMemory((prev) => saveMemoryStore({ ...prev, ...patch }))
        }
        onAddMemoryV2={handleSaveMemoryV2}
        onForgetMemoryV2={handleForgetMemoryV2}
      />

      <MissionsDrawer
        isOpen={openDrawer === 'missions'}
        onClose={() => setOpenDrawer('none')}
        missions={missions}
        onCreateMission={(title, description, priority) =>
          handleManageMission('create', { title, description, priority })
        }
        onToggleMission={handleToggleMissionManual}
        onDeleteMission={(id) => handleManageMission('delete', { missionId: id })}
      />

      <DirectorDrawer
        isOpen={openDrawer === 'director'}
        onClose={() => setOpenDrawer('none')}
        snapshot={directorSnapshot}
        framingZoom={prefs.framingZoom}
        framingOffsetY={prefs.framingOffsetY}
        onUpdateFraming={(patch) => updatePrefs(patch)}
        onTriggerClip={(clipId, bypassCooldown) => {
          stageRef.current?.requestClip(clipId, {
            source: 'user',
            reason: 'Manual Director tap',
            bypassCooldown,
          });
        }}
      />

      <SettingsDrawer
        isOpen={openDrawer === 'settings'}
        onClose={() => setOpenDrawer('none')}
        t={t}
        prefs={prefs}
        userEmail={authUser?.email ?? null}
        userName={authUser?.displayName ?? null}
        isSignedIn={Boolean(authUser)}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onSignOut={() => void signOutUser()}
        onUpdatePrefs={updatePrefs}
        onOpenStudio={() => setOpenDrawer('studio')}
        onOpenMemory={() => setOpenDrawer('memory')}
        onOpenMissions={() => setOpenDrawer('missions')}
        onOpenDirector={() => setOpenDrawer('director')}
        onDeleteAllData={handleDeleteAllData}
      />

      {/* New Multi-Feature Drawers & Widgets */}
      <CompanionDiaryDrawer
        isOpen={openDrawer === 'diary'}
        onClose={() => setOpenDrawer('none')}
        entries={diaryEntries}
        onAddEntry={(entry) => {
          const next = [{ ...entry, id: `diary_${Date.now()}` }, ...diaryEntries];
          setDiaryEntries(saveDiaryEntries(next));
          affectionService.addXp(30);
          setAffection(affectionService.getState());
        }}
      />

      {activeProactiveCheckin && (
        <ProactiveCheckinToast
          event={activeProactiveCheckin}
          onAction={(evt) => {
            if (evt.actionType === 'destress') setIsDeStressOpen(true);
            if (evt.actionType === 'pomodoro') setIsPomodoroOpen(true);
            if (evt.actionType === 'diary') setOpenDrawer('diary');
            const res = affectionService.addXp(15);
            setAffection(res.nextState);
            setActiveProactiveCheckin(null);
          }}
          onDismiss={() => setActiveProactiveCheckin(null)}
        />
      )}

      <DeStressModeOverlay
        isOpen={isDeStressOpen}
        onClose={() => setIsDeStressOpen(false)}
      />

      <PomodoroTimerWidget
        isOpen={isPomodoroOpen}
        onClose={() => setIsPomodoroOpen(false)}
        onCycleComplete={() => {
          setAffection(affectionService.getState());
          nonVerbalAudioService.playCue('cheer');
        }}
      />

      <PairProgrammerDrawer
        isOpen={openDrawer === 'pair_prog'}
        onClose={() => setOpenDrawer('none')}
        onAnalyzeCode={() => {
          nonVerbalAudioService.playCue('hmmm');
        }}
      />

      <MeetingScribeDrawer
        isOpen={openDrawer === 'meetings'}
        onClose={() => setOpenDrawer('none')}
        sessions={meetingSessions}
        onAddSession={(s) => {
          setMeetingSessions([s, ...meetingSessions]);
          affectionService.addXp(25);
          setAffection(affectionService.getState());
        }}
      />

      <FlashcardsStudyDrawer
        isOpen={openDrawer === 'flashcards'}
        onClose={() => setOpenDrawer('none')}
        cards={flashcards}
        onAddCard={(card) => {
          const next = [
            {
              ...card,
              id: `fc_${Date.now()}`,
              intervalDays: 1,
              easeFactor: 2.5,
              repetitions: 0,
            },
            ...flashcards,
          ];
          setFlashcards(saveFlashcards(next));
        }}
        onUpdateCardRating={() => {
          setAffection(affectionService.getState());
        }}
      />

      <SystemWatchdogWidget
        isOpen={isWatchdogOpen}
        onClose={() => setIsWatchdogOpen(false)}
      />

      {/* Right-Side Desktop Activity & Confirmation Panel */}
      <DesktopActivityPanel
        isConnected={desktopBridge.isConnected}
        bridgeError={desktopBridge.bridgeError}
        emergencyStopped={desktopBridge.emergencyStopped}
        taintState={desktopBridge.taintState}
        pairing={desktopBridge.pairing}
        settings={desktopBridge.settings}
        pendingApprovals={desktopBridge.pendingApprovals}
        activities={desktopBridge.activities}
        isElectron={desktopBridge.isElectron}
        companionMode={desktopBridge.companionMode}
        startWithWindows={desktopBridge.startWithWindows}
        onUpdatePairing={desktopBridge.updatePairing}
        onApprove={(id) => void desktopBridge.approveAction(id)}
        onDeny={(id) => void desktopBridge.denyAction(id)}
        onEmergencyStop={() => void desktopBridge.triggerEmergencyStop()}
        onResumeBridge={() => void desktopBridge.resumeBridge()}
        onAddFolder={desktopBridge.addAllowedFolder}
        onRemoveFolder={desktopBridge.removeAllowedFolder}
        onPickFolderElectron={desktopBridge.pickAndAddFolder}
        onSaveApps={desktopBridge.saveAllowedApps}
        onToggleCompanionMode={() => void desktopBridge.toggleCompanionMode()}
        onToggleStartWithWindows={() => void desktopBridge.toggleStartWithWindows()}
      />

      {/* First-Run 3-Screen Onboarding & 18+ Adult Confirmation Gate */}
      {(!prefs.onboardingCompleted || !prefs.adultConfirmed) && (
        <FirstRunOnboarding
          t={t}
          language={prefs.language}
          onChangeLanguage={(language) => updatePrefs({ language })}
          initialAdultConfirmed={prefs.adultConfirmed}
          initialOutfit={prefs.outfitStyle}
          initialCompanionMode={prefs.companionMode}
          onComplete={({ adultConfirmed, outfitStyle, companionMode }) =>
            updatePrefs({
              adultConfirmed,
              outfitStyle,
              companionMode,
              onboardingCompleted: true,
            })
          }
        />
      )}
    </div>
  );
}
