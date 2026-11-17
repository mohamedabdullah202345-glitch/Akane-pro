import React, { useState } from 'react';
import {
  Camera,
  Check,
  Mic,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { AkaneTranslations } from '../i18n/translations';
import type { CompanionMode, LanguageCode, OutfitStyle } from '../types/akane';

interface FirstRunOnboardingProps {
  t: AkaneTranslations;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  initialAdultConfirmed: boolean;
  initialOutfit: OutfitStyle;
  initialCompanionMode: CompanionMode;
  onComplete: (result: {
    adultConfirmed: boolean;
    outfitStyle: OutfitStyle;
    companionMode: CompanionMode;
  }) => void;
}

export const FirstRunOnboarding: React.FC<FirstRunOnboardingProps> = ({
  t,
  language,
  onChangeLanguage,
  initialAdultConfirmed,
  initialOutfit,
  initialCompanionMode,
  onComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [adultConfirmed, setAdultConfirmed] = useState(initialAdultConfirmed);
  const [micGranted, setMicGranted] = useState(false);
  const [camGranted, setCamGranted] = useState(false);
  const [permMessage, setPermMessage] = useState<string | null>(null);
  const [soundTested, setSoundTested] = useState(false);
  const [outfitStyle, setOutfitStyle] = useState<OutfitStyle>(initialOutfit);
  const [companionMode, setCompanionMode] =
    useState<CompanionMode>(initialCompanionMode);

  const requestMic = async () => {
    setPermMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      setMicGranted(true);
    } catch {
      setPermMessage(t.onboarding.deniedHint);
    }
  };

  const requestCam = async () => {
    setPermMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((tr) => tr.stop());
      setCamGranted(true);
    } catch {
      setPermMessage(t.onboarding.deniedHint);
    }
  };

  const playChime = () => {
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.001, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.09 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.45);
      });
      setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 900);
      setSoundTested(true);
    } catch {
      setSoundTested(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0C0A]/92 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={t.onboarding.s1Title}
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#0B0C0A] border border-[#A3202B]/50 shadow-[0_24px_64px_rgba(111,14,25,0.6)] p-6 space-y-6 text-[#F5F1EC]">
        {/* Top Row: Step indicator + Language toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-mono text-[#E0A030]">
              {t.onboarding.stepLabel} {step} / 3
            </span>
            <span className="text-base text-[#F5F1EC]/70">· {t.aiCompanionLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => onChangeLanguage(language === 'en' ? 'ar' : 'en')}
            className="min-h-[48px] px-4 py-2 rounded-2xl border border-[#F5F1EC]/25 hover:border-[#F5F1EC]/50 text-base font-medium text-[#F5F1EC]"
          >
            {language === 'en' ? 'العربية' : 'English'}
          </button>
        </div>

        {/* SCREEN 1: 18+ Safety & Permissions */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-[#17BD7F] text-base font-semibold">
                <ShieldCheck className="w-5 h-5" />
                <span>18+ Safety &amp; Permissions</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-[#F5F1EC]">
                {t.onboarding.s1Title}
              </h1>
              <p className="text-base text-[#F5F1EC]/85 leading-relaxed">
                {t.onboarding.s1Body}
              </p>
            </div>

            <label className="flex items-start gap-3 p-4 rounded-2xl bg-[#6F0E19]/35 border border-[#A3202B]/60 cursor-pointer min-h-[48px]">
              <input
                type="checkbox"
                checked={adultConfirmed}
                onChange={(e) => setAdultConfirmed(e.target.checked)}
                className="mt-1 w-6 h-6 accent-[#A3202B] shrink-0 cursor-pointer"
              />
              <span className="text-base font-medium text-[#F5F1EC] leading-snug">
                {t.onboarding.adultCheck}
              </span>
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/15">
                <div className="flex items-center gap-3">
                  <Mic className="w-5 h-5 text-[#A3202B] shrink-0" />
                  <span className="text-base font-medium">{t.onboarding.micPerm}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void requestMic()}
                  className={`min-h-[48px] px-4 py-2 rounded-xl text-base font-semibold shrink-0 ${
                    micGranted
                      ? 'bg-[#17BD7F]/20 text-[#17BD7F] border border-[#17BD7F]/50'
                      : 'bg-[#A3202B] text-[#F5F1EC] hover:bg-[#b82834]'
                  }`}
                >
                  {micGranted ? t.onboarding.granted : t.onboarding.grantBtn}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/15">
                <div className="flex items-center gap-3">
                  <Camera className="w-5 h-5 text-[#A3202B] shrink-0" />
                  <span className="text-base font-medium">{t.onboarding.camPerm}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void requestCam()}
                  className={`min-h-[48px] px-4 py-2 rounded-xl text-base font-semibold shrink-0 ${
                    camGranted
                      ? 'bg-[#17BD7F]/20 text-[#17BD7F] border border-[#17BD7F]/50'
                      : 'bg-white/10 text-[#F5F1EC] hover:bg-white/20'
                  }`}
                >
                  {camGranted ? t.onboarding.granted : t.onboarding.grantBtn}
                </button>
              </div>

              {permMessage && (
                <p className="text-base text-[#E0A030]">{permMessage}</p>
              )}
            </div>

            <button
              type="button"
              disabled={!adultConfirmed}
              onClick={() => setStep(2)}
              className="w-full min-h-[52px] rounded-2xl bg-[#A3202B] hover:bg-[#b82834] disabled:opacity-40 text-[#F5F1EC] text-lg font-semibold"
            >
              {t.onboarding.nextBtn}
            </button>
          </div>
        )}

        {/* SCREEN 2: Sound Test */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-[#E0A030] text-base font-semibold">
                <Volume2 className="w-5 h-5" />
                <span>{t.onboarding.s2Title}</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-[#F5F1EC]">
                {t.onboarding.s2Title}
              </h1>
              <p className="text-base text-[#F5F1EC]/85 leading-relaxed">
                {t.onboarding.s2Body}
              </p>
            </div>

            <button
              type="button"
              onClick={playChime}
              className="w-full min-h-[64px] rounded-2xl bg-[#6F0E19]/60 border border-[#A3202B] hover:bg-[#6F0E19] text-[#F5F1EC] text-lg font-semibold flex items-center justify-center gap-3"
            >
              <Volume2 className="w-6 h-6" />
              <span>{t.onboarding.playTestTone}</span>
              {soundTested && <Check className="w-5 h-5 text-[#17BD7F]" />}
            </button>

            {soundTested && (
              <p className="text-base text-[#17BD7F] text-center font-medium">
                {t.onboarding.tonePlayed}
              </p>
            )}

            <button
              type="button"
              onClick={() => setStep(3)}
              className="w-full min-h-[52px] rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-lg font-semibold"
            >
              {t.onboarding.nextBtn}
            </button>
          </div>
        )}

        {/* SCREEN 3: Character Choice -> Enter Stage */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-[#17BD7F] text-base font-semibold">
                <Sparkles className="w-5 h-5" />
                <span>{t.onboarding.s3Title}</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-[#F5F1EC]">
                {t.onboarding.s3Title}
              </h1>
              <p className="text-base text-[#F5F1EC]/85 leading-relaxed">
                {t.onboarding.s3Body}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-base font-semibold text-[#F5F1EC]">
                {t.onboarding.chooseOutfit}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'default', label: t.studio.outfits.default },
                    { id: 'outfit_1', label: t.studio.outfits.outfit_1 },
                    { id: 'outfit_2', label: t.studio.outfits.outfit_2 },
                  ] as Array<{ id: OutfitStyle; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOutfitStyle(item.id)}
                    className={`min-h-[52px] px-2 py-3 rounded-2xl text-base font-medium border text-center ${
                      outfitStyle === item.id
                        ? 'bg-[#A3202B] border-[#F5F1EC]/60 text-[#F5F1EC]'
                        : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-base font-semibold text-[#F5F1EC]">
                {t.onboarding.chooseTone}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'companion', label: t.studio.modes.companion },
                    { id: 'tsundere', label: t.studio.modes.tsundere },
                    { id: 'wife', label: t.studio.modes.wife },
                  ] as Array<{ id: CompanionMode; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCompanionMode(item.id)}
                    className={`min-h-[52px] px-2 py-3 rounded-2xl text-base font-medium border text-center ${
                      companionMode === item.id
                        ? 'bg-[#A3202B] border-[#F5F1EC]/60 text-[#F5F1EC]'
                        : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/80 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onComplete({
                  adultConfirmed: true,
                  outfitStyle,
                  companionMode,
                })
              }
              className="w-full min-h-[56px] rounded-2xl bg-[#17BD7F] hover:bg-[#19cf8b] text-[#0B0C0A] text-lg font-bold shadow-xl"
            >
              {t.onboarding.enterStage}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
