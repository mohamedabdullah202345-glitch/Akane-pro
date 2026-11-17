import React, { useEffect, useState } from 'react';
import { Flame, Pause, Play, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { affectionService } from '../services/affectionService';

interface PomodoroTimerWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onCycleComplete?: (cycle: number) => void;
}

export const PomodoroTimerWidget: React.FC<PomodoroTimerWidgetProps> = ({
  isOpen,
  onClose,
  onCycleComplete,
}) => {
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [cycles, setCycles] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev > 1) return prev - 1;

          // Transition phase
          if (phase === 'focus') {
            const nextCycles = cycles + 1;
            setCycles(nextCycles);
            setPhase('break');
            affectionService.addXp(50); // XP reward for deep work
            onCycleComplete?.(nextCycles);
            return 5 * 60;
          } else {
            setPhase('focus');
            return 25 * 60;
          }
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, phase, cycles, onCycleComplete]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleReset = () => {
    setIsActive(false);
    setTimeLeft(phase === 'focus' ? 25 * 60 : 5 * 60);
  };

  return (
    <div
      aria-label="Pomodoro Focus Timer"
      className="fixed bottom-24 start-6 z-40 w-72 rounded-2xl bg-[#0B0C0A]/95 backdrop-blur-xl border border-[#A3202B]/40 shadow-[0_16px_40px_rgba(0,0,0,0.8)] p-4 text-[#F5F1EC] space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#A3202B]" />
          <span className="font-semibold text-xs uppercase tracking-wider">
            {phase === 'focus' ? 'وضع التركيز العميق' : 'استراحة قصيرة'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-[#F5F1EC]/60 hover:text-[#F5F1EC]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        <span className="font-mono text-4xl font-extrabold text-[#F5F1EC] tracking-wider">
          {timeFormatted}
        </span>
        <span className="text-[11px] text-[#F5F1EC]/60 mt-1">
          {cycles} دورات مكتملة (+{cycles * 50} XP)
        </span>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors ${
            isActive
              ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40'
              : 'bg-[#A3202B] hover:bg-[#b82834] text-white'
          }`}
        >
          {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isActive ? 'إيقاف مؤقت' : 'ابدأ التركيز'}</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#F5F1EC]/80 border border-white/10"
          title="إعادة تعيين"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-[#F5F1EC]/50 border-t border-white/5 pt-2">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>أكاني تراقب تشتتك وتشجعك صوتياً كل 25 دقيقة.</span>
      </div>
    </div>
  );
};
