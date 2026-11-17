import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approveBridgeAction,
  denyBridgeAction,
  emergencyStopBridge,
  fetchBridgeState,
  invokeBridgeTool,
  loadStoredBridgePairing,
  resumeBridgeRemote,
  saveBridgePairing,
  updateBridgeSettingsRemote,
  type BridgePairing,
} from '../services/desktopBridgeClient';
import type {
  BridgeActivityItem,
  BridgeAllowedApp,
  BridgePendingApproval,
  BridgeSettings,
  BridgeTaintState,
} from '../types/akane';

export interface MappedBridgeCall {
  bridgeTool: string;
  bridgeArgs: Record<string, unknown>;
}

export function mapModelToolToBridgeCall(
  name: string,
  args: Record<string, unknown>
): MappedBridgeCall | null {
  switch (name) {
    case 'open_url':
      return {
        bridgeTool: 'open_url',
        bridgeArgs: { url: args.url, label: args.label },
      };
    case 'desktop_open_app':
      return {
        bridgeTool: 'open_app',
        bridgeArgs: { appName: args.appName },
      };
    case 'desktop_web_search':
      return {
        bridgeTool: 'web_search',
        bridgeArgs: { query: args.query },
      };
    case 'desktop_media_control':
      return {
        bridgeTool: 'media_control',
        bridgeArgs: { action: args.action },
      };
    case 'desktop_files_read': {
      const action = String(args.action || 'list').toLowerCase();
      const toolMap: Record<string, string> = {
        list: 'list_files',
        search: 'search_files',
        read: 'read_file',
      };
      return {
        bridgeTool: toolMap[action] || 'list_files',
        bridgeArgs: { path: args.path, query: args.query },
      };
    }
    case 'desktop_clipboard_screenshot': {
      const action = String(args.action || 'read_clipboard').toLowerCase();
      const toolMap: Record<string, string> = {
        read_clipboard: 'read_clipboard',
        take_screenshot: 'take_screenshot',
        read_webpage: 'read_webpage',
      };
      return {
        bridgeTool: toolMap[action] || 'read_clipboard',
        bridgeArgs: { url: args.url },
      };
    }
    case 'desktop_files_write': {
      const action = String(args.action || 'create').toLowerCase();
      const toolMap: Record<string, string> = {
        create: 'create_file',
        edit: 'edit_file',
        move: 'move_file',
        trash: 'trash_file',
        delete: 'trash_file',
      };
      return {
        bridgeTool: toolMap[action] || 'create_file',
        bridgeArgs: {
          path: args.path,
          content: args.content,
          destinationPath: args.destinationPath,
        },
      };
    }
    case 'desktop_sensitive_action': {
      const action = String(args.action || 'run_script').toLowerCase();
      return {
        bridgeTool: action,
        bridgeArgs: {
          path: args.target,
          target: args.target,
          details: args.details,
        },
      };
    }
    default:
      return null;
  }
}

const YES_CONFIRM_RE =
  /^\s*(yes|yeah|yep|yup|allow|approve|confirm|go ahead|do it|ok do it|sure|proceed)\b[.!]?\s*$/i;
