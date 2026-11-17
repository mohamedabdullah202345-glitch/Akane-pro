import type {
  BridgeActivityItem,
  BridgePendingApproval,
  BridgeSettings,
  BridgeStatePayload,
  BridgeTaintState,
} from '../types/akane';

export interface AkaneDesktopHostBridge {
  isElectron: boolean;
  getBridgePairing: () => Promise<{ url: string; token: string }>;
  pickAllowedFolder: () => Promise<string | null>;
  setCompanionMode: (enabled: boolean) => Promise<boolean>;
  setClickThrough: (enabled: boolean) => Promise<boolean>;
  setStartWithWindows: (enabled: boolean) => Promise<boolean>;
  getDesktopStatus: () => Promise<{
    companionMode: boolean;
    clickThrough: boolean;
    startWithWindows: boolean;
    emergencyStopped: boolean;
  }>;
  triggerEmergencyStop: () => Promise<boolean>;
  captureScreenDataUrl: () => Promise<{ width: number; height: number; dataUrl: string }>;
  onEmergencyStop: (cb: (payload: { reason?: string }) => void) => () => void;
  onTalkShortcut: (cb: () => void) => () => void;
  onDesktopStateChanged: (
    cb: (state: {
      companionMode: boolean;
      clickThrough: boolean;
      startWithWindows: boolean;
      emergencyStopped: boolean;
    }) => void
  ) => () => void;
  onBridgeUpdated: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    akaneDesktop?: AkaneDesktopHostBridge;
  }
}

export interface BridgePairing {
  url: string;
  token: string;
}

const BRIDGE_PAIRING_STORAGE_KEY = 'akane_pro_bridge_pairing_v1';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4319';

export function sanitizeBridgeUrl(rawUrl: string): string {
  const cleaned = (rawUrl || '').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(cleaned || DEFAULT_BRIDGE_URL);
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    ) {
      return parsed.origin;
    }
  } catch {
    // Fall through to safe localhost default
  }
  return DEFAULT_BRIDGE_URL;
}

export function loadStoredBridgePairing(): BridgePairing {
  if (typeof window === 'undefined') {
    return { url: DEFAULT_BRIDGE_URL, token: '' };
  }
  try {
    const raw = window.localStorage.getItem(BRIDGE_PAIRING_STORAGE_KEY);
    if (!raw) return { url: DEFAULT_BRIDGE_URL, token: '' };
    const parsed = JSON.parse(raw) as Partial<BridgePairing>;
    return {
      url: sanitizeBridgeUrl(parsed.url || DEFAULT_BRIDGE_URL),
      token: typeof parsed.token === 'string' ? parsed.token.trim() : '',
    };
  } catch {
    return { url: DEFAULT_BRIDGE_URL, token: '' };
  }
}

export function saveBridgePairing(pairing: BridgePairing): BridgePairing {
  const clean: BridgePairing = {
    url: sanitizeBridgeUrl(pairing.url),
    token: (pairing.token || '').trim(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BRIDGE_PAIRING_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage error
    }
  }
  return clean;
}

function bridgeHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Akane-Bridge-Token': token,
  };
}

export async function fetchBridgeState(
  pairing: BridgePairing
): Promise<BridgeStatePayload> {
  const res = await fetch(`${sanitizeBridgeUrl(pairing.url)}/state`, {
    headers: bridgeHeaders(pairing.token),
  });
  const data = (await res.json()) as BridgeStatePayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Bridge state failed (${res.status})`);
  }
  return data;
}

export interface BridgeToolCallResponse {
  status: 'executed' | 'pending_approval' | 'blocked' | 'emergency_stopped' | 'error';
  level?: 'A' | 'B' | 'C';
  summary?: string;
  data?: Record<string, unknown>;
  error?: string;
  approval?: BridgePendingApproval;
  activity?: BridgeActivityItem;
  taintState?: BridgeTaintState;
}

export async function invokeBridgeTool(
  pairing: BridgePairing,
  tool: string,
  args: Record<string, unknown>
): Promise<BridgeToolCallResponse> {
  const res = await fetch(`${sanitizeBridgeUrl(pairing.url)}/tool`, {
    method: 'POST',
    headers: bridgeHeaders(pairing.token),
    body: JSON.stringify({ tool, args }),
  });
  const data = (await res.json()) as BridgeToolCallResponse;
  return data;
}

export async function approveBridgeAction(
  pairing: BridgePairing,
  approvalId: string
): Promise<{
  status: string;
  summary?: string;
  error?: string;
  activity?: BridgeActivityItem;
}> {
  const res = await fetch(
    `${sanitizeBridgeUrl(pairing.url)}/approve/${encodeURIComponent(approvalId)}`,
    {
      method: 'POST',
      headers: bridgeHeaders(pairing.token),
    }
  );
  return (await res.json()) as {
    status: string;
    summary?: string;
    error?: string;
    activity?: BridgeActivityItem;
  };
}

export async function denyBridgeAction(
  pairing: BridgePairing,
  approvalId: string
): Promise<{ status: string; activity?: BridgeActivityItem; error?: string }> {
  const res = await fetch(
    `${sanitizeBridgeUrl(pairing.url)}/deny/${encodeURIComponent(approvalId)}`,
    {
      method: 'POST',
      headers: bridgeHeaders(pairing.token),
    }
  );
  return (await res.json()) as {
    status: string;
    activity?: BridgeActivityItem;
    error?: string;
  };
}

export async function updateBridgeSettingsRemote(
  pairing: BridgePairing,
  patch: Partial<BridgeSettings>
): Promise<{ ok: boolean; settings?: BridgeSettings; error?: string }> {
  const res = await fetch(`${sanitizeBridgeUrl(pairing.url)}/settings`, {
    method: 'POST',
    headers: bridgeHeaders(pairing.token),
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as {
    ok: boolean;
    settings?: BridgeSettings;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update bridge settings.');
  }
  return data;
}

export async function emergencyStopBridge(
  pairing: BridgePairing,
  reason = 'Emergency hotkey pressed'
): Promise<void> {
  await fetch(`${sanitizeBridgeUrl(pairing.url)}/emergency-stop`, {
    method: 'POST',
    headers: bridgeHeaders(pairing.token),
    body: JSON.stringify({ reason }),
  });
}

export async function resumeBridgeRemote(pairing: BridgePairing): Promise<void> {
  await fetch(`${sanitizeBridgeUrl(pairing.url)}/resume`, {
    method: 'POST',
    headers: bridgeHeaders(pairing.token),
  });
}
