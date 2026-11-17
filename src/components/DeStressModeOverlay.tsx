import React, { useEffect, useState } from 'react';
import { Heart, Wind, X } from 'lucide-react';
import { nonVerbalAudioService } from '../services/nonVerbalAudioService';

interface DeStressModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'rest';

export const DeStressModeOverlay: React.FC<DeStressModeOverlayProps> = ({
  isOpen,
  onClose,
}) => {
  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [secondsLeft, setSecondsLeft] = useState(4);
  const [cycle, setCycle] = useState(1);

  useEffect(() => {
    if (!isOpen) return;

    let timer: NodeJS.Timeout;
    const tick = () => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        // Transition phases: 4-7-8 method
        if (phase === 'inhale') {
          setPhase('hold');
          return 7;
        } else if (phase === 'hold') {
          setPhase('exhale');
          nonVerbalAudioService.playCue('sigh');
          return 8;
        } else {
          setPhase('inhale');
          setCycle((c) => c + 1);
          return 4;
        }
      });
    };

    timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isOpen, phase]);

  if (!isOpen) return null;

  const phaseInstruction =
    phase === 'inhale'
      ? 'شهيق عميق وهادئ...'
      : phase === 'hold'
        ? 'احبس النفس واسترخِ...'
        : 'زفير بطيء وتفريغ للتوتر...';

  const scale =
    phase === 'inhale' ? 'scale-125' : phase === 'hold' ? 'scale-125' : 'scale-90';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0C0A]/85 backdrop-blur-xl animate-fade-in text-[#F5F1EC]">
      <div className="relative w-full max-w-md p-8 rounded-3xl bg-[#0B0C0A] border border-[#A3202B]/40 shadow-[0_24px_72px_rgba(163,32,43,0.3)] flex flex-col items-center text-center space-y-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 end-4 p-2 rounded-xl text-[#F5F1EC]/60 hover:text-[#F5F1EC] hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2 text-[#A3202B]">
            <Wind className="w-5 h-5" />
            <h2 className="font-display text-lg font-bold">جلسة التنفس وتخفيف التوتر</h2>
          </div>
          <p className="text-xs text-[#F5F1EC]/60 font-mono">طريقة 4-7-8 لتهدئة الجهاز العصبي</p>
        </div>

        {/* Breathing Animated Circle */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full bg-gradient-to-tr from-[#A3202B]/20 via-[#E62739]/30 to-[#FF4D6D]/40 blur-xl transition-transform duration-1000 ${scale}`}
          />
          <div
            className={`w-36 h-36 rounded-full border-4 border-[#A3202B] flex flex-col items-center justify-center bg-[#0B0C0A]/80 shadow-[0_0_30px_rgba(163,32,43,0.5)] transition-transform duration-1000 ${scale}`}
          >
            <span className="text-4xl font-mono font-bold text-[#F5F1EC]">{secondsLeft}</span>
            <span className="text-xs uppercase tracking-wider text-[#A3202B] font-semibold mt-1">
              {phase}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-base font-semibold text-[#F5F1EC]">
            {phaseInstruction}
          </h3>
          <p className="text-xs italic text-[#F5F1EC]/70 max-w-xs">
            "خد وقتك يا قلبي، سيب كل حاجة ورا ضهرك وخلي جسمك يرتاح معايا."
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[#F5F1EC]/50">
          <Heart className="w-3.5 h-3.5 text-[#A3202B]" />
          <span>الدورة رقم {cycle} من 4</span>
        </div>
      </div>
    </div>
  );
};
