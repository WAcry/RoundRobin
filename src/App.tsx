import { TaskInput } from './components/TaskInput';
import { TaskCard } from './components/TaskCard';
import { HistoryDrawer } from './components/HistoryDrawer';
import { SnoozedTasksPanel } from './components/SnoozedTasksPanel';
import { AllTasksPanel } from './components/AllTasksPanel';
import { HeaderMenu } from './components/HeaderMenu';
import { getNextWriteMeta, noteExternalRevision, useStore } from './store/useStore';
import { useEffect, useRef, useState } from 'react';
import { ToastHost } from './components/ToastHost';
import type { AppState } from './types';
import { isEditableTarget } from './lib/dom';
import { startFirebaseBootstrap } from './lib/firebaseBootstrap';
import {
  discardPendingPersistedState,
  flushPersistedState,
  hasPendingPersistedState,
  resumePersistedWrites,
  STORAGE_KEY,
  suspendPersistedWrites,
} from './store/storage';
import { QueueBar } from './components/QueueBar';
import { useToastStore } from './store/useToastStore';
import { HelpFab } from './components/HelpFab';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parsePersistedAppState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const root = JSON.parse(raw) as unknown;
    if (!isRecord(root)) return null;
    if (!isRecord(root.state)) return null;
    return root.state as unknown as AppState;
  } catch {
    return null;
  }
}

function App() {
  const tick = useStore((state) => state.tick);
  const snoozedCount = useStore((state) => state.snoozedIds.length);
  const pushToast = useToastStore((state) => state.pushToast);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deferredOpen, setDeferredOpen] = useState(false);
  const [allTasksOpen, setAllTasksOpen] = useState(false);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    let stop: (() => void) | null = null;

    void startFirebaseBootstrap()
      .then((cleanup) => {
      if (!mounted) {
        cleanup();
        return;
      }
      stop = cleanup;
      })
      .catch(() => {
        // Firebase is optional; keep the app local-first if it fails to initialize.
      });

    return () => {
      mounted = false;
      stop?.();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const wokenCount = tick();
      if (wokenCount <= 0) return;
      pushToast({
        kind: 'info',
        message: wokenCount === 1 ? '1 task woke up.' : `${wokenCount} tasks woke up.`,
        actions: [
          {
            label: 'Undo',
            variant: 'primary',
            onClick: () => useStore.temporal.getState().undo(),
          },
        ],
      });
    }, 1000); // Check snoozes every second
    return () => clearInterval(interval);
  }, [pushToast, tick]);

  useEffect(() => {
    const flush = () => flushPersistedState();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const applyExternalState = (next: AppState) => {
      const temporal = useStore.temporal.getState();
      temporal.pause();
      useStore.setState(next, false);
      temporal.clear();
      temporal.resume();
    };

    const syncIfNewer = (raw: string | null) => {
      const incoming = parsePersistedAppState(raw);
      if (!incoming) return;
      if (typeof incoming.rev !== 'number' || !Number.isFinite(incoming.rev)) return;

      const incomingRev = Math.max(0, Math.floor(incoming.rev));
      const currentRev = useStore.getState().rev;
      if (incomingRev <= currentRev) return;

      noteExternalRevision(incomingRev);
      suspendPersistedWrites();

      const isEditing = isEditableTarget(document.activeElement) || hasPendingPersistedState();
      if (isEditing) {
        const shouldRefresh = window.confirm(
          'Detected updates in another tab. Refresh now?\n\nPress Cancel to keep your version (this will overwrite the other tab).'
        );

        if (!shouldRefresh) {
          discardPendingPersistedState();
          resumePersistedWrites();

          const meta = getNextWriteMeta(useStore.getState());
          useStore.setState(meta, false);
          flushPersistedState();
          return;
        }
      }

      discardPendingPersistedState();
      applyExternalState(incoming);
      discardPendingPersistedState();
      resumePersistedWrites();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === e.oldValue) return;

      syncIfNewer(e.newValue);
    };

    window.addEventListener('storage', onStorage);
    const onFocus = () => syncIfNewer(localStorage.getItem(STORAGE_KEY));
    const onVisibilitySync = () => {
      if (document.visibilityState === 'visible') onFocus();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilitySync);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilitySync);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.repeat) return;

      const hasCommand = e.metaKey || e.ctrlKey;
      if (!hasCommand) return;
      if (e.altKey) return;

      const key = e.key.toLowerCase();
      const code = e.code;

      const isZ = key === 'z' || code === 'KeyZ';
      const isY = key === 'y' || code === 'KeyY';

      const shouldUndo = isZ && !e.shiftKey;
      const shouldRedo = (isZ && e.shiftKey) || (!e.metaKey && e.ctrlKey && isY);
      if (!shouldUndo && !shouldRedo) return;

      if (isEditableTarget(e.target)) return; // Let native browser undo handle text inputs

      e.preventDefault();
      const temporal = useStore.temporal.getState();
      if (shouldRedo) temporal.redo();
      else temporal.undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.repeat) return;
      if (e.isComposing) return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!(e.code === 'Space' || e.key === ' ')) return;

      if (isEditableTarget(e.target)) return;
      if (historyOpen || deferredOpen || allTasksOpen) return;

      const input = taskInputRef.current;
      if (!input) return;
      if (document.activeElement === input) return;

      e.preventDefault();
      input.focus({ preventScroll: true });
    };

    // Capture so we can prevent page scroll / button activation before default actions fire.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [allTasksOpen, deferredOpen, historyOpen]);

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans selection:bg-blue-100 dark:selection:bg-blue-900 overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 h-screen flex flex-col max-w-2xl relative">
        <header className="mb-4 flex items-center justify-between gap-3">
          <QueueBar />
          <div className="flex items-center gap-1">
            <HeaderMenu
              snoozedCount={snoozedCount}
              onOpenDeferred={() => {
                setAllTasksOpen(false);
                setHistoryOpen(false);
                setDeferredOpen(true);
              }}
              onOpenHistory={() => {
                setAllTasksOpen(false);
                setDeferredOpen(false);
                setHistoryOpen(true);
              }}
              onOpenAllTasks={() => {
                setHistoryOpen(false);
                setDeferredOpen(false);
                setAllTasksOpen(true);
              }}
            />
          </div>
        </header>

        <main className="flex-1 flex flex-col justify-center pb-28 sm:pb-20">
          <TaskInput ref={taskInputRef} />
          <TaskCard onOpenDeferredTasks={() => setDeferredOpen(true)} />
        </main>

        <footer className="py-4 text-center text-xs text-gray-400 dark:text-gray-600">
          <p>Focus on one thing.</p>
        </footer>

        <HistoryDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
        <SnoozedTasksPanel isOpen={deferredOpen} onClose={() => setDeferredOpen(false)} />
        <AllTasksPanel isOpen={allTasksOpen} onClose={() => setAllTasksOpen(false)} />
      </div>
      <HelpFab />
      <ToastHost />
    </div>
  );
}

export default App
