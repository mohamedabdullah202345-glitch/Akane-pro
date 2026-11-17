import React, { useEffect, useState } from 'react';
import { Download, Share, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  label?: string;
  iosHint?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  label = 'Install Akane Pro App',
  iosHint = 'On iPhone/iPad: tap Share then Add to Home Screen.',
}) => {
  const { canPrompt, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-semibold flex items-center justify-center gap-2.5 shadow-lg"
      >
        <Download className="w-5 h-5 shrink-0" />
        <span>{label}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowIOSGuide((v) => !v)}
          className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#0B0C0A] border border-[#F5F1EC]/25 hover:border-[#F5F1EC]/45 text-[#F5F1EC] text-base font-medium flex items-center justify-center gap-2"
        >
          <Share className="w-5 h-5 shrink-0" />
          <span>{label}</span>
        </button>
        {showIOSGuide && (
          <p className="rounded-xl bg-[#0B0C0A]/90 border border-[#E0A030]/40 px-4 py-3 text-base text-[#F5F1EC]">
            {iosHint}
          </p>
        )}
      </div>
    );
  }

  return null;
};

interface OfflineIndicatorProps {
  message: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ message }) => {
  const [offline, setOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-[#0B0C0A]/95 border border-[#E0A030] px-4 py-3 text-base text-[#F5F1EC] flex items-center gap-3 shadow-2xl"
    >
      <WifiOff className="w-5 h-5 text-[#E0A030] shrink-0" />
      <span>{message}</span>
    </div>
  );
};
