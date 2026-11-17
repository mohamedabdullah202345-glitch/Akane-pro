import React, { useState } from 'react';
import {
  Brain,
  CheckSquare,
  Globe,
  LogIn,
  LogOut,
  RotateCcw,
  Shield,
  Shirt,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Video,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import type { AkaneTranslations } from '../i18n/translations';
import type { LanguageCode, UserPreferences } from '../types/akane';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  t: AkaneTranslations;
  prefs: UserPreferences;
  userEmail: string | null;
  userName: string | null;
  isSignedIn: boolean;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onUpdatePrefs: (patch: Partial<UserPreferences>) => void;
  onOpenStudio: () => void;
  onOpenMemory: () => void;
  onOpenMissions: () => void;
  onOpenDirector: () => void;
  onDeleteAllData: () => Promise<void>;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  t,
  prefs,
  userEmail,
  userName,
  isSignedIn,
  onGoogleSignIn,
  onSignOut,
  onUpdatePrefs,
  onOpenStudio,
  onOpenMemory,
  onOpenMissions,
  onOpenDirector,
  onDeleteAllData,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedBanner, setDeletedBanner] = useState(false);

  if (!isOpen) return null;

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteAllData();
      setConfirmDelete(false);
      setDeletedBanner(true);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0B0C0A]/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={t.settings.title}
    >
      <div className="w-full max-w-xl max-h-[86vh] flex flex-col rounded-3xl bg-[#0B0C0A] border border-[#A3202B]/40 shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden text-[#F5F1EC]">
        <div className="px-6 py-4 border-b border-[#F5F1EC]/12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-[#A3202B]" />
            <h2 className="font-display text-xl font-bold">{t.settings.title}</h2>
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

        <div className="flex-1 overflow-y-auto akane-scroll p-6 space-y-6">
          {/* Persona Switcher */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#A3202B]" />
              <span>نمط الشخصية (Persona Switcher)</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'companion', label: 'الرفيقة الحنونة' },
                { id: 'strict_dev', label: 'المبرمجة الصارمة' },
                { id: 'cheerful_friend', label: 'الصديقة المرحة' },
                { id: 'mentor_coach', label: 'المدربة الشخصية' },
                { id: 'tsundere', label: 'المشاكسة اللطيفة' },
                { id: 'wife', label: 'الزوجة الدافئة' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdatePrefs({ companionMode: p.id as any })}
                  className={`p-3 rounded-2xl text-xs font-semibold border text-center transition-colors ${
                    prefs.companionMode === p.id
                      ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC]'
                      : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Avatar Engine Switcher */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#A3202B]" />
              <span>محرك الأفاتار (Avatar Engine)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdatePrefs({ avatarRenderMode: 'vrm_3d' })}
                className={`p-3 rounded-2xl text-xs font-semibold border text-center transition-all ${
                  prefs.avatarRenderMode === 'vrm_3d' || prefs.avatarRenderMode === 'anime_live2d'
                    ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC] shadow-md shadow-[#A3202B]/30'
                    : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">🌟 مجسم 3D فيتيوبر (VTuber 3D)</div>
                <div className="text-[10px] text-[#F5F1EC]/70">تجسيم حقيقي، تتبع العين والرمش، حركة الشفاه وفيزياء الحركة</div>
              </button>
              <button
                type="button"
                onClick={() => onUpdatePrefs({ avatarRenderMode: 'video' })}
                className={`p-3 rounded-2xl text-xs font-semibold border text-center transition-all ${
                  prefs.avatarRenderMode === 'video'
                    ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC] shadow-md shadow-[#A3202B]/30'
                    : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">🎬 فيديو سينمائي واقعي (Chroma)</div>
                <div className="text-[10px] text-[#F5F1EC]/70">كليبات الفيديو المسجلة مع إزالة الخلفية الخضراء تلقائياً</div>
              </button>
            </div>
          </section>

          {/* Akane Wardrobe & Outfits */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Shirt className="w-5 h-5 text-[#A3202B]" />
              <span>خزانة أزياء أكاني (Wardrobe Outfits)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onUpdatePrefs({ outfitStyle: 'default' })}
                className={`p-3 rounded-2xl text-xs font-semibold border text-center transition-all ${
                  prefs.outfitStyle === 'default'
                    ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC] shadow-md shadow-[#A3202B]/30'
                    : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">🌸 كيمونو تقليدي</div>
                <div className="text-[10px] text-[#F5F1EC]/70">كيمونو أبيض وأحمر أصلي</div>
              </button>
              <button
                type="button"
                onClick={() => onUpdatePrefs({ outfitStyle: 'outfit_1' })}
                className={`p-3 rounded-2xl text-xs font-semibold border text-center transition-all ${
                  prefs.outfitStyle === 'outfit_1'
                    ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC] shadow-md shadow-[#A3202B]/30'
                    : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">⚡ مبرمجة سايبربانك</div>
                <div className="text-[10px] text-[#F5F1EC]/70">هودي تيك داكن مع نظارة مطورة</div>
              </button>
              <button
                type="button"
                onClick={() => onUpdatePrefs({ outfitStyle: 'outfit_2' })}
                className={`p-3 rounded-2xl text-xs font-semibold border text-center transition-all ${
                  prefs.outfitStyle === 'outfit_2'
                    ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC] shadow-md shadow-[#A3202B]/30'
                    : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">📚 كارديجان مدرسي كاجوال</div>
                <div className="text-[10px] text-[#F5F1EC]/70">كارديجان صوف دافئ وربطة عنق</div>
              </button>
            </div>
          </section>

          {/* Arabic Dialect Switcher */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#A3202B]" />
              <span>اللهجة ولغة الحوار (Dialect Switcher)</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'ar_eg', label: 'اللهجة المصرية' },
                { id: 'ar_gulf', label: 'اللهجة الخليجية' },
                { id: 'ar_fusha', label: 'العربية الفصحى' },
                { id: 'en', label: 'English' },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onUpdatePrefs({ arabicDialect: d.id as any })}
                  className={`p-2.5 rounded-2xl text-xs font-semibold border text-center transition-colors ${
                    prefs.arabicDialect === d.id
                      ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC]'
                      : 'bg-white/[0.04] border-white/10 text-[#F5F1EC]/80 hover:bg-white/10'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </section>

          {/* Behavioral Boundaries Sliders */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#A3202B]" />
              <span>تخصيص القيم والحدود الأخلاقية (Persona Tuning)</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between">
                  <span>المزاح والفكاهة:</span>
                  <span className="font-mono text-[#A3202B]">{prefs.personaBoundaries?.humor ?? 75}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.personaBoundaries?.humor ?? 75}
                  onChange={(e) =>
                    onUpdatePrefs({
                      personaBoundaries: {
                        ...(prefs.personaBoundaries || { humor: 75, strictness: 40, empathy: 90, proactivity: 65 }),
                        humor: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full h-2 accent-[#A3202B] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between">
                  <span>الجدية والانضباط:</span>
                  <span className="font-mono text-[#A3202B]">{prefs.personaBoundaries?.strictness ?? 40}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.personaBoundaries?.strictness ?? 40}
                  onChange={(e) =>
                    onUpdatePrefs({
                      personaBoundaries: {
                        ...(prefs.personaBoundaries || { humor: 75, strictness: 40, empathy: 90, proactivity: 65 }),
                        strictness: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full h-2 accent-[#A3202B] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between">
                  <span>التعاطف والدعم النفسي:</span>
                  <span className="font-mono text-[#A3202B]">{prefs.personaBoundaries?.empathy ?? 90}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.personaBoundaries?.empathy ?? 90}
                  onChange={(e) =>
                    onUpdatePrefs({
                      personaBoundaries: {
                        ...(prefs.personaBoundaries || { humor: 75, strictness: 40, empathy: 90, proactivity: 65 }),
                        empathy: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full h-2 accent-[#A3202B] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between">
                  <span>المبادرة بالسؤال والاقتراح:</span>
                  <span className="font-mono text-[#A3202B]">{prefs.personaBoundaries?.proactivity ?? 65}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.personaBoundaries?.proactivity ?? 65}
                  onChange={(e) =>
                    onUpdatePrefs({
                      personaBoundaries: {
                        ...(prefs.personaBoundaries || { humor: 75, strictness: 40, empathy: 90, proactivity: 65 }),
                        proactivity: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full h-2 accent-[#A3202B] cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* Privacy & Incognito Toggle */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#17BD7F]" />
              <span>وضع الخصوصية والنسيان الفوري</span>
            </h3>
            <button
              type="button"
              onClick={() => onUpdatePrefs({ incognitoMode: !prefs.incognitoMode })}
              className={`w-full p-4 rounded-2xl border flex items-center justify-between text-start ${
                prefs.incognitoMode
                  ? 'bg-purple-900/40 border-purple-400'
                  : 'bg-white/[0.04] border-white/10'
              }`}
            >
              <div>
                <p className="text-sm font-semibold">وضع التصفح الخفي (Incognito Mode)</p>
                <p className="text-xs text-[#F5F1EC]/60">
                  عند التفعيل، لا يتم حفظ أي ذاكرة أو محادثة في قاعدة البيانات.
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-xl text-xs font-bold ${
                  prefs.incognitoMode ? 'bg-purple-400 text-black' : 'bg-white/10 text-white'
                }`}
              >
                {prefs.incognitoMode ? 'نشط' : 'معطل'}
              </span>
            </button>
          </section>

          {/* Sensory & Voice Intelligence */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#A3202B]" />
              <span>الذكاء الصوتي والحسي المتقدم</span>
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs({ voiceEmotionDetection: !prefs.voiceEmotionDetection })
                }
                className="w-full p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs"
              >
                <span>تحليل نبرة الصوت والمشاعر اللحظية (Emotion Detection)</span>
                <span className="font-bold text-[#A3202B]">
                  {prefs.voiceEmotionDetection ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onUpdatePrefs({ nonVerbalCues: !prefs.nonVerbalCues })}
                className="w-full p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs"
              >
                <span>ردود الفعل غير الكلامية (التنهد، الضحك، الهمهمة)</span>
                <span className="font-bold text-[#A3202B]">{prefs.nonVerbalCues ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => onUpdatePrefs({ smartBargeIn: !prefs.smartBargeIn })}
                className="w-full p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs"
              >
                <span>المقاطعة الحية بدون تأخير (Smart Zero-Latency Barge-in)</span>
                <span className="font-bold text-[#A3202B]">{prefs.smartBargeIn ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </section>

          {/* Account */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold text-[#F5F1EC]">
              {t.settings.account}
            </h3>
            {isSignedIn ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/15">
                <div className="min-w-0">
                  <p className="text-base font-medium truncate">
                    {userName || userEmail}
                  </p>
                  {userEmail && (
                    <p className="text-base text-[#F5F1EC]/70 truncate">
                      {userEmail}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[48px] px-4 py-2 rounded-2xl bg-[#6F0E19] hover:bg-[#A3202B] text-[#F5F1EC] text-base font-semibold flex items-center gap-2 shrink-0"
                >
                  <LogOut className="w-5 h-5" />
                  <span>{t.settings.signOut}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-semibold flex items-center justify-center gap-2.5"
              >
                <LogIn className="w-5 h-5" />
                <span>{t.settings.signIn}</span>
              </button>
            )}
          </section>

          {/* Language & Accessibility */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#A3202B]" />
              <span>{t.settings.sections.accessibility}</span>
            </h3>

            <div className="space-y-2">
              <p className="text-base text-[#F5F1EC]/85">
                {t.settings.languageLabel}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'en', label: t.settings.langEn },
                    { id: 'ar', label: t.settings.langAr },
                  ] as Array<{ id: LanguageCode; label: string }>
                ).map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => onUpdatePrefs({ language: lang.id })}
                    className={`min-h-[48px] px-4 py-2 rounded-2xl text-base font-semibold border ${
                      prefs.language === lang.id
                        ? 'bg-[#A3202B] border-[#F5F1EC]/35 text-[#F5F1EC]'
                        : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:bg-white/10'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onUpdatePrefs({ biggerText: !prefs.biggerText })}
              className={`w-full min-h-[56px] p-4 rounded-2xl border flex items-center justify-between gap-4 text-start ${
                prefs.biggerText
                  ? 'bg-[#6F0E19]/60 border-[#17BD7F]'
                  : 'bg-white/[0.04] border-[#F5F1EC]/15'
              }`}
            >
              <div className="flex items-start gap-3">
                <Type className="w-5 h-5 mt-1 text-[#E0A030] shrink-0" />
                <div>
                  <p className="text-base font-semibold">{t.settings.biggerText}</p>
                  <p className="text-base text-[#F5F1EC]/75">
                    {t.settings.biggerTextDesc}
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-xl text-base font-bold shrink-0 ${
                  prefs.biggerText
                    ? 'bg-[#17BD7F] text-[#0B0C0A]'
                    : 'bg-white/10 text-[#F5F1EC]'
                }`}
              >
                {prefs.biggerText ? 'ON' : 'OFF'}
              </span>
            </button>
          </section>

          {/* Studio & Framing */}
          <section className="space-y-4 pt-4 border-t border-[#F5F1EC]/12">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#A3202B]" />
                <span>{t.settings.sections.studio}</span>
              </h3>
              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs({ framingZoom: 1.0, framingOffsetY: 0 })
                }
                className="min-h-[48px] px-3 py-2 rounded-xl text-base text-[#F5F1EC]/80 hover:text-[#F5F1EC] flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t.settings.resetFraming}</span>
              </button>
            </div>

            <label className="block space-y-1.5">
              <div className="flex justify-between text-base">
                <span>{t.settings.framingZoom}</span>
                <span className="font-mono">{prefs.framingZoom.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={1.4}
                step={0.02}
                value={prefs.framingZoom}
                onChange={(e) =>
                  onUpdatePrefs({ framingZoom: parseFloat(e.target.value) })
                }
                className="w-full h-3 accent-[#A3202B] cursor-pointer"
              />
            </label>

            <label className="block space-y-1.5">
              <div className="flex justify-between text-base">
                <span>{t.settings.framingOffset}</span>
                <span className="font-mono">{prefs.framingOffsetY}px</span>
              </div>
              <input
                type="range"
                min={-80}
                max={80}
                step={2}
                value={prefs.framingOffsetY}
                onChange={(e) =>
                  onUpdatePrefs({ framingOffsetY: parseInt(e.target.value, 10) })
                }
                className="w-full h-3 accent-[#A3202B] cursor-pointer"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenStudio();
                }}
                className="min-h-[48px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/12 border border-[#F5F1EC]/15 text-base font-medium"
              >
                {t.settings.openStudio}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDirector();
                }}
                className="min-h-[48px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/12 border border-[#F5F1EC]/15 text-base font-medium"
              >
                {t.settings.openDirector}
              </button>
            </div>
          </section>

          {/* Memory & Missions */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Brain className="w-5 h-5 text-[#A3202B]" />
              <span>{t.settings.sections.memory}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMemory();
                }}
                className="min-h-[48px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/12 border border-[#F5F1EC]/15 text-base font-medium flex items-center justify-center gap-2"
              >
                <Brain className="w-5 h-5 text-[#A3202B]" />
                <span>{t.settings.openMemory}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMissions();
                }}
                className="min-h-[48px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/12 border border-[#F5F1EC]/15 text-base font-medium flex items-center justify-center gap-2"
              >
                <CheckSquare className="w-5 h-5 text-[#17BD7F]" />
                <span>{t.settings.openMissions}</span>
              </button>
            </div>
          </section>

          {/* Permissions & PWA Install */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold">
              {t.settings.sections.permissions}
            </h3>
            <p className="text-base text-[#F5F1EC]/80 leading-relaxed">
              {t.settings.bridgeNote}
            </p>
            <PWAInstallButton label={t.settings.installApp} />
          </section>

          {/* Privacy & Delete My Data */}
          <section className="space-y-3 pt-4 border-t border-[#F5F1EC]/12">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#17BD7F]" />
              <span>{t.settings.sections.privacy}</span>
            </h3>
            <p className="text-base text-[#F5F1EC]/80 leading-relaxed">
              {t.settings.cameraNote}
            </p>

            {deletedBanner && (
              <p className="rounded-2xl bg-[#17BD7F]/15 border border-[#17BD7F] px-4 py-3 text-base text-[#17BD7F] font-medium">
                {t.settings.deletedDone}
              </p>
            )}

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-[#6F0E19]/50 hover:bg-[#A3202B] border border-[#A3202B] text-[#F5F1EC] text-base font-semibold flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                <span>{t.settings.deleteData}</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-[#6F0E19]/40 border border-[#A3202B] space-y-3">
                <p className="text-base font-medium text-[#F5F1EC]">
                  {t.settings.deleteConfirmTitle}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleConfirmDelete()}
                    className="min-h-[48px] px-3 py-2 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-bold"
                  >
                    {isDeleting
                      ? t.settings.deleting
                      : t.settings.deleteConfirmBtn}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[48px] px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-[#F5F1EC] text-base font-medium"
                  >
                    {t.settings.cancel}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
