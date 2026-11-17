import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FolderPlus,
  Laptop,
  OctagonX,
  Play,
  Plus,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { BridgePairing } from '../services/desktopBridgeClient';
import type {
  BridgeActivityItem,
  BridgeAllowedApp,
  BridgePendingApproval,
  BridgeSettings,
  BridgeTaintState,
} from '../types/akane';

interface DesktopActivityPanelProps {
  isConnected: boolean;
  bridgeError: string | null;
  emergencyStopped: boolean;
  taintState: BridgeTaintState;
  pairing: BridgePairing;
  settings: BridgeSettings;
  pendingApprovals: BridgePendingApproval[];
  activities: BridgeActivityItem[];
  isElectron: boolean;
  companionMode: boolean;
  startWithWindows: boolean;
  onUpdatePairing: (pairing: BridgePairing) => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onEmergencyStop: () => void;
  onResumeBridge: () => void;
  onAddFolder: (path: string) => Promise<void>;
  onRemoveFolder: (path: string) => Promise<void>;
  onPickFolderElectron: () => Promise<string | null>;
  onSaveApps: (apps: BridgeAllowedApp[]) => Promise<void>;
  onToggleCompanionMode: () => void;
  onToggleStartWithWindows: () => void;
}

export const DesktopActivityPanel: React.FC<DesktopActivityPanelProps> = ({
  isConnected,
  bridgeError,
  emergencyStopped,
  taintState,
  pairing,
  settings,
  pendingApprovals,
  activities,
  isElectron,
  companionMode,
  startWithWindows,
  onUpdatePairing,
  onApprove,
  onDeny,
  onEmergencyStop,
  onResumeBridge,
  onAddFolder,
  onRemoveFolder,
  onPickFolderElectron,
  onSaveApps,
  onToggleCompanionMode,
  onToggleStartWithWindows,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draftUrl, setDraftUrl] = useState(pairing.url);
  const [draftToken, setDraftToken] = useState(pairing.token);
  const [newFolder, setNewFolder] = useState('');
  const [newAppId, setNewAppId] = useState('');
  const [newAppCmd, setNewAppCmd] = useState('');
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraftUrl(pairing.url);
    setDraftToken(pairing.token);
  }, [pairing.url, pairing.token]);

  const handleSavePairing = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePairing({ url: draftUrl, token: draftToken });
    setSettingsMsg('Bridge pairing saved.');
  };

  const handleAddFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolder.trim()) return;
    setSettingsMsg(null);
    try {
      await onAddFolder(newFolder);
      setNewFolder('');
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : 'Failed to add folder.');
    }
  };

  const handleAddAppSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = newAppId.trim().toLowerCase().replace(/\s+/g, '_');
    const cmd = newAppCmd.trim();
    if (!id || !cmd) return;
    setSettingsMsg(null);
    try {
      await onSaveApps([
        ...settings.allowedApps,
        { id, label: newAppId.trim(), command: cmd, args: [] },
      ]);
      setNewAppId('');
      setNewAppCmd('');
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : 'Failed to update apps allowlist.');
    }
  };

  return (
    <>
      {/* Mobile Approval Overlay */}
      {pendingApprovals.length > 0 && (
        <div className="md:hidden fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-sm space-y-2">
          {pendingApprovals.map((apr) => (
            <div
              key={apr.id}
              className="rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#E0A030] p-4 shadow-2xl text-[#F5F1EC]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold text-[#E0A030] flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  Needs your OK
                </span>
              </div>
              <p className="mt-1 text-base font-semibold text-[#F5F1EC]">{apr.summary}</p>
              {apr.taintOrigin && (
                <p className="mt-2 text-base text-[#E0A030] bg-[#E0A030]/15 border border-[#E0A030]/40 rounded-2xl px-3 py-2">
                  From: <span className="font-mono">{apr.taintOrigin}</span>
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(apr.id)}
                  className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#17BD7F] hover:bg-[#19cf8b] text-base font-bold text-[#0B0C0A]"
                >
                  <Check className="w-5 h-5" />
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => onDeny(apr.id)}
                  className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-base font-bold text-[#F5F1EC]"
                >
                  <X className="w-5 h-5" />
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collapsed Pill Button for Desktop */}
      {isCollapsed && (
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="hidden md:flex fixed top-20 end-4 z-30 items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#0B0C0A]/85 backdrop-blur-xl border border-[#F5F1EC]/15 shadow-lg text-[#F5F1EC] hover:bg-[#0B0C0A] transition-all hover:scale-105"
          title="Open Activity Panel"
        >
          <Laptop className="w-4 h-4 text-[#A3202B]" />
          <span className="text-xs font-semibold">Activity</span>
          <span
            className={`w-2 h-2 rounded-full ${
              emergencyStopped
                ? 'bg-[#A3202B] animate-pulse'
                : isConnected
                  ? 'bg-[#17BD7F]'
                  : 'bg-[#F5F1EC]/40'
            }`}
          />
        </button>
      )}

      {/* Desktop Right-Side Activity Panel */}
      <aside
        aria-label="Desktop Activity Panel"
        className={`${
          isCollapsed ? 'hidden' : 'hidden md:flex'
        } fixed top-20 end-4 bottom-24 z-30 w-80 flex-col rounded-3xl bg-[#0B0C0A]/88 backdrop-blur-2xl border border-[#F5F1EC]/15 shadow-[0_12px_40px_rgba(0,0,0,0.65)] overflow-hidden text-[#F5F1EC]`}
      >
        <div className="px-4 py-3 border-b border-[#F5F1EC]/12 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Laptop className="w-5 h-5 text-[#A3202B] shrink-0" />
              <h2 className="font-display text-base font-bold text-[#F5F1EC]">
                Activity
              </h2>
            </div>
            <p className="mt-0.5 text-base flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  emergencyStopped
                    ? 'bg-[#A3202B] animate-pulse'
                    : isConnected
                      ? 'bg-[#17BD7F]'
                      : 'bg-[#F5F1EC]/40'
                }`}
              />
              <span className="text-[#F5F1EC]/80 truncate">
                {emergencyStopped
                  ? 'Stopped'
                  : isConnected
                    ? 'Connected'
                    : pairing.token
                      ? 'Bridge Offline'
                      : 'Needs Pairing'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {emergencyStopped ? (
              <button
                type="button"
                onClick={onResumeBridge}
                className="min-h-[48px] px-3 rounded-2xl bg-[#17BD7F] text-[#0B0C0A] text-base font-bold inline-flex items-center gap-1"
                title="Resume Bridge"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={onEmergencyStop}
                className="min-h-[48px] min-w-[48px] px-3 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-bold inline-flex items-center justify-center gap-1"
                title="Emergency Stop (Ctrl+Shift+Esc)"
              >
                <OctagonX className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`min-h-[48px] min-w-[48px] rounded-2xl border flex items-center justify-center ${
                showSettings
                  ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC]'
                  : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]/85 hover:text-[#F5F1EC]'
              }`}
              title="Desktop Bridge Settings"
              aria-label="Bridge Settings"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="min-h-[48px] min-w-[48px] rounded-2xl border border-[#F5F1EC]/15 bg-white/[0.04] text-[#F5F1EC]/85 hover:text-[#F5F1EC] flex items-center justify-center transition-colors"
              title="Minimize Activity Panel"
              aria-label="Minimize Activity Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isElectron && (
          <div className="px-4 py-2 border-b border-[#F5F1EC]/12 bg-black/25 flex items-center justify-between gap-2 text-base">
            <button
              type="button"
              onClick={onToggleCompanionMode}
              className={`min-h-[48px] px-3 rounded-2xl border inline-flex items-center gap-1.5 ${
                companionMode
                  ? 'bg-[#A3202B] border-[#F5F1EC]/40 text-[#F5F1EC]'
                  : 'bg-white/[0.04] border-[#F5F1EC]/15 text-[#F5F1EC]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Companion</span>
            </button>
            <label className="min-h-[48px] flex items-center gap-2 text-[#F5F1EC]/85 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={startWithWindows}
                onChange={onToggleStartWithWindows}
                className="w-5 h-5 accent-[#A3202B]"
              />
              <span>Auto</span>
            </label>
          </div>
        )}

        {taintState.active && (
          <div className="px-4 py-2 border-b border-[#E0A030]/40 bg-[#E0A030]/15 text-base text-[#E0A030] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="truncate">{taintState.sourceLabel}</span>
          </div>
        )}

        {showSettings ? (
          <div className="flex-1 overflow-y-auto akane-scroll p-4 space-y-4 text-base">
            <form onSubmit={handleSavePairing} className="space-y-2">
              <p className="font-semibold">Local Bridge Pairing</p>
              <input
                type="text"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="http://127.0.0.1:4319"
                className="w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-3 py-2 font-mono text-base text-[#F5F1EC]"
              />
              <input
                type="password"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="Bridge token..."
                className="w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-3 py-2 font-mono text-base text-[#F5F1EC]"
              />
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-2xl bg-[#A3202B] hover:bg-[#b82834] font-semibold text-[#F5F1EC] text-base"
              >
                Save &amp; Connect
              </button>
              {bridgeError && <p className="text-base text-[#E0A030]">{bridgeError}</p>}
            </form>

            <div className="space-y-2 pt-3 border-t border-[#F5F1EC]/12">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Allowed Folders</span>
                {isElectron && (
                  <button
                    type="button"
                    onClick={() => void onPickFolderElectron()}
                    className="min-h-[48px] px-2 inline-flex items-center gap-1.5 text-base text-[#E0A030]"
                  >
                    <FolderPlus className="w-5 h-5" />
                    Browse
                  </button>
                )}
              </div>
              <form onSubmit={handleAddFolderSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="/home/user/Documents"
                  className="flex-1 min-w-0 min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-3 py-2 font-mono text-base text-[#F5F1EC]"
                />
                <button
                  type="submit"
                  className="min-h-[48px] min-w-[48px] rounded-2xl bg-[#A3202B] text-[#F5F1EC] flex items-center justify-center shrink-0"
                  aria-label="Add allowed folder"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </form>
              <ul className="space-y-2">
                {settings.allowedFolders.map((folder) => (
                  <li
                    key={folder}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] px-3 py-2"
                  >
                    <span className="font-mono text-base truncate">{folder}</span>
                    <button
                      type="button"
                      onClick={() => void onRemoveFolder(folder)}
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center text-[#F5F1EC]/70 hover:text-[#A3202B] shrink-0"
                      aria-label={`Remove ${folder}`}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 pt-3 border-t border-[#F5F1EC]/12">
              <p className="font-semibold">Allowed Apps</p>
              <form onSubmit={handleAddAppSubmit} className="space-y-2">
                <input
                  type="text"
                  value={newAppId}
                  onChange={(e) => setNewAppId(e.target.value)}
                  placeholder="App name"
                  className="w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-3 py-2 text-base text-[#F5F1EC]"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAppCmd}
                    onChange={(e) => setNewAppCmd(e.target.value)}
                    placeholder="Executable"
                    className="flex-1 min-w-0 min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-3 py-2 font-mono text-base text-[#F5F1EC]"
                  />
                  <button
                    type="submit"
                    className="min-h-[48px] px-4 rounded-2xl bg-[#A3202B] text-[#F5F1EC] text-base font-semibold shrink-0"
                  >
                    Add
                  </button>
                </div>
              </form>
              <ul className="space-y-2">
                {settings.allowedApps.map((appItem) => (
                  <li
                    key={appItem.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] px-3 py-2"
                  >
                    <span className="text-base truncate">{appItem.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void onSaveApps(
                          settings.allowedApps.filter((a) => a.id !== appItem.id)
                        )
                      }
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center text-[#F5F1EC]/70 hover:text-[#A3202B] shrink-0"
                      aria-label={`Remove ${appItem.label}`}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {settingsMsg && <p className="text-base text-[#17BD7F]">{settingsMsg}</p>}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto akane-scroll p-4 space-y-3">
            {pendingApprovals.length > 0 && (
              <div className="space-y-2">
                {pendingApprovals.map((apr) => (
                  <div
                    key={apr.id}
                    className="rounded-2xl p-4 border border-[#E0A030] bg-[#E0A030]/10 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold text-[#E0A030] flex items-center gap-1.5">
                        <ShieldAlert className="w-5 h-5" />
                        Needs your OK
                      </span>
                      <span className="text-base font-mono text-[#F5F1EC]/75">
                        L{apr.level}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-[#F5F1EC] leading-snug">
                      {apr.summary}
                    </p>
                    {apr.taintOrigin && (
                      <p className="text-base text-[#E0A030] bg-[#0B0C0A]/60 border border-[#E0A030]/40 rounded-xl px-3 py-2">
                        From: <span className="font-mono">{apr.taintOrigin}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onApprove(apr.id)}
                        className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-1 rounded-2xl bg-[#17BD7F] hover:bg-[#19cf8b] text-base font-bold text-[#0B0C0A]"
                      >
                        <Check className="w-5 h-5" />
                        Allow
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeny(apr.id)}
                        className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-1 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-base font-bold text-[#F5F1EC]"
                      >
                        <X className="w-5 h-5" />
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isConnected && activities.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/12 p-4 text-base space-y-3">
                <div className="flex items-center gap-2 font-semibold text-[#F5F1EC]">
                  <ShieldCheck className="w-5 h-5 text-[#17BD7F]" />
                  <span>Desktop Bridge Ready</span>
                </div>
                <p className="text-base leading-relaxed text-[#F5F1EC]/75">
                  Start <span className="font-mono text-[#F5F1EC]">npm run bridge</span> and pair your token to run local actions.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="w-full min-h-[48px] rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-base font-semibold text-[#F5F1EC]"
                >
                  Open Bridge Settings
                </button>
              </div>
            ) : activities.length === 0 ? (
              <p className="text-base text-[#F5F1EC]/65 text-center py-6">
                No desktop actions yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {activities.slice(0, 20).map((act) => (
                  <li
                    key={act.id}
                    className="rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/10 px-4 py-3 text-base"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-base font-mono font-semibold uppercase ${
                          act.status === 'executed' || act.status === 'approved'
                            ? 'text-[#17BD7F]'
                            : act.status === 'pending_approval'
                              ? 'text-[#E0A030]'
                              : 'text-[#A3202B]'
                        }`}
                      >
                        L{act.level}
                      </span>
                      <span className="text-base font-mono text-[#F5F1EC]/60">
                        {new Date(act.time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-base text-[#F5F1EC] font-medium leading-snug">
                      {act.summary}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
