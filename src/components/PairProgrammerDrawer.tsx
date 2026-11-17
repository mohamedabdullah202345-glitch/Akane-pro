import React, { useState } from 'react';
import { Bug, Check, Code, Play, Send, Sparkles, Terminal, X } from 'lucide-react';

interface PairProgrammerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyzeCode: (codeOrError: string) => void;
}

export const PairProgrammerDrawer: React.FC<PairProgrammerDrawerProps> = ({
  isOpen,
  onClose,
  onAnalyzeCode,
}) => {
  const [snippet, setSnippet] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = () => {
    if (!snippet.trim()) return;
    setAnalyzing(true);
    setTimeout(() => {
      setResult(
        `[فحص سريع من أكاني المبرمجة]:
1. المشكلة في الكود: عدم معالجة الـ undefined في الكائن قبل الوصول إلى الخاصية.
2. الحل المقترح: استخدام Optional Chaining (?.): 'user?.profile?.name'.
3. تحسين الأداء: احرص على استخدام useMemo لمنع إعادة الرندر غير الضرورية.`
      );
      setAnalyzing(false);
      onAnalyzeCode(snippet);
    }, 800);
  };

  return (
    <aside
      aria-label="Voice Pair-Programmer"
      className="fixed top-20 end-4 bottom-24 z-40 w-[440px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#3B82F6]/40 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-[#3B82F6]" />
          <div>
            <h2 className="font-display text-lg font-bold">المبرمج المساعد الصوتي</h2>
            <p className="text-xs text-[#F5F1EC]/60 font-mono">Live Pair-Programmer & Debugger</p>
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

      <div className="flex-1 overflow-y-auto akane-scroll p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[#F5F1EC]/70 flex items-center gap-1.5">
            <Code className="w-4 h-4 text-[#3B82F6]" />
            <span>الصق رسالة الخطأ من التيرمينال أو كودك:</span>
          </label>
          <textarea
            rows={6}
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            placeholder="TypeError: Cannot read properties of undefined... أو الصق دالة لمراجعتها"
            className="w-full rounded-2xl bg-black/50 border border-white/10 p-3 text-xs font-mono text-emerald-400 placeholder:text-[#F5F1EC]/30 focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing || !snippet.trim()}
          className="w-full py-2.5 px-4 rounded-2xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span>{analyzing ? 'أكاني تفحص الخطأ...' : 'فحص وتصحيح الخطأ فوراً'}</span>
        </button>

        {result && (
          <div className="p-4 rounded-2xl bg-[#3B82F6]/10 border border-[#3B82F6]/30 space-y-2 text-xs font-mono text-[#F5F1EC]/90 leading-relaxed whitespace-pre-line animate-fade-in">
            <div className="flex items-center gap-2 text-[#60A5FA] font-bold">
              <Bug className="w-4 h-4" />
              <span>تحليل أكاني الصوتي:</span>
            </div>
            {result}
          </div>
        )}

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-[#F5F1EC]/50 space-y-1">
          <p className="font-semibold text-[#F5F1EC]/70">نصيحة البرمجة التفاعلية:</p>
          <p>
            يمكنك تفعيل مشاركة الشاشة (Screen Share) لترى أكاني شاشتك و VS Code مباشرة وتملي عليك الحل صوتياً أثناء كتابتك.
          </p>
        </div>
      </div>
    </aside>
  );
};
