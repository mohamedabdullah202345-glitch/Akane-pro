import React, { useState } from 'react';
import { CheckCircle2, FileText, Mic, Pause, Play, Sparkles, X } from 'lucide-react';
import type { MeetingScribeSession } from '../types/akane';

interface MeetingScribeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: MeetingScribeSession[];
  onAddSession: (session: MeetingScribeSession) => void;
}

export const MeetingScribeDrawer: React.FC<MeetingScribeDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  onAddSession,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentTitle, setCurrentTitle] = useState('اجتماع تخطيط ومراجعة');
  const [currentNotes, setCurrentNotes] = useState<string[]>([
    'تم الاتفاق على موعد تسليم النسخة التجريبية يوم الخميس.',
    'مراجعة بنية الاتصال عبر الويب سوكيت وضمان عدم انقطاع الصوت.',
    'تقسيم مهام الواجهة الأمامية والباك إند.',
  ]);

  if (!isOpen) return null;

  const handleFinishMeeting = () => {
    setIsRecording(false);
    const newSession: MeetingScribeSession = {
      id: `mtg_${Date.now()}`,
      title: currentTitle,
      createdAt: new Date().toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      transcript: [...currentNotes],
      summary: 'اجتماع مراجعة فني ركز على استقرار الويب سوكيت وتجهيز الإصدار القادم.',
      actionItems: [
        'تسليم ملفات الـ build للعميل يوم الخميس',
        'اختبار الـ barge-in بدون تأخير صوتي',
      ],
    };
    onAddSession(newSession);
  };

  return (
    <aside
      aria-label="Meeting Scribe"
      className="fixed top-20 end-4 bottom-24 z-40 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-emerald-500/40 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="font-display text-lg font-bold">مساعد ومحضر الاجتماعات</h2>
            <p className="text-xs text-[#F5F1EC]/60 font-mono">Meeting Scribe & Co-Pilot</p>
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

      <div className="p-4 border-b border-[#F5F1EC]/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span className="text-xs font-semibold">
              {isRecording ? 'أكاني تسجل وتلخص الاجتماع...' : 'جاهز للتسجيل'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => (isRecording ? handleFinishMeeting() : setIsRecording(true))}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isRecording
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isRecording ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRecording ? 'إنهاء وحفظ المحضر' : 'بدء اجتماع جديد'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto akane-scroll p-6 space-y-4">
        {sessions.length === 0 ? (
          <div className="text-center py-10 text-[#F5F1EC]/40 space-y-2">
            <FileText className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm">لا توجد محاضر اجتماعات سابقة.</p>
            <p className="text-xs">
              ابدأ اجتماعاً وسوف تقوم أكاني بتسجيل النقاط واستخراج الإجراءات المطلوبة تلقائياً!
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[#F5F1EC]">{s.title}</h3>
                <span className="text-[10px] font-mono text-[#F5F1EC]/50">{s.createdAt}</span>
              </div>
              <p className="text-xs text-[#F5F1EC]/80 bg-white/5 p-2.5 rounded-xl border border-white/5">
                {s.summary}
              </p>

              <div className="space-y-1">
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>الإجراءات المطلوبة (Action Items):</span>
                </span>
                <ul className="space-y-1 text-xs text-[#F5F1EC]/70">
                  {s.actionItems.map((act, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-emerald-500 font-bold">•</span>
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
