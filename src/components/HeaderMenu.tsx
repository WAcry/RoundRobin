import {
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Cloud,
    CloudOff,
    Download,
    History,
    ListTodo,
    LogIn,
    LogOut,
    Monitor,
    Moon,
    MoreHorizontal,
    Sun,
    Upload,
    User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { applyThemeMode, getThemeMode, setThemeMode, THEME_STORAGE_KEY, type ThemeMode } from '../lib/theme';
import { normalizeAppState } from '../lib/state/normalizeAppState';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import { useToastStore } from '../store/useToastStore';
import { getNextWriteMeta, noteExternalRevision, useStore } from '../store/useStore';
import type { AppState } from '../types';

interface HeaderMenuProps {
    snoozedCount: number;
    onOpenDeferred: () => void;
    onOpenHistory: () => void;
    onOpenAllTasks: () => void;
}

type MenuPage = 'root' | 'theme' | 'data';

type ThemeOption = {
    mode: ThemeMode;
    label: string;
    icon: ReactNode;
};

function formatThemeLabel(mode: ThemeMode) {
    switch (mode) {
        case 'light':
            return 'Light';
        case 'dark':
            return 'Dark';
        default:
            return 'System';
    }
}

function formatUserLabel(user: { displayName?: string | null; email?: string | null }) {
    const name = typeof user.displayName === 'string' ? user.displayName.trim() : '';
    if (name) return name;
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    if (email) return email;
    return 'Google user';
}

export function HeaderMenu({ snoozedCount, onOpenDeferred, onOpenHistory, onOpenAllTasks }: HeaderMenuProps) {
    const pushToast = useToastStore((state) => state.pushToast);
    const user = useAuthStore((state) => state.user);
    const syncPhase = useSyncStore((state) => state.phase);
    const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const [menuOpen, setMenuOpen] = useState(false);
    const [page, setPage] = useState<MenuPage>('root');
    const [themeMode, setThemeModeValue] = useState<ThemeMode>(() => getThemeMode());

    const closeMenu = useCallback(() => {
        setMenuOpen(false);
        setPage('root');
    }, []);

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.storageArea !== localStorage) return;
            if (e.key !== THEME_STORAGE_KEY) return;
            if (e.newValue === e.oldValue) return;

            const next = getThemeMode();
            setThemeModeValue(next);
            applyThemeMode(next);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMenu();
        };
        const onPointerDown = (e: PointerEvent) => {
            if (!(e.target instanceof Node)) return;
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            closeMenu();
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointerdown', onPointerDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerdown', onPointerDown);
        };
    }, [closeMenu, menuOpen]);

    const themeOptions = useMemo<ThemeOption[]>(
        () => [
            { mode: 'system', label: 'System', icon: <Monitor size={16} /> },
            { mode: 'light', label: 'Light', icon: <Sun size={16} /> },
            { mode: 'dark', label: 'Dark', icon: <Moon size={16} /> },
        ],
        []
    );

    const handleExport = () => {
        const state = useStore.getState();
        const exportFile = {
            format: 'roundrobin.export.v2',
            exportedAt: Date.now(),
            state: {
                rev: state.rev,
                updatedAt: state.updatedAt,
                clientId: state.clientId,
                version: state.version,
                currentTaskId: state.currentTaskId,
                wokenQueue: state.wokenQueue,
                readyQueue: state.readyQueue,
                snoozedIds: state.snoozedIds,
                completedIds: state.completedIds,
                deletedIds: state.deletedIds,
                tasks: state.tasks,
                nextSnoozeSeq: state.nextSnoozeSeq,
            } satisfies AppState,
        };

        const json = JSON.stringify(exportFile, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.download = `roundrobin-export-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        pushToast({ kind: 'success', message: 'Exported JSON.' });
    };

    const handleImportFile = async (file: File) => {
        const text = await file.text();
        const raw = JSON.parse(text) as unknown;
        const imported = normalizeAppState(raw);

        noteExternalRevision(imported.rev);
        const current = useStore.getState();
        const meta = getNextWriteMeta(current);

        useStore.setState(
            {
                ...imported,
                ...meta,
            },
            false
        );

        useStore.temporal.getState().clear();
        pushToast({ kind: 'success', message: 'Imported JSON.' });
    };

    const handleSignIn = async () => {
        try {
            const { signInWithGoogle } = await import('../lib/firebaseAuth');
            const outcome = await signInWithGoogle();
            if (outcome.method === 'redirect') {
                pushToast({ kind: 'info', message: 'Redirecting to Google…' });
                return;
            }
            pushToast({ kind: 'success', message: 'Signed in.' });
        } catch (err) {
            const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : null;
            if (code === 'auth/popup-closed-by-user') return;
            const message = err instanceof Error ? err.message : 'Sign-in failed.';
            pushToast({ kind: 'error', message });
        }
    };

    const handleSignOut = async () => {
        try {
            const { signOutFromFirebase } = await import('../lib/firebaseAuth');
            await signOutFromFirebase();
            pushToast({ kind: 'success', message: 'Signed out.' });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Sign-out failed.';
            pushToast({ kind: 'error', message });
        }
    };

    const menuTitle = (() => {
        switch (page) {
            case 'theme':
                return 'Theme';
            case 'data':
                return 'Data';
            default:
                return '';
        }
    })();

    const showHeader = page !== 'root';

    return (
        <>
            <div className="relative">
                <button
                    ref={triggerRef}
                    onClick={() => {
                        if (menuOpen) {
                            closeMenu();
                            return;
                        }
                        setMenuOpen(true);
                    }}
                    className="relative p-2 text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                    title="Menu"
                    aria-label="Menu"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                >
                    <MoreHorizontal size={22} />
                    {snoozedCount > 0 && (
                        <span
                            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-4 tabular-nums text-center"
                            aria-label={`${snoozedCount} deferred tasks`}
                        >
                            {snoozedCount > 99 ? '99+' : snoozedCount}
                        </span>
                    )}
                </button>

                {menuOpen && (
                    <div
                        ref={menuRef}
                        role="menu"
                        aria-label="Menu"
                        className={cn(
                            'absolute right-0 mt-2 z-50 w-64 overflow-hidden rounded-2xl',
                            'bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl',
                            'shadow-2xl',
                            'border border-black/10 dark:border-white/10'
                        )}
                    >
                        {showHeader && (
                            <div className="px-2 pt-2 pb-1 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage('root')}
                                    className={cn(
                                        'p-1.5 rounded-xl',
                                        'text-gray-500 dark:text-gray-400',
                                        'hover:bg-black/5 dark:hover:bg-white/10',
                                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                    )}
                                    aria-label="Back"
                                >
                                    <ChevronLeft size={18} />
                                </button>

                                <div className="flex-1 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">
                                    {menuTitle}
                                </div>

                                <div className="w-8" aria-hidden="true" />
                            </div>
                        )}

                        <div className="p-1">
                            {page === 'root' && (
                                <>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            closeMenu();
                                            onOpenDeferred();
                                        }}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <Clock size={16} className="text-gray-500 dark:text-gray-400" />
                                        <span className="flex-1">Deferred</span>
                                        {snoozedCount > 0 && (
                                            <span className="min-w-6 h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold leading-5 tabular-nums text-center">
                                                {snoozedCount > 99 ? '99+' : snoozedCount}
                                            </span>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            closeMenu();
                                            onOpenHistory();
                                        }}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <History size={16} className="text-gray-500 dark:text-gray-400" />
                                        <span className="flex-1">History</span>
                                    </button>

                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            closeMenu();
                                            onOpenAllTasks();
                                        }}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <ListTodo size={16} className="text-gray-500 dark:text-gray-400" />
                                        <span className="flex-1">All tasks</span>
                                    </button>

                                    <div className="my-1 h-px bg-black/10 dark:bg-white/10" />

                                    {!user && (
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                closeMenu();
                                                void handleSignIn();
                                            }}
                                            className={cn(
                                                'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                                'text-gray-800 dark:text-gray-100',
                                                'hover:bg-black/5 dark:hover:bg-white/10',
                                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                            )}
                                        >
                                            <LogIn size={16} className="text-gray-500 dark:text-gray-400" />
                                            <span className="flex-1">Sign in with Google</span>
                                        </button>
                                    )}

                                    {user && (
                                        <div
                                            className={cn(
                                                'px-3 py-2.5 rounded-xl',
                                                'text-gray-700 dark:text-gray-200',
                                                'bg-black/5 dark:bg-white/10'
                                            )}
                                        >
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <User size={16} className="text-gray-500 dark:text-gray-400" />
                                                <span className="flex-1 truncate">{formatUserLabel(user)}</span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                {syncPhase === 'live' || syncPhase === 'connecting' ? (
                                                    <Cloud size={14} />
                                                ) : (
                                                    <CloudOff size={14} />
                                                )}
                                                <span className="flex-1">
                                                    Cloud sync:{' '}
                                                    {syncPhase === 'connecting'
                                                        ? 'Syncing…'
                                                        : syncPhase === 'live'
                                                          ? 'Synced'
                                                          : syncPhase === 'error'
                                                            ? 'Error'
                                                            : 'Off'}
                                                </span>
                                                {lastSyncedAt && (
                                                    <span className="tabular-nums text-[10px]">
                                                        {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {user && (
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                                closeMenu();
                                                void handleSignOut();
                                            }}
                                            className={cn(
                                                'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                                'text-gray-800 dark:text-gray-100',
                                                'hover:bg-black/5 dark:hover:bg-white/10',
                                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                            )}
                                        >
                                            <LogOut size={16} className="text-gray-500 dark:text-gray-400" />
                                            <span className="flex-1">Sign out</span>
                                        </button>
                                    )}

                                    <div className="my-1 h-px bg-black/10 dark:bg-white/10" />

                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => setPage('theme')}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <Sun size={16} className="text-gray-500 dark:text-gray-400" />
                                        <span className="flex-1">Theme</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatThemeLabel(themeMode)}</span>
                                        <ChevronRight size={16} className="text-gray-400" />
                                    </button>

                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => setPage('data')}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <Download size={16} className="text-gray-500 dark:text-gray-400" />
                                        <span className="flex-1">Import/Export</span>
                                        <ChevronRight size={16} className="text-gray-400" />
                                    </button>
                                </>
                            )}

                            {page === 'theme' && (
                                <>
                                    {themeOptions.map((opt) => {
                                        const selected = opt.mode === themeMode;
                                        return (
                                            <button
                                                key={opt.mode}
                                                type="button"
                                                role="menuitemradio"
                                                aria-checked={selected}
                                                onClick={() => {
                                                    setThemeMode(opt.mode);
                                                    setThemeModeValue(opt.mode);
                                                    closeMenu();
                                                }}
                                                className={cn(
                                                    'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                                    'text-gray-800 dark:text-gray-100',
                                                    selected && 'bg-black/5 dark:bg-white/10',
                                                    'hover:bg-black/5 dark:hover:bg-white/10',
                                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                                )}
                                            >
                                                <span className="text-gray-500 dark:text-gray-400">{opt.icon}</span>
                                                <span className="flex-1">{opt.label}</span>
                                                <Check
                                                    size={16}
                                                    className={cn('text-blue-600 dark:text-blue-300', selected ? 'opacity-100' : 'opacity-0')}
                                                />
                                            </button>
                                        );
                                    })}
                                </>
                            )}

                            {page === 'data' && (
                                <>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            closeMenu();
                                            handleExport();
                                        }}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <Download size={16} className="text-gray-500 dark:text-gray-400" />
                                        Export JSON
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            closeMenu();
                                            importInputRef.current?.click();
                                        }}
                                        className={cn(
                                            'w-full px-3 py-2.5 flex items-center gap-2 rounded-xl text-left text-sm font-medium',
                                            'text-gray-800 dark:text-gray-100',
                                            'hover:bg-black/5 dark:hover:bg-white/10',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                    >
                                        <Upload size={16} className="text-gray-500 dark:text-gray-400" />
                                        Import JSON
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                        await handleImportFile(file);
                    } catch (err) {
                        const message = err instanceof Error ? err.message : 'Import failed.';
                        pushToast({ kind: 'error', message });
                    }
                }}
            />
        </>
    );
}
