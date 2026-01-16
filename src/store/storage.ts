import type { StateStorage } from 'zustand/middleware';

export const STORAGE_KEY = 'roundrobin.state.v1';
const LEGACY_STORAGE_KEY = 'round-robin-storage';

const DEFAULT_DEBOUNCE_MS = 220;

type PendingWrite = {
  key: string;
  value: string;
  timeoutId: number;
};

let pendingWrite: PendingWrite | null = null;
let writesSuspended = false;

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota / unavailable storage errors.
  }
}

function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function flushPersistedState() {
  if (writesSuspended) return;
  if (!pendingWrite) return;
  const { key, value, timeoutId } = pendingWrite;
  window.clearTimeout(timeoutId);
  pendingWrite = null;
  safeSetItem(key, value);
}

export function discardPendingPersistedState() {
  if (!pendingWrite) return;
  window.clearTimeout(pendingWrite.timeoutId);
  pendingWrite = null;
}

export function hasPendingPersistedState() {
  return pendingWrite !== null;
}

export function suspendPersistedWrites() {
  writesSuspended = true;
}

export function resumePersistedWrites() {
  writesSuspended = false;
}

export function arePersistedWritesSuspended() {
  return writesSuspended;
}

export function createDebouncedLocalStorage(debounceMs = DEFAULT_DEBOUNCE_MS): StateStorage {
  return {
    getItem: (key) => {
      const direct = safeGetItem(key);
      if (direct !== null) return direct;
      if (key === STORAGE_KEY) return safeGetItem(LEGACY_STORAGE_KEY);
      return null;
    },
    setItem: (key, value) => {
      if (pendingWrite?.key === key) {
        window.clearTimeout(pendingWrite.timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        if (writesSuspended) return;
        safeSetItem(key, value);
        if (pendingWrite?.timeoutId === timeoutId) pendingWrite = null;
      }, debounceMs);

      pendingWrite = { key, value, timeoutId };
    },
    removeItem: (key) => {
      if (pendingWrite?.key === key) {
        window.clearTimeout(pendingWrite.timeoutId);
        pendingWrite = null;
      }
      safeRemoveItem(key);
    },
  };
}
