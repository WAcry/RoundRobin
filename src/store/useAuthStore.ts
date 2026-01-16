import { create } from 'zustand';
import type { User } from 'firebase/auth';

export type AuthPhase = 'unknown' | 'signedOut' | 'signedIn';

interface AuthState {
  phase: AuthPhase;
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  phase: 'unknown',
  user: null,
  setUser: (user) => set({ user, phase: user ? 'signedIn' : 'signedOut' }),
}));

