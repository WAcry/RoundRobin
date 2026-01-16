import { Check, ChevronLeft, ChevronRight, Clock, Download, History, ListTodo, Monitor, Moon, MoreHorizontal, Sun, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { applyThemeMode, getThemeMode, setThemeMode, THEME_STORAGE_KEY, type ThemeMode } from '../lib/theme';
import { useToastStore } from '../store/useToastStore';
import { getNextWriteMeta, noteExternalRevision, useStore } from '../store/useStore';
import type { AppState, Task, TaskId } from '../types';

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueIds(ids: TaskId[]): TaskId[] {
    const seen = new Set<TaskId>();
    const out: TaskId[] = [];
    ids.forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        out.push(id);
    });
    return out;
}

function normalizeImportedState(raw: unknown): AppState {
    const root = isRecord(raw) ? raw : null;
    const candidate = root && isRecord(root.state) ? root.state : root;
    if (!isRecord(candidate)) throw new Error('Invalid import file.');

    const tasksRaw = candidate.tasks;
    if (!isRecord(tasksRaw)) throw new Error('Invalid import file: missing tasks.');

    const now = Date.now();

    const normalizedTasks: Record<TaskId, Task> = {};
    Object.entries(tasksRaw).forEach(([id, value]) => {
        if (!isRecord(value)) throw new Error(`Invalid task: ${id}`);

        const title = typeof value.title === 'string' ? value.title.trim() : '';
        if (!title) throw new Error(`Invalid task title: ${id}`);

        const createdAt = typeof value.createdAt === 'number' ? value.createdAt : now;
        const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : createdAt;
        const doneAt = typeof value.doneAt === 'number' ? value.doneAt : undefined;

        const subtasksRaw = Array.isArray(value.subtasks) ? value.subtasks : [];
        const subtasks = subtasksRaw.map((st, idx) => {
            if (!isRecord(st)) throw new Error(`Invalid subtask: ${id}[${idx}]`);
            return {
                id: typeof st.id === 'string' ? st.id : crypto.randomUUID(),
                text: typeof st.text === 'string' ? st.text : '',
                done: typeof st.done === 'boolean' ? st.done : false,
                createdAt: typeof st.createdAt === 'number' ? st.createdAt : now,
                doneAt: typeof st.doneAt === 'number' ? st.doneAt : undefined,
            };
        });

        const uiRaw = isRecord(value.ui) ? value.ui : {};
        const ui = {
            subtasksOpen: typeof uiRaw.subtasksOpen === 'boolean' ? uiRaw.subtasksOpen : false,
            notesOpen: typeof uiRaw.notesOpen === 'boolean' ? uiRaw.notesOpen : false,
            showCompletedSubtasks: typeof uiRaw.showCompletedSubtasks === 'boolean' ? uiRaw.showCompletedSubtasks : false,
        };

        const snoozeUntil = typeof value.snoozeUntil === 'number' ? value.snoozeUntil : undefined;
        const snoozeSeq = typeof value.snoozeSeq === 'number' ? value.snoozeSeq : undefined;
        const notesMd = typeof value.notesMd === 'string' ? value.notesMd : '';

        normalizedTasks[id] = {
            id,
            title,
            createdAt,
            updatedAt,
            doneAt,
            subtasks,
            notesMd,
            ui,
            snoozeUntil,
            snoozeSeq,
        };
    });

    const allIds = new Set<TaskId>(Object.keys(normalizedTasks));
    const filterIds = (value: unknown, label: string) => {
        if (value == null) return [];
        if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) throw new Error(`Invalid ${label}.`);
        return value.filter((id) => allIds.has(id));
    };

    const rev = typeof candidate.rev === 'number' && Number.isFinite(candidate.rev) ? Math.max(0, Math.floor(candidate.rev)) : 0;
    const updatedAt = typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : now;
    const clientId =
        typeof candidate.clientId === 'string' && candidate.clientId.trim().length > 0 ? candidate.clientId : crypto.randomUUID();

    const version = Math.max(2, typeof candidate.version === 'number' ? candidate.version : 1);
    let currentTaskId: TaskId | null = candidate.currentTaskId == null ? null : (candidate.currentTaskId as TaskId);
    if (currentTaskId !== null && typeof currentTaskId !== 'string') throw new Error('Invalid currentTaskId.');
    if (currentTaskId !== null && !allIds.has(currentTaskId)) currentTaskId = null;

    let wokenQueue = uniqueIds(filterIds(candidate.wokenQueue, 'wokenQueue')).filter((id) => id !== currentTaskId);
    let readyQueue = uniqueIds(filterIds(candidate.readyQueue, 'readyQueue')).filter((id) => id !== currentTaskId);

    const computedSnoozed = Object.keys(normalizedTasks).filter((id) => typeof normalizedTasks[id]?.snoozeUntil === 'number');
    const importedSnoozed = uniqueIds(filterIds(candidate.snoozedIds, 'snoozedIds')).filter(
        (id) => typeof normalizedTasks[id]?.snoozeUntil === 'number'
    );
    const snoozedIds = [...importedSnoozed, ...computedSnoozed.filter((id) => !importedSnoozed.includes(id))].filter(
        (id) => id !== currentTaskId
    );

    const completedIds = uniqueIds(filterIds(candidate.completedIds, 'completedIds')).filter((id) => id !== currentTaskId);

    let maxSeq = 0;
    Object.values(normalizedTasks).forEach((task) => {
        if (!task || typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) return;
        task.snoozeSeq = Math.floor(task.snoozeSeq);
        maxSeq = Math.max(maxSeq, task.snoozeSeq);
    });
    snoozedIds.forEach((id) => {
        const task = normalizedTasks[id];
        if (!task || typeof task.snoozeUntil !== 'number') return;
        if (typeof task.snoozeSeq === 'number' && Number.isFinite(task.snoozeSeq)) return;
        maxSeq += 1;
        task.snoozeSeq = maxSeq;
    });

    wokenQueue = wokenQueue.filter((id) => !snoozedIds.includes(id) && !completedIds.includes(id));
    readyQueue = readyQueue.filter((id) => !wokenQueue.includes(id) && !snoozedIds.includes(id) && !completedIds.includes(id));

    if (!currentTaskId) {
        if (wokenQueue.length > 0) {
            currentTaskId = wokenQueue[0];
            wokenQueue = wokenQueue.slice(1);
        } else if (readyQueue.length > 0) {
            currentTaskId = readyQueue[0];
            readyQueue = readyQueue.slice(1);
        }
    }

    const nextSnoozeSeq = (() => {
        const candidateSeq = candidate.nextSnoozeSeq;
        if (typeof candidateSeq === 'number' && Number.isFinite(candidateSeq) && candidateSeq > 0) {
            const normalized = Math.floor(candidateSeq);
            return normalized <= maxSeq ? maxSeq + 1 : normalized;
        }
        return maxSeq + 1;
    })();

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
        tasks: normalizedTasks,
        nextSnoozeSeq,
    };
}

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

export function HeaderMenu({ snoozedCount, onOpenDeferred, onOpenHistory, onOpenAllTasks }: HeaderMenuProps) {
    const pushToast = useToastStore((state) => state.pushToast);
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
        const imported = normalizeImportedState(raw);

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
                            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-4 tabular-nums"
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
                                            <span className="min-w-6 h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold leading-5 tabular-nums">
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
