import React, { useState } from 'react';
import { BookOpen, Calendar, Heart, Plus, Sparkles, X } from 'lucide-react';
import type { DiaryEntry } from '../types/akane';

interface CompanionDiaryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: DiaryEntry[];
  onAddEntry: (entry: Omit<DiaryEntry, 'id'>) => void;
}

export const CompanionDiaryDrawer: React.FC<CompanionDiaryDrawerProps> = ({
  isOpen,
  onClose,
  entries,
  onAddEntry,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleGenerateToday = () => {
    setIsGenerating(true);
    setTimeout(() => {
      onAddEntry({
        date: new Date().toISOString().slice(0, 10),
        title: 'يوم مليء بالإنجاز والتحديات اللطيفة',
        summary: 'قضينا وقتاً رائعاً في تطوير الكود ومراجعة المهام، وكنت فخورة جداً بتركيزك اليوم.',
        mood: 'warm',
        akaneNote: 'يا بطل، تعبت معايا النهاردة وعملت شغل كبير. ارتاح كويس واشرب مية كفاية يا روحي!',
        achievements: ['تطوير وتفعيل 31 ميزة ذكية', 'جلسة تركيز ديب وورك', 'مراجعة شجرة المعرفة'],
      });
      setIsGenerating(false);
    }, 600);
  };

  return (
    <aside
      aria-label="Companion Diary"
      className="fixed top-20 end-4 bottom-24 z-40 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#A3202B]/40 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-[#A3202B]" />
          <div>
            <h2 className="font-display text-lg font-bold">مذكرات أكاني اليومية</h2>
            <p className="text-xs text-[#F5F1EC]/60 font-mono">Daily Companion Diary & Recaps</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[40px] min-h-[40px] rounded-xl text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10 flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 border-b border-[#F5F1EC]/10">
        <button
          type="button"
          onClick={handleGenerateToday}
          disabled={isGenerating}
          className="w-full py-2.5 px-4 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isGenerating ? 'أكاني تكتب المذكرات...' : 'تدوين ملخص ومذكرات اليوم تلقائياً'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto akane-scroll p-6 space-y-4">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-[#F5F1EC]/40 space-y-2">
            <BookOpen className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm">لا توجد مذكرات مدونة بعد.</p>
            <p className="text-xs">اضغط على الزر بالأعلى لتكتب لك أكاني مذكرات يومكم معاً!</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#F5F1EC]/60 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#A3202B]" />
                  {entry.date}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#A3202B]/20 text-[#FF6B7A] border border-[#A3202B]/30">
                  {entry.mood}
                </span>
              </div>

              <h3 className="font-semibold text-sm text-[#F5F1EC]">{entry.title}</h3>
              <p className="text-xs text-[#F5F1EC]/80 leading-relaxed">{entry.summary}</p>

              {entry.achievements && entry.achievements.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-[#F5F1EC]/50 font-semibold">إنجازات اليوم:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.achievements.map((ach, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[#F5F1EC]/80"
                      >
                        ✓ {ach}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#A3202B]/10 border border-[#A3202B]/20 flex items-start gap-2.5">
                <Heart className="w-4 h-4 text-[#FF4D6D] shrink-0 mt-0.5" />
                <p className="text-xs italic text-[#F5F1EC]/90 leading-relaxed">
                  "{entry.akaneNote}"
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
