import React, { useRef, useImperativeHandle } from 'react';
import {
  AkaneVideoCharacter,
  type AkaneVideoCharacterHandle,
  type TriggerRequestOptions,
} from './AkaneVideoCharacter';
import { AkaneVRM3DAvatar, type AkaneVRM3DAvatarHandle } from './AkaneVRM3DAvatar';
import type {
  AvatarActivityState,
  AvatarRenderMode,
  BackgroundMode,
  CompanionMode,
  DirectorDecision,
  DirectorSnapshot,
  GazeCoordinates,
  LightingPreset,
  OutfitStyle,
  TalkMood,
} from '../types/akane';
import { Sparkles, Video } from 'lucide-react';

export type { TriggerRequestOptions };

export interface AkaneAvatarStageHandle {
  requestClip: (clipId: string, options?: TriggerRequestOptions) => DirectorDecision | void;
  getSnapshot: () => DirectorSnapshot;
}

interface AkaneAvatarStageProps {
  activityState: AvatarActivityState;
  audioLevel: number;
  isUserSpeaking?: boolean;
  interruptedSeq?: number;
  isLiveConnected?: boolean;
  backgroundMode: BackgroundMode;
  companionMode: CompanionMode;
  avatarRenderMode?: AvatarRenderMode;
  gaze?: GazeCoordinates;
  outfitStyle: OutfitStyle;
  nightWhisperMode: boolean;
  lightingPreset?: LightingPreset;
  mood?: TalkMood;
  framingZoom?: number;
  framingOffsetY?: number;
  onSnapshotChange?: (snapshot: DirectorSnapshot) => void;
  onAvatarClick?: () => void;
  onSwitchRenderMode?: (mode: AvatarRenderMode) => void;
}

function resolveLightingTime(preset: LightingPreset): 'morning' | 'day' | 'evening' | 'night' {
  if (preset !== 'auto') return preset;
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 11) return 'morning';
  if (hr >= 11 && hr < 17) return 'day';
  if (hr >= 17 && hr < 21) return 'evening';
  return 'night';
}

