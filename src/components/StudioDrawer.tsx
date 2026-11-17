import React, { useState } from 'react';
import {
  Clock,
  Palette,
  Shirt,
  Sparkles,
  Sun,
  Volume2,
  X,
} from 'lucide-react';
import type { AkaneTranslations } from '../i18n/translations';
import type {
  AmbientSoundscape,
  BackgroundMode,
  CompanionMode,
  LightingPreset,
  OutfitStyle,
  SleepTimerMinutes,
  UserPreferences,
} from '../types/akane';

interface StudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  t: AkaneTranslations;
  prefs: UserPreferences;
  sleepSecondsRemaining: number | null;
  onUpdatePrefs: (patch: Partial<UserPreferences>) => void;
}

export const StudioDrawer: React.FC<StudioDrawerProps> = ({
  isOpen,
  onClose,
  t,
  prefs,
  sleepSecondsRemaining,
  onUpdatePrefs,
}) => {
  const [tab, setTab] = useState<'outfit' | 'voice' | 'room'>('outfit');

  if (!isOpen) return null;

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none"
      role="dialog"
      aria-label={t.studio.title}
    >
      {/* Compact bottom-sliding drawer leaving character head & upper body visible above */}
      <div className="pointer-events-auto w-full max-w-2xl max-h-[52vh] flex flex-col rounded-t-3xl bg-[#0B0C0A]/94 backdrop-blur-2xl border-t border-x border-[#A3202B]/40 shadow-[0_-16px_48px_rgba(0,0,0,0.75)] pb-safe overflow-hidden">
        {/* Drag handle + header */}
        <div className="px-6 pt-3 pb-3 border-b border-[#F5F1EC]/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-[#A3202B]" />
            <h2 className="font-display text-xl font-bold text-[#F5F1EC]">
              {t.studio.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10"
            aria-label={t.common.close}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 3 Studio Tabs */}
        <div className="px-6 pt-3 pb-2 grid grid-cols-3 gap-2">
          {(
            [
              { id: 'outfit', label: t.studio.tabs.outfit, icon: Shirt },
              { id: 'voice', label: t.studio.tabs.voice, icon: Volume2 },
              { id: 'room', label: t.studio.tabs.room, icon: Palette },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[48px] px-3 py-2 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 border ${
                  active
                    ? 'bg-[#A3202B] border-[#F5F1EC]/30 text-[#F5F1EC]'
                    : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/75 hover:text-[#F5F1EC]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable tab body */}
        <div className="flex-1 overflow-y-auto akane-scroll px-6 py-4 space-y-5">
          {tab === 'outfit' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: 'default', label: t.studio.outfits.default },
                  { id: 'outfit_1', label: t.studio.outfits.outfit_1 },
                  { id: 'outfit_2', label: t.studio.outfits.outfit_2 },
                ] as Array<{ id: OutfitStyle; label: string }>
              ).map((outfit) => {
                const selected = prefs.outfitStyle === outfit.id;
                return (
                  <button
                    key={outfit.id}
                    type="button"
                    onClick={() => onUpdatePrefs({ outfitStyle: outfit.id })}
                    className={`min-h-[56px] px-4 py-3 rounded-2xl text-base font-semibold border flex items-center justify-between ${
                      selected
                        ? 'bg-[#A3202B] border-[#17BD7F] text-[#F5F1EC]'
                        : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:bg-white/10'
                    }`}
                  >
                    <span>{outfit.label}</span>
                    {selected && (
                      <span className="w-3 h-3 rounded-full bg-[#17BD7F]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'voice' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-base font-semibold text-[#F5F1EC]">
                  {t.studio.voiceMode}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'companion', label: t.studio.modes.companion },
                      { id: 'tsundere', label: t.studio.modes.tsundere },
                      { id: 'wife', label: t.studio.modes.wife },
                    ] as Array<{ id: CompanionMode; label: string }>
                  ).map((modeOpt) => (
                    <button
                      key={modeOpt.id}
                      type="button"
                      onClick={() => onUpdatePrefs({ companionMode: modeOpt.id })}
                      className={`min-h-[48px] px-3 py-2 rounded-2xl text-base font-medium border ${
                        prefs.companionMode === modeOpt.id
                          ? 'bg-[#A3202B] border-[#F5F1EC]/30 text-[#F5F1EC]'
                          : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                      }`}
                    >
                      {modeOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-base font-semibold text-[#F5F1EC]">
                  {t.studio.soundscape}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'off', label: t.studio.soundscapes.off },
                      { id: 'rain', label: t.studio.soundscapes.rain },
                      { id: 'whitenoise', label: t.studio.soundscapes.whitenoise },
                    ] as Array<{ id: AmbientSoundscape; label: string }>
                  ).map((sound) => (
                    <button
                      key={sound.id}
                      type="button"
                      onClick={() => onUpdatePrefs({ ambientSoundscape: sound.id })}
                      className={`min-h-[48px] px-3 py-2 rounded-2xl text-base font-medium border ${
                        prefs.ambientSoundscape === sound.id
                          ? 'bg-[#A3202B] border-[#F5F1EC]/30 text-[#F5F1EC]'
                          : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                      }`}
                    >
                      {sound.label}
                    </button>
                  ))}
                </div>
              </div>

              {prefs.ambientSoundscape !== 'off' && (
                <label className="block space-y-2">
                  <div className="flex justify-between text-base text-[#F5F1EC]">
                    <span>{t.studio.soundVolume}</span>
                    <span className="font-mono">
                      {Math.round(prefs.ambientVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.9}
                    step={0.05}
                    value={prefs.ambientVolume}
                    onChange={(e) =>
                      onUpdatePrefs({ ambientVolume: parseFloat(e.target.value) })
                    }
                    className="w-full h-3 accent-[#A3202B] cursor-pointer"
                  />
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({ nightWhisperMode: !prefs.nightWhisperMode })
                  }
                  className={`min-h-[48px] px-4 py-2 rounded-2xl text-base font-medium border flex items-center justify-between ${
                    prefs.nightWhisperMode
                      ? 'bg-[#6F0E19] border-[#A3202B] text-[#F5F1EC]'
                      : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85'
                  }`}
                >
                  <span>{t.studio.nightWhisper}</span>
                  <span
                    className={`w-3 h-3 rounded-full ${
                      prefs.nightWhisperMode ? 'bg-[#17BD7F]' : 'bg-white/25'
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => onUpdatePrefs({ isStudying: !prefs.isStudying })}
                  className={`min-h-[48px] px-4 py-2 rounded-2xl text-base font-medium border flex items-center justify-between ${
                    prefs.isStudying
                      ? 'bg-[#E0A030]/25 border-[#E0A030] text-[#F5F1EC]'
                      : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85'
                  }`}
                >
                  <span>{t.studio.studyFocus}</span>
                  <span
                    className={`w-3 h-3 rounded-full ${
                      prefs.isStudying ? 'bg-[#E0A030]' : 'bg-white/25'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {tab === 'room' && (
            <div className="space-y-5">
              {/* Background mode */}
              <div className="space-y-2">
                <p className="text-base font-semibold text-[#F5F1EC]">
                  {t.studio.roomBg}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'dark', label: t.studio.bgDark },
                      { id: 'transparent', label: t.studio.bgTransparent },
                    ] as Array<{ id: BackgroundMode; label: string }>
                  ).map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => onUpdatePrefs({ backgroundMode: bg.id })}
                      className={`min-h-[48px] px-3 py-2 rounded-2xl text-base font-medium border ${
                        prefs.backgroundMode === bg.id
                          ? 'bg-[#A3202B] border-[#F5F1EC]/30 text-[#F5F1EC]'
                          : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time-of-day lighting */}
              <div className="space-y-2">
                <p className="text-base font-semibold text-[#F5F1EC] flex items-center gap-2">
                  <Sun className="w-5 h-5 text-[#E0A030]" />
                  <span>{t.studio.lightingTitle}</span>
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {(
                    [
                      { id: 'auto', label: t.studio.lighting.auto },
                      { id: 'morning', label: t.studio.lighting.morning },
                      { id: 'day', label: t.studio.lighting.day },
                      { id: 'evening', label: t.studio.lighting.evening },
                      { id: 'night', label: t.studio.lighting.night },
                    ] as Array<{ id: LightingPreset; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdatePrefs({ lightingPreset: opt.id })}
                      className={`min-h-[48px] px-2 py-2 rounded-2xl text-base font-medium border text-center ${
                        prefs.lightingPreset === opt.id
                          ? 'bg-[#A3202B] border-[#F5F1EC]/30 text-[#F5F1EC]'
                          : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sleep timer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-[#F5F1EC] flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#A3202B]" />
                    <span>{t.studio.sleepTimer}</span>
                  </p>
                  {sleepSecondsRemaining !== null && (
                    <span className="font-mono text-base text-[#17BD7F]">
                      {formatCountdown(sleepSecondsRemaining)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([0, 15, 30, 60] as SleepTimerMinutes[]).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onUpdatePrefs({ sleepTimerMinutes: mins })}
                      className={`min-h-[48px] px-3 py-2 rounded-2xl text-base font-medium border ${
                        prefs.sleepTimerMinutes === mins
                          ? 'bg-[#A3202B] border-[#F5F1EC]/30 text-[#F5F1EC]'
                          : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                      }`}
                    >
                      {mins === 0 ? t.studio.timerOff : `${mins} ${t.studio.timerMins}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
