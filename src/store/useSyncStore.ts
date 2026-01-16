import { create } from 'zustand';

export type CloudSyncPhase = 'off' | 'connecting' | 'live' | 'error';

interface CloudSyncState {
  phase: CloudSyncPhase;
  lastSyncedAt: number | null;
  error: string | null;
  setPhase: (phase: CloudSyncPhase) => void;
  setError: (message: string) => void;
  markLive: () => void;
  markSynced: () => void;
  reset: () => void;
}

export const useSyncStore = create<CloudSyncState>((set) => ({
  phase: 'off',
  lastSyncedAt: null,
  error: null,
  setPhase: (phase) => set({ phase, error: phase === 'error' ? 'Sync error.' : null }),
  setError: (message) => set({ phase: 'error', error: message }),
  markLive: () => set({ phase: 'live', error: null }),
  markSynced: () => set({ phase: 'live', lastSyncedAt: Date.now(), error: null }),
  reset: () => set({ phase: 'off', lastSyncedAt: null, error: null }),
}));