export const AkaneAvatarStage = React.forwardRef<AkaneAvatarStageHandle, AkaneAvatarStageProps>(
  function AkaneAvatarStage(
    {
      activityState,
      audioLevel,
      isUserSpeaking = false,
      interruptedSeq = 0,
      backgroundMode,
      companionMode,
      avatarRenderMode = 'vrm_3d',
      gaze,
      outfitStyle,
      nightWhisperMode,
      lightingPreset = 'auto',
      mood = 'neutral',
      framingZoom = 1.0,
      framingOffsetY = 0,
      onSnapshotChange,
      onAvatarClick,
      onSwitchRenderMode,
    },
    ref
  ) {
    const isTransparent = backgroundMode === 'transparent';
    const auraScale =
      activityState === 'speaking' ? 1 + Math.min(0.22, audioLevel * 0.45) : 1;
    const lighting = resolveLightingTime(lightingPreset);

    const videoRef = useRef<AkaneVideoCharacterHandle | null>(null);
    const vrmRef = useRef<AkaneVRM3DAvatarHandle | null>(null);

    // Treat 'vrm_3d' and legacy 'anime_live2d' as 3D VRM VTuber mode
    const is3DMode = avatarRenderMode === 'vrm_3d' || avatarRenderMode === 'anime_live2d';

    useImperativeHandle(
      ref,
      () => ({
        requestClip: (clipId: string, options?: TriggerRequestOptions) => {
          if (!is3DMode && videoRef.current) {
            return videoRef.current.requestClip(clipId, options || { priority: 'normal', source: 'director' });
          }

          // In 3D VRM mode, translate clip requests into dynamic 3D reactions
          if (vrmRef.current) {
            if (clipId.includes('cheer') || clipId.includes('happy')) {
              vrmRef.current.triggerReaction('happy');
            } else if (clipId.includes('think')) {
              vrmRef.current.triggerReaction('nod');
            } else {
              vrmRef.current.triggerReaction('nod');
            }
          }

          const fallbackDecision: DirectorDecision = {
            clipId,
            source: options?.source ?? 'director',
            badge: 'VTuber 3D',
            blendWeight: 1,
            cooldownRemainingMs: 0,
          };
          return fallbackDecision;
        },
        getSnapshot: () => {
          if (!is3DMode && videoRef.current) {
            return videoRef.current.getSnapshot();
          }

          return {
            characterState: activityState === 'speaking' ? 'talk' : activityState === 'listening' ? 'listen' : 'idle',
            activeClipId: 'vrm_3d_live',
            activeBadge: 'VTuber 3D',
            activeSource: 'director',
            cooldownRemainingMs: 0,
            isOverridePlaying: false,
            lastDecision: null,
            recentDecisions: [],
          };
        },
      }),
      [is3DMode, activityState]
    );

    const stageBgGradient =
      lighting === 'morning'
        ? 'linear-gradient(180deg, rgba(163, 32, 43, 0.72) 0%, rgba(111, 14, 25, 0.88) 44%, #0B0C0A 100%)'
        : lighting === 'day'
          ? 'linear-gradient(180deg, #A3202B 0%, #6F0E19 42%, #0B0C0A 100%)'
          : lighting === 'evening'
            ? 'linear-gradient(180deg, rgba(163, 32, 43, 0.85) 0%, #6F0E19 52%, #0B0C0A 100%)'
            : 'linear-gradient(180deg, rgba(111, 14, 25, 0.72) 0%, rgba(56, 8, 14, 0.88) 48%, #0B0C0A 100%)';

    const auraRadial =
      lighting === 'morning'
        ? 'radial-gradient(circle, rgba(224,160,48,0.22) 0%, rgba(163,32,43,0.28) 55%, transparent 100%)'
        : companionMode === 'tsundere'
          ? 'radial-gradient(circle, rgba(163,32,43,0.38) 0%, rgba(224,160,48,0.14) 60%, transparent 100%)'
          : 'radial-gradient(circle, rgba(163,32,43,0.40) 0%, rgba(111,14,25,0.20) 60%, transparent 100%)';

    return (
      <div
        className={`relative w-full h-full flex items-end justify-center overflow-hidden select-none ${
          isTransparent ? 'bg-transparent' : 'bg-[#0B0C0A]'
        }`}
        style={{ '--audio-level': audioLevel.toFixed(3) } as React.CSSProperties}
      >
        {!isTransparent && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: nightWhisperMode ? 0.55 : 1,
                background: stageBgGradient,
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] rounded-full blur-[110px] transition-transform duration-150"
              style={{
                background: auraRadial,
                opacity: nightWhisperMode
                  ? 0.32
                  : 0.65 + Math.min(0.35, audioLevel * 0.5),
                transform: `scale(${auraScale})`,
              }}
            />
          </>
        )}

        {/* Floating Render Mode Switcher Pill */}
        {onSwitchRenderMode && (
          <div className="absolute top-20 left-6 z-30 flex items-center p-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md shadow-xl">
            <button
              type="button"
              onClick={() => onSwitchRenderMode('vrm_3d')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                is3DMode
                  ? 'bg-[#A3202B] text-[#F5F1EC] shadow-md shadow-[#A3202B]/40'
                  : 'text-[#F5F1EC]/70 hover:text-[#F5F1EC]'
              }`}
              title="تفعيل نمط الأفاتار ثلاثي الأبعاد بالكامل (VTuber 3D)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>3D VTuber</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchRenderMode('video')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                !is3DMode
                  ? 'bg-[#A3202B] text-[#F5F1EC] shadow-md shadow-[#A3202B]/40'
                  : 'text-[#F5F1EC]/70 hover:text-[#F5F1EC]'
              }`}
              title="تفعيل نمط الفيديو الحقيقي الواقعي (Chroma Key)"
            >
              <Video className="w-3.5 h-3.5" />
              <span>فيديو واقعي</span>
            </button>
          </div>
        )}

        {/* Dynamic Character Render */}
        {is3DMode ? (
          <AkaneVRM3DAvatar
            ref={vrmRef}
            activityState={activityState}
            audioLevel={audioLevel}
            isUserSpeaking={isUserSpeaking}
            companionMode={companionMode}
            mood={mood}
            gaze={gaze}
            outfitStyle={outfitStyle}
            framingZoom={framingZoom}
            framingOffsetY={framingOffsetY}
            modelUrl="/models/akane.vrm"
            onAvatarClick={onAvatarClick}
          />
        ) : (
          <AkaneVideoCharacter
            ref={videoRef}
            activityState={activityState}
            audioLevel={audioLevel}
            isUserSpeaking={isUserSpeaking}
            interruptedSeq={interruptedSeq}
            outfitStyle={outfitStyle}
            mood={mood}
            framingZoom={framingZoom}
            framingOffsetY={framingOffsetY}
            gaze={gaze}
            avatarRenderMode="video"
            companionMode={companionMode}
            onAvatarClick={onAvatarClick}
            onSnapshotChange={onSnapshotChange}
          />
        )}
      </div>
    );
  }
);
