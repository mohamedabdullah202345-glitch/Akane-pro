import React, { useState } from 'react';
import { BookOpen, Check, HelpCircle, Layers, Plus, RotateCw, Volume2, X } from 'lucide-react';
import type { FlashcardItem } from '../types/akane';
import { affectionService } from '../services/affectionService';

interface FlashcardsStudyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cards: FlashcardItem[];
  onAddCard: (card: Omit<FlashcardItem, 'id' | 'intervalDays' | 'easeFactor' | 'repetitions'>) => void;
  onUpdateCardRating: (id: string, success: boolean) => void;
}

export const FlashcardsStudyDrawer: React.FC<FlashcardsStudyDrawerProps> = ({
  isOpen,
  onClose,
  cards,
  onAddCard,
  onUpdateCardRating,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];

  const handleRating = (success: boolean) => {
    if (currentCard) {
      onUpdateCardRating(currentCard.id, success);
      if (success) {
        affectionService.addXp(15);
      }
    }
    setIsFlipped(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((c) => c + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    onAddCard({
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      subject: 'عام',
    });
    setNewQuestion('');
    setNewAnswer('');
    setIsAdding(false);
  };

  return (
    <aside
      aria-label="Spaced Repetition Study"
      className="fixed top-20 end-4 bottom-24 z-40 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-amber-500/40 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-display text-lg font-bold">بطاقات المذاكرة الذكية</h2>
            <p className="text-xs text-[#F5F1EC]/60 font-mono">Spaced Repetition Flashcards</p>
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

      <div className="p-4 border-b border-[#F5F1EC]/10 flex items-center justify-between">
        <span className="text-xs text-[#F5F1EC]/70">
          بطاقة {currentIndex + 1} من {cards.length || 1}
        </span>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="py-1 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          <span>{isAdding ? 'إلغاء' : 'إضافة بطاقة'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto akane-scroll p-6 space-y-4">
        {isAdding && (
          <form onSubmit={handleCreate} className="p-4 rounded-2xl bg-white/[0.04] border border-amber-500/30 space-y-3">
            <h3 className="text-xs font-semibold text-amber-300">إنشاء بطاقة استذكار جديدة</h3>
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="السؤال أو المفهوم..."
              className="w-full rounded-xl bg-black/40 border border-white/10 p-2.5 text-xs text-[#F5F1EC] focus:outline-none focus:border-amber-400"
            />
            <textarea
              rows={3}
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
              placeholder="الإجابة أو التلخيص..."
              className="w-full rounded-xl bg-black/40 border border-white/10 p-2.5 text-xs text-[#F5F1EC] focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs"
            >
              حفظ البطاقة
            </button>
          </form>
        )}

        {currentCard ? (
          <div className="space-y-4">
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="min-h-[180px] p-6 rounded-3xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-amber-400/50 transition-all select-none shadow-inner"
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-2">
                {isFlipped ? 'الإجابة والتفسير' : 'السؤال (انقر للقلب)'}
              </span>
              <p className="text-sm font-semibold leading-relaxed">
                {isFlipped ? currentCard.answer : currentCard.question}
              </p>
            </div>

            {isFlipped && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleRating(false)}
                  className="flex-1 py-2.5 rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-semibold"
                >
                  صعبة / نسيتها
                </button>
                <button
                  type="button"
                  onClick={() => handleRating(true)}
                  className="flex-1 py-2.5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold"
                >
                  سهلة / تذكرتها (+15 XP)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-[#F5F1EC]/40 space-y-2">
            <p className="text-sm">لا توجد بطاقات مذاكرة حالياً.</p>
          </div>
        )}
      </div>
    </aside>
  );
};