const NO_DENY_RE =
  /^\s*(no|nope|deny|cancel|stop|don't|do not|reject|abort)\b[.!]?\s*$/i;

interface UseDesktopBridgeOptions {
  onEmergencyStopCallback?: () => void;
  onTalkShortcutCallback?: () => void;
  onBridgeNotice?: (msg: string) => void;
}

export function useDesktopBridge({
  onEmergencyStopCallback,
  onTalkShortcutCallback,
  onBridgeNotice,
}: UseDesktopBridgeOptions = {}) {
  const [pairing, setPairing] = useState<BridgePairing>(() => loadStoredBridgePairing());
  const [isConnected, setIsConnected] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [taintState, setTaintState] = useState<BridgeTaintState>({
    active: false,
    sourceLabel: '',
    recordedAt: null,
    expiresAt: null,
  });
  const [settings, setSettings] = useState<BridgeSettings>({
    allowedFolders: [],
    allowedApps: [],
  });
  const [pendingApprovals, setPendingApprovals] = useState<BridgePendingApproval[]>([]);
  const [activities, setActivities] = useState<BridgeActivityItem[]>([]);

  const isElectron =
    typeof window !== 'undefined' && Boolean(window.akaneDesktop?.isElectron);
  const [companionMode, setCompanionMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return new URLSearchParams(window.location.search).get('companion') === '1';
    } catch {
      return false;
    }
  });
  const [clickThrough, setClickThrough] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);

  const pairingRef = useRef(pairing);
  const emergencyCbRef = useRef(onEmergencyStopCallback);
  const talkShortcutCbRef = useRef(onTalkShortcutCallback);
  const noticeCbRef = useRef(onBridgeNotice);
  const pendingRef = useRef(pendingApprovals);

  pairingRef.current = pairing;
  emergencyCbRef.current = onEmergencyStopCallback;
  talkShortcutCbRef.current = onTalkShortcutCallback;
  noticeCbRef.current = onBridgeNotice;
  pendingRef.current = pendingApprovals;

  const refreshState = useCallback(async (overridePairing?: BridgePairing) => {
    const activePairing = overridePairing ?? pairingRef.current;
    if (!activePairing.token) {
      setIsConnected(false);
      return;
    }
    try {
      const state = await fetchBridgeState(activePairing);
      setIsConnected(true);
      setBridgeError(null);
      setEmergencyStopped(state.emergencyStopped);
      setTaintState(state.taintState);
      setSettings(state.settings);
      setPendingApprovals(state.pendingApprovals);
      setActivities(state.activities);
    } catch (err) {
      setIsConnected(false);
      setBridgeError(err instanceof Error ? err.message : 'Desktop bridge unreachable.');
    }
  }, []);

  // Auto-pair with Electron embedded bridge + wire Electron IPC events
  useEffect(() => {
    const desktop = typeof window !== 'undefined' ? window.akaneDesktop : undefined;
    if (!desktop) return;

    void desktop.getBridgePairing().then((pair) => {
      if (pair?.token) {
        const saved = saveBridgePairing(pair);
        setPairing(saved);
        void refreshState(saved);
      }
    });

    void desktop.getDesktopStatus().then((st) => {
      setCompanionMode(st.companionMode);
      setClickThrough(st.clickThrough);
      setStartWithWindows(st.startWithWindows);
      setEmergencyStopped(st.emergencyStopped);
    });

    const unsubStop = desktop.onEmergencyStop(() => {
      setEmergencyStopped(true);
      setPendingApprovals([]);
      emergencyCbRef.current?.();
      void refreshState();
    });
    const unsubTalk = desktop.onTalkShortcut(() => {
      talkShortcutCbRef.current?.();
    });
    const unsubState = desktop.onDesktopStateChanged((st) => {
      setCompanionMode(st.companionMode);
      setClickThrough(st.clickThrough);
      setStartWithWindows(st.startWithWindows);
      setEmergencyStopped(st.emergencyStopped);
    });
    const unsubBridge = desktop.onBridgeUpdated(() => {
      void refreshState();
    });

    return () => {
      unsubStop();
      unsubTalk();
      unsubState();
      unsubBridge();
    };
  }, [refreshState]);

  // Periodic lightweight poll while paired
  useEffect(() => {
    if (!pairing.token) return;
    void refreshState();
    const id = window.setInterval(() => {
      void refreshState();
    }, 3500);
    return () => window.clearInterval(id);
  }, [pairing.token, refreshState]);

  const triggerEmergencyStop = useCallback(async (reason = 'Emergency Stop') => {
    setEmergencyStopped(true);
    setPendingApprovals([]);
    emergencyCbRef.current?.();

    const desktop = typeof window !== 'undefined' ? window.akaneDesktop : undefined;
    if (desktop) {
      try {
        await desktop.triggerEmergencyStop();
      } catch {
        // Fallback below
      }
    }

    if (pairingRef.current.token) {
      try {
        await emergencyStopBridge(pairingRef.current, reason);
      } catch {
        // Bridge might already be stopped or offline
      }
    }
    noticeCbRef.current?.('Emergency Stop activated — all actions, scripts, voice & capture stopped.');
    void refreshState();
  }, [refreshState]);

  // Global in-window emergency stop hotkey fallback (Ctrl+Shift+Esc / Cmd+Shift+Esc)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        void triggerEmergencyStop('Emergency Stop hotkey (Ctrl+Shift+Esc)');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [triggerEmergencyStop]);

  const updatePairing = useCallback(
    (next: BridgePairing) => {
      const saved = saveBridgePairing(next);
      setPairing(saved);
      void refreshState(saved);
    },
    [refreshState]
  );

  const resumeBridge = useCallback(async () => {
    if (!pairingRef.current.token) return;
    await resumeBridgeRemote(pairingRef.current);
    setEmergencyStopped(false);
    await refreshState();
  }, [refreshState]);

  const updateSettings = useCallback(
    async (patch: Partial<BridgeSettings>) => {
      if (!pairingRef.current.token) {
        throw new Error('Pair with the Desktop Bridge token first.');
      }
      const res = await updateBridgeSettingsRemote(pairingRef.current, patch);
      if (res.settings) {
        setSettings(res.settings);
      }
      await refreshState();
    },
    [refreshState]
  );

  const addAllowedFolder = useCallback(
    async (folderPath: string) => {
      const cleaned = folderPath.trim();
      if (!cleaned) return;
      const next = settings.allowedFolders.includes(cleaned)
        ? settings.allowedFolders
        : [...settings.allowedFolders, cleaned];
      await updateSettings({ allowedFolders: next });
    },
    [settings.allowedFolders, updateSettings]
  );

  const removeAllowedFolder = useCallback(
    async (folderPath: string) => {
      await updateSettings({
        allowedFolders: settings.allowedFolders.filter((f) => f !== folderPath),
      });
    },
    [settings.allowedFolders, updateSettings]
  );

  const pickAndAddFolder = useCallback(async () => {
    const desktop = typeof window !== 'undefined' ? window.akaneDesktop : undefined;
    if (!desktop) return null;
    const picked = await desktop.pickAllowedFolder();
    if (picked) {
      await addAllowedFolder(picked);
    }
    return picked;
  }, [addAllowedFolder]);

  const saveAllowedApps = useCallback(
    async (apps: BridgeAllowedApp[]) => {
      await updateSettings({ allowedApps: apps });
    },
    [updateSettings]
  );

  const approveAction = useCallback(
    async (approvalId: string) => {
      if (!pairingRef.current.token) return null;
      const res = await approveBridgeAction(pairingRef.current, approvalId);
      await refreshState();
      if (res.summary) {
        noticeCbRef.current?.(res.summary);
      } else if (res.error) {
        noticeCbRef.current?.(res.error);
      }
      return res;
    },
    [refreshState]
  );

  const denyAction = useCallback(
    async (approvalId: string) => {
      if (!pairingRef.current.token) return null;
      const res = await denyBridgeAction(pairingRef.current, approvalId);
      await refreshState();
      noticeCbRef.current?.('Action denied — nothing was executed.');
      return res;
    },
    [refreshState]
  );

  const executeDesktopTool = useCallback(
    async (
      modelToolName: string,
      modelArgs: Record<string, unknown>
    ): Promise<{ handled: boolean; summary: string; data?: Record<string, unknown> }> => {
      const mapped = mapModelToolToBridgeCall(modelToolName, modelArgs);
      if (!mapped) {
        return { handled: false, summary: '' };
      }

      if (!pairingRef.current.token) {
        return {
          handled: true,
          summary: 'Desktop Bridge is not paired. Open the Desktop Activity panel to pair your bridge token.',
        };
      }

      try {
        const res = await invokeBridgeTool(
          pairingRef.current,
          mapped.bridgeTool,
          mapped.bridgeArgs
        );
        await refreshState();

        if (res.status === 'pending_approval') {
          const originNote = res.approval?.taintOrigin
            ? ` (triggered right after reading ${res.approval.taintOrigin})`
            : '';
          return {
            handled: true,
            summary: `Needs confirmation: ${res.approval?.summary || mapped.bridgeTool}${originNote}. Ask the user to click Allow or say "yes".`,
          };
        }

        if (res.status === 'blocked' || res.status === 'emergency_stopped') {
          return {
            handled: true,
            summary: res.error || 'Blocked by desktop bridge policy.',
          };
        }

        if (res.status === 'error') {
          return {
            handled: true,
            summary: `Bridge error: ${res.error || 'Failed'}`,
          };
        }

        return {
          handled: true,
          summary: res.summary || 'Completed.',
          data: res.data,
        };
      } catch (err) {
        return {
          handled: true,
          summary: err instanceof Error ? err.message : 'Desktop bridge request failed.',
        };
      }
    },
    [refreshState]
  );

  // Voice confirmation handler: checks clear "yes" / "no" from user speech when an approval card awaits
  const handleVoiceConfirmation = useCallback(
    (spokenText: string): boolean => {
      const oldest = pendingRef.current[0];
      if (!oldest) return false;
      const cleaned = spokenText.trim();
      if (!cleaned) return false;

      if (YES_CONFIRM_RE.test(cleaned)) {
        void approveAction(oldest.id);
        return true;
      }
      if (NO_DENY_RE.test(cleaned)) {
        void denyAction(oldest.id);
        return true;
      }
      return false;
    },
    [approveAction, denyAction]
  );

  const toggleCompanionMode = useCallback(async (next?: boolean) => {
    const target = typeof next === 'boolean' ? next : !companionMode;
    const desktop = typeof window !== 'undefined' ? window.akaneDesktop : undefined;
    if (desktop) {
      const updated = await desktop.setCompanionMode(target);
      setCompanionMode(updated);
      return;
    }
    setCompanionMode(target);
  }, [companionMode]);

  const toggleClickThrough = useCallback(async (next?: boolean) => {
    const target = typeof next === 'boolean' ? next : !clickThrough;
    const desktop = typeof window !== 'undefined' ? window.akaneDesktop : undefined;
    if (desktop) {
      const updated = await desktop.setClickThrough(target);
      setClickThrough(updated);
      return;
    }
    setClickThrough(target);
  }, [clickThrough]);

  const toggleStartWithWindows = useCallback(async (next?: boolean) => {
    const target = typeof next === 'boolean' ? next : !startWithWindows;
    const desktop = typeof window !== 'undefined' ? window.akaneDesktop : undefined;
    if (desktop) {
      const updated = await desktop.setStartWithWindows(target);
      setStartWithWindows(updated);
    }
  }, [startWithWindows]);

  return {
    pairing,
    updatePairing,
    isConnected,
    bridgeError,
    emergencyStopped,
    taintState,
    settings,
    pendingApprovals,
    activities,
    isElectron,
    companionMode,
    clickThrough,
    startWithWindows,
    refreshState,
    triggerEmergencyStop,
    resumeBridge,
    addAllowedFolder,
    removeAllowedFolder,
    pickAndAddFolder,
    saveAllowedApps,
    approveAction,
    denyAction,
    executeDesktopTool,
    handleVoiceConfirmation,
    toggleCompanionMode,
    toggleClickThrough,
    toggleStartWithWindows,
  };
}
