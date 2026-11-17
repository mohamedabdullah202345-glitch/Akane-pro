import React, { useEffect } from 'react';
import { Sparkles, X, Heart, Coffee, Moon, Eye } from 'lucide-react';
import type { ProactiveCheckinEvent } from '../services/proactiveEngine';

interface ProactiveCheckinToastProps {
  event: ProactiveCheckinEvent;
  onAction: (event: ProactiveCheckinEvent) => void;
  onDismiss: () => void;
}

export const ProactiveCheckinToast: React.FC<ProactiveCheckinToastProps> = ({
  event,
  onAction,
  onDismiss,
}) => {
  // Auto-dismiss after 14 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 14_000);
    return () => clearTimeout(timer);
  }, [event.id, onDismiss]);

  const getIcon = () => {
    switch (event.category) {
      case 'water_stretch':
        return <Coffee className="w-5 h-5 text-[#E0A030]" />;
      case 'fatigue_rest':
        return <Eye className="w-5 h-5 text-[#FF6B7A]" />;
      case 'late_night':
        return <Moon className="w-5 h-5 text-[#9D8CFF]" />;
      case 'distraction_warning':
        return <Sparkles className="w-5 h-5 text-[#A3202B]" />;
      default:
        return <Heart className="w-5 h-5 text-[#FF4766]" />;
    }
  };

  return (
    <div
      role="alert"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#A3202B]/60 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.85)] text-[#F5F1EC] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#A3202B]/20 border border-[#A3202B]/40 flex items-center justify-center shrink-0">
              {getIcon()}
            </div>
            <div>
              <span className="text-xs font-semibold text-[#A3202B] uppercase tracking-wider block">
                أكاني تتفقدك ✨
              </span>
              <p className="text-sm font-medium text-[#F5F1EC] leading-relaxed mt-0.5">
                {event.arabicText}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="w-7 h-7 rounded-full text-[#F5F1EC]/60 hover:text-[#F5F1EC] hover:bg-white/10 flex items-center justify-center shrink-0"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {event.actionLabel && (
            <button
              type="button"
              onClick={() => onAction(event)}
              className="flex-1 py-2 px-3 rounded-xl bg-[#A3202B] hover:bg-[#ba2633] text-xs font-semibold text-[#F5F1EC] transition-all shadow-md shadow-[#A3202B]/30"
            >
              {event.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-xs font-medium text-[#F5F1EC]/80 transition-colors"
          >
            {event.dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
