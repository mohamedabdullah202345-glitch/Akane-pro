import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
} from './firebaseClient';
import type {
  CompanionMode,
  MemoryV2Item,
  MemoryV2Kind,
  MissionItem,
  MissionPriority,
  SessionSummaryItem,
} from '../types/akane';
import type { User } from 'firebase/auth';

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/gi, '0');
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function ensureUserProfile(
  user: User,
  companionMode: CompanionMode,
  incrementSession = false
): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const email = (user.email || 'user@example.com').slice(0, 254);
    const displayName = (user.displayName || email.split('@')[0] || 'Friend').slice(0, 100);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        companionMode,
        totalSessions: incrementSession ? 1 : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (incrementSession || snap.data()?.companionMode !== companionMode) {
      const existing = snap.data() as DocumentData;
      const curTotal = typeof existing.totalSessions === 'number' ? existing.totalSessions : 0;
      await updateDoc(ref, {
        displayName: existing.displayName || displayName,
        companionMode,
        totalSessions: incrementSession ? Math.min(1_000_000, curTotal + 1) : curTotal,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      path
    );
  }
}

export async function listMemoryV2(uid: string): Promise<MemoryV2Item[]> {
  const path = `users/${uid}/memories`;
  try {
    const q = query(
      collection(db, 'users', uid, 'memories'),
      orderBy('updatedAt', 'desc'),
      limit(60)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: String(data.uid || uid),
        kind: (data.kind as MemoryV2Kind) || 'fact',
        content: String(data.content || ''),
        dueAt: typeof data.dueAt === 'string' ? data.dueAt : undefined,
        importance: typeof data.importance === 'number' ? data.importance : 5,
        resolved: Boolean(data.resolved),
        source: (data.source as MemoryV2Item['source']) || 'manual',
        lastMentionedAt: data.lastMentionedAt ? toIsoString(data.lastMentionedAt) : undefined,
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveMemoryV2Item(
  uid: string,
  input: {
    kind: MemoryV2Kind;
    content: string;
    dueAt?: string;
    importance?: number;
    source: 'voice' | 'chat' | 'manual';
  }
): Promise<MemoryV2Item> {
  const id = makeDocId('mem');
  const path = `users/${uid}/memories/${id}`;
  const cleanContent = input.content.trim().slice(0, 1000);
  const cleanDueAt = input.dueAt ? input.dueAt.trim().slice(0, 120) : undefined;
  const importance = Math.max(1, Math.min(10, Math.round(input.importance ?? (input.kind === 'event' || input.kind === 'open_loop' ? 8 : 6))));

  try {
    const ref = doc(db, 'users', uid, 'memories', id);
    const payload: Record<string, unknown> = {
      uid,
      kind: input.kind,
      content: cleanContent,
      importance,
      resolved: false,
      source: input.source,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanDueAt) {
      payload.dueAt = cleanDueAt;
    }
    await setDoc(ref, payload);
    const nowIso = new Date().toISOString();
    return {
      id,
      uid,
      kind: input.kind,
      content: cleanContent,
      dueAt: cleanDueAt,
      importance,
      resolved: false,
      source: input.source,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markMemoryMentioned(uid: string, memoryId: string): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'memories', memoryId), {
      lastMentionedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function forgetMemoryItem(uid: string, memoryId: string): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', memoryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function selectSessionMemories(items: MemoryV2Item[]): {
  top10: MemoryV2Item[];
  followUpItem: MemoryV2Item | null;
} {
  const scored = [...items].sort((a, b) => {
    const unresolvedBoostA = !a.resolved && (a.kind === 'event' || a.kind === 'open_loop') ? 4 : 0;
    const unresolvedBoostB = !b.resolved && (b.kind === 'event' || b.kind === 'open_loop') ? 4 : 0;
    const scoreA = a.importance + unresolvedBoostA;
    const scoreB = b.importance + unresolvedBoostB;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const top10 = scored.slice(0, 10);

  // Pick ONE unresolved open_loop or event (prefer least-recently-mentioned) for natural follow-up
  const candidates = scored.filter(
    (m) => !m.resolved && (m.kind === 'open_loop' || m.kind === 'event')
  );
  candidates.sort((a, b) => {
    if (!a.lastMentionedAt && b.lastMentionedAt) return -1;
    if (a.lastMentionedAt && !b.lastMentionedAt) return 1;
    return (a.lastMentionedAt || '').localeCompare(b.lastMentionedAt || '');
  });

  return {
    top10,
    followUpItem: candidates[0] ?? null,
  };
}

export async function saveSessionSummary(
  uid: string,
  summaryText: string,
  turnCount: number
): Promise<SessionSummaryItem> {
  const id = makeDocId('sum');
  const path = `users/${uid}/sessionSummaries/${id}`;
  const cleanSummary = summaryText.trim().slice(0, 2000) || 'Short check-in session with Akane.';
  const safeTurnCount = Math.max(0, Math.min(10_000, Math.round(turnCount)));

  try {
    await setDoc(doc(db, 'users', uid, 'sessionSummaries', id), {
      uid,
      summary: cleanSummary,
      turnCount: safeTurnCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const nowIso = new Date().toISOString();
    return {
      id,
      uid,
      summary: cleanSummary,
      turnCount: safeTurnCount,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function listSessionSummaries(uid: string): Promise<SessionSummaryItem[]> {
  const path = `users/${uid}/sessionSummaries`;
  try {
    const q = query(
      collection(db, 'users', uid, 'sessionSummaries'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: String(data.uid || uid),
        summary: String(data.summary || ''),
        turnCount: typeof data.turnCount === 'number' ? data.turnCount : 0,
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function listUserTasks(uid: string): Promise<MissionItem[]> {
  const path = `users/${uid}/tasks`;
  try {
    const q = query(
      collection(db, 'users', uid, 'tasks'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const status = data.status === 'completed' ? 'completed' : 'pending';
      return {
        id: d.id,
        title: String(data.title || ''),
        description: String(data.description || ''),
        priority: (data.priority as MissionPriority) || 'medium',
        status,
        createdAt: toIsoString(data.createdAt),
        completedAt: status === 'completed' ? toIsoString(data.updatedAt) : undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createUserTask(
  uid: string,
  title: string,
  description = '',
  priority: MissionPriority = 'medium',
  explicitId?: string
): Promise<MissionItem> {
  const id = explicitId && /^[a-zA-Z0-9_-]+$/.test(explicitId) ? explicitId : makeDocId('mis');
  const path = `users/${uid}/tasks/${id}`;
  const cleanTitle = title.trim().slice(0, 200);
  const cleanDesc = description.trim().slice(0, 1000);

  try {
    await setDoc(doc(db, 'users', uid, 'tasks', id), {
      uid,
      title: cleanTitle,
      description: cleanDesc,
      priority,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id,
      title: cleanTitle,
      description: cleanDesc,
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateUserTaskStatus(
  uid: string,
  taskId: string,
  status: 'pending' | 'completed'
): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteUserTask(uid: string, taskId: string): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteAllUserData(uid: string): Promise<void> {
  const subcollections = ['memories', 'sessionSummaries', 'tasks'] as const;
  for (const sub of subcollections) {
    const colPath = `users/${uid}/${sub}`;
    try {
      const snap = await getDocs(collection(db, 'users', uid, sub));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, colPath);
    }
  }

  const profilePath = `users/${uid}`;
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, profilePath);
  }
}
