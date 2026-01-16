import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';

export async function startFirebaseBootstrap(): Promise<() => void> {
  const [{ auth }, { getRedirectResult, onAuthStateChanged }] = await Promise.all([
    import('./firebase'),
    import('firebase/auth'),
  ]);

  void getRedirectResult(auth).catch(() => {
    // Ignore redirect errors; onAuthStateChanged is our source of truth.
  });

  let stopSync: (() => void) | null = null;
  let version = 0;

  const unsubAuth = onAuthStateChanged(auth, async (user) => {
    version += 1;
    const token = version;

    useAuthStore.getState().setUser(user);

    if (stopSync) {
      stopSync();
      stopSync = null;
    }

    if (!user) {
      useSyncStore.getState().reset();
      return;
    }

    const { startCloudSync } = await import('./cloudSync');
    if (token !== version) return;
    stopSync = startCloudSync(user.uid);
  });

  return () => {
    version += 1;
    unsubAuth();
    if (stopSync) stopSync();
  };
}

