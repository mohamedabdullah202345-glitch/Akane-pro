import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Battery, Cpu, HardDrive, ShieldCheck, X } from 'lucide-react';
import type { SystemWatchdogData } from '../types/akane';

interface SystemWatchdogWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemWatchdogWidget: React.FC<SystemWatchdogWidgetProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<SystemWatchdogData>({
    cpuUsagePercent: 24,
    ramUsagePercent: 58,
    batteryLevelPercent: 92,
    isCharging: true,
    status: 'nominal',
  });

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      // Periodic mock telemetry refresh or bridge telemetry
      setData((prev) => {
        const cpu = Math.floor(20 + Math.random() * 25);
        const ram = Math.floor(55 + Math.random() * 10);
        const isHigh = cpu > 80 || ram > 85;
        return {
          ...prev,
          cpuUsagePercent: cpu,
          ramUsagePercent: ram,
          status: isHigh ? 'warning' : 'nominal',
          alertMessage: isHigh ? 'استهلاك المعالج مرتفع! أكاني تنصح بإغلاق النوافذ الزائدة.' : undefined,
        };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      aria-label="System Health Watchdog"
      className="fixed bottom-24 end-6 z-40 w-80 rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-xl border border-red-500/40 shadow-[0_16px_40px_rgba(0,0,0,0.8)] p-5 text-[#F5F1EC] space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-red-500" />
          <span className="font-semibold text-xs uppercase tracking-wider text-red-400">
            مراقب أداء الجهاز
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

      <div className="space-y-3">
        {/* CPU */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#F5F1EC]/70 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>المعالج (CPU)</span>
            </span>
            <span className="font-mono font-bold">{data.cpuUsagePercent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                data.cpuUsagePercent > 75 ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${data.cpuUsagePercent}%` }}
            />
          </div>
        </div>

        {/* RAM */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#F5F1EC]/70 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              <span>الذاكرة (RAM)</span>
            </span>
            <span className="font-mono font-bold">{data.ramUsagePercent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                data.ramUsagePercent > 80 ? 'bg-red-500' : 'bg-purple-500'
              }`}
              style={{ width: `${data.ramUsagePercent}%` }}
            />
          </div>
        </div>

        {/* Battery */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
          <span className="text-[#F5F1EC]/70 flex items-center gap-1.5">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            <span>البطارية: {data.batteryLevelPercent}% ({data.isCharging ? 'متصل بالشاحن' : 'يعمل على البطارية'})</span>
          </span>
        </div>
      </div>

      {data.status === 'warning' ? (
        <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-[11px] text-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{data.alertMessage}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>درجات الحرارة وموارد النظام مستقرة ومثالية.</span>
        </div>
      )}
    </div>
  );
};
