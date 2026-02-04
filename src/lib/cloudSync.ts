import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { AppState } from '../types';
import { isEditableTarget } from './dom';
import { normalizeAppState } from './state/normalizeAppState';
import { mergeRemoteIntoLocalState } from './state/mergeAppState';
import { getNextWriteMeta, noteExternalRevision, useStore } from '../store/useStore';
import {
  discardPendingPersistedState,
  flushPersistedState,
  hasPendingPersistedState,
  resumePersistedWrites,
  suspendPersistedWrites,
} from '../store/storage';
import { useSyncStore } from '../store/useSyncStore';

const DEFAULT_DEBOUNCE_MS = 900;
const APP_DOC_ID = 'roundrobin';

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.floor(value) === value;
}

function pickStateForSync(): AppState {
  const state = useStore.getState();
  const {
    rev,
    updatedAt,
    clientId,
    version,
    currentTaskId,
    wokenQueue,
    readyQueue,
    snoozedIds,
    completedIds,
    deletedIds,
    tasks,
    nextSnoozeSeq,
  } = state;
  return {
    rev,
    updatedAt,
    clientId,
    version,
    currentTaskId,
    wokenQueue,
    readyQueue,
    snoozedIds,
    completedIds,
    deletedIds,
    tasks,
    nextSnoozeSeq,
  };
}

function applyExternalState(next: AppState) {
  const temporal = useStore.temporal.getState();
  temporal.pause();
  useStore.setState(next, false);
  temporal.clear();
  temporal.resume();
}

function formatAuthError(err: unknown) {
  if (err instanceof Error) return err.message;
  return 'Cloud sync failed.';
}

export function startCloudSync(uid: string, options?: { debounceMs?: number }) {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const sync = useSyncStore.getState();
  sync.setPhase('connecting');

  const ref = doc(db, 'users', uid, 'apps', APP_DOC_ID);

  let stopped = false;
  let isApplyingRemote = false;
  let scheduledTimeoutId: number | null = null;
  let latestToUpload: AppState | null = null;
  let lastRemoteState: AppState | null = null;

  const clearScheduled = () => {
    if (scheduledTimeoutId == null) return;
    window.clearTimeout(scheduledTimeoutId);
    scheduledTimeoutId = null;
  };

  const writeLatest = async () => {
    clearScheduled();
    if (stopped) return;

    const localSnapshot = latestToUpload ?? pickStateForSync();
    const mergedSnapshot =
      lastRemoteState ? mergeRemoteIntoLocalState(localSnapshot, lastRemoteState) : localSnapshot;

    const isEditing = isEditableTarget(document.activeElement) || hasPendingPersistedState();
    const tasksChanged =
      Object.keys(localSnapshot.tasks).length !== Object.keys(mergedSnapshot.tasks).length ||
      Object.keys(mergedSnapshot.tasks).some((id) => {
        const localTask = localSnapshot.tasks[id];
        const mergedTask = mergedSnapshot.tasks[id];
        if (!localTask) return true;
        return localTask.doneAt !== mergedTask.doneAt || localTask.restoredAt !== mergedTask.restoredAt;
      });

    const arraysEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((value, idx) => value === b[idx]);

    const shouldReconcile =
      tasksChanged ||
      localSnapshot.currentTaskId !== mergedSnapshot.currentTaskId ||
      localSnapshot.nextSnoozeSeq !== mergedSnapshot.nextSnoozeSeq ||
      !arraysEqual(localSnapshot.wokenQueue, mergedSnapshot.wokenQueue) ||
      !arraysEqual(localSnapshot.readyQueue, mergedSnapshot.readyQueue) ||
      !arraysEqual(localSnapshot.snoozedIds, mergedSnapshot.snoozedIds) ||
      !arraysEqual(localSnapshot.completedIds, mergedSnapshot.completedIds) ||
      !arraysEqual(localSnapshot.deletedIds, mergedSnapshot.deletedIds);

    if (shouldReconcile && isEditing) {
      // Avoid disrupting in-progress user edits (e.g. unsaved title/notes). We'll retry shortly.
      latestToUpload = localSnapshot;
      scheduledTimeoutId = window.setTimeout(() => void writeLatest(), debounceMs);
      return;
    }

    let payload = localSnapshot;
    if (shouldReconcile) {
      const meta = getNextWriteMeta(useStore.getState());
      const nextState: AppState = { ...mergedSnapshot, ...meta };
      isApplyingRemote = true;
      applyExternalState(nextState);
      isApplyingRemote = false;
      payload = nextState;
    }

    latestToUpload = null;

    try {
      await setDoc(
        ref,
        {
          schemaVersion: 1,
          updatedAt: serverTimestamp(),
          state: payload,
        },
        { merge: false }
      );
      sync.markSynced();
    } catch (err) {
      sync.setError(formatAuthError(err));
    }
  };

  const scheduleWrite = (state: AppState, immediate = false) => {
    if (stopped) return;
    latestToUpload = state;
    clearScheduled();
    const delay = immediate ? 0 : debounceMs;
    scheduledTimeoutId = window.setTimeout(() => void writeLatest(), delay);
  };

  const maybeConfirmReplaceLocal = () => {
    const isEditing = isEditableTarget(document.activeElement) || hasPendingPersistedState();
    if (!isEditing) return true;
    return window.confirm(
      'Detected newer cloud data. Refresh now?\n\nPress Cancel to keep editing (cloud changes will be preserved).'
    );
  };

  const unsubLocal = useStore.subscribe((next, prev) => {
    if (stopped) return;
    if (isApplyingRemote) return;
    if (next.rev === prev.rev) return;
    scheduleWrite(pickStateForSync());
  });

  const unsubRemote = onSnapshot(
    ref,
    (snap) => {
      if (stopped) return;
      sync.markLive();

      if (!snap.exists()) {
        scheduleWrite(pickStateForSync(), true);
        return;
      }

      let incoming: AppState;
      try {
        incoming = normalizeAppState(snap.data());
      } catch {
        // Corrupt/unexpected payload; keep local and attempt to overwrite with a valid one.
        scheduleWrite(pickStateForSync(), true);
        return;
      }

      if (!isFiniteNonNegativeInt(incoming.rev)) return;
      const incomingRev = incoming.rev;
      noteExternalRevision(incomingRev);
      lastRemoteState = incoming;

      const local = useStore.getState();
      const localRev = local.rev;

      if (incomingRev === localRev) return;

      if (incomingRev < localRev) {
        scheduleWrite(pickStateForSync());
        return;
      }

      // incomingRev > localRev
      const shouldRefresh = maybeConfirmReplaceLocal();
      if (!shouldRefresh) {
        // Keep local for now. All outbound writes are merged to preserve cloud deletions/completions.
        return;
      }

      isApplyingRemote = true;
      suspendPersistedWrites();
      discardPendingPersistedState();
      applyExternalState(incoming);
      resumePersistedWrites();
      flushPersistedState();
      isApplyingRemote = false;

      // If we had a queued upload, discard it (the local state is now cloud-derived).
      latestToUpload = null;
      clearScheduled();
      sync.markSynced();
    },
    (err) => {
      sync.setError(formatAuthError(err));
    }
  );

  return () => {
    stopped = true;
    clearScheduled();
    latestToUpload = null;
    unsubRemote();
    unsubLocal();
    sync.reset();
  };
}

