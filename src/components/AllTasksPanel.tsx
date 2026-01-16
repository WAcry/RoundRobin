import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { Clock, GripVertical, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import type { Task, TaskId } from '../types';
import { TaskEditorModal } from './TaskEditorModal';

interface AllTasksPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type TaskMenuEntry =
    | {
          kind: 'action';
          label: string;
          onSelect: () => void;
          disabled?: boolean;
      }
    | { kind: 'divider' };

const MENU_GAP_PX = 8;

function findOverflowBoundary(element: HTMLElement | null): HTMLElement {
    let node: HTMLElement | null = element;
    while (node) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node;
        node = node.parentElement;
    }
    return document.documentElement;
}

function formatRemaining(nowMs: number, untilMs: number) {
    const remainingSeconds = Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    if (hours <= 0) return `${mm}:${ss}`;

    const hh = String(hours);
    return `${hh}:${mm}:${ss}`;
}

function SectionHeader({
    label,
    count,
    tone,
}: {
    label: string;
    count?: number;
    tone: 'blue' | 'amber' | 'gray' | 'purple';
}) {
    const dotClass = (() => {
        switch (tone) {
            case 'blue':
                return 'bg-blue-500';
            case 'amber':
                return 'bg-amber-500';
            case 'purple':
                return 'bg-purple-500';
            default:
                return 'bg-gray-400';
        }
    })();

    return (
        <div className="mt-6 first:mt-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', dotClass)} aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {label}
                </span>
            </div>
            {typeof count === 'number' && (
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
            )}
        </div>
    );
}

function TaskRowMenu({
    entries,
}: {
    entries: TaskMenuEntry[];
}) {
    const [open, setOpen] = useState(false);
    const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
    const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        const onPointerDown = (e: PointerEvent) => {
            if (!(e.target instanceof Node)) return;
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointerdown', onPointerDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerdown', onPointerDown);
        };
    }, [open]);

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (open) {
                        setOpen(false);
                        return;
                    }

                    const triggerEl = triggerRef.current;
                    if (!triggerEl) {
                        setOpen(true);
                        return;
                    }

                    const boundaryEl = findOverflowBoundary(triggerEl);
                    const boundaryRect = boundaryEl.getBoundingClientRect();
                    const triggerRect = triggerEl.getBoundingClientRect();

                    flushSync(() => setOpen(true));

                    const menuEl = menuRef.current;
                    if (!menuEl) return;

                    const menuHeight = menuEl.scrollHeight;
                    const spaceBelow = boundaryRect.bottom - triggerRect.bottom;
                    const spaceAbove = triggerRect.top - boundaryRect.top;
                    const shouldFlip = spaceBelow < menuHeight + MENU_GAP_PX && spaceAbove > spaceBelow;
                    const nextPlacement: 'top' | 'bottom' = shouldFlip ? 'top' : 'bottom';
                    const availableSpace = (nextPlacement === 'top' ? spaceAbove : spaceBelow) - MENU_GAP_PX;
                    const nextMaxHeight = availableSpace > 0 ? Math.floor(availableSpace) : undefined;

                    setPlacement(nextPlacement);
                    setMaxHeight(nextMaxHeight);
                }}
                className={cn(
                    'p-2 rounded-xl transition-colors',
                    'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                )}
                aria-label="Task menu"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <MoreHorizontal size={18} />
            </button>

            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Task actions"
                    className={cn(
                        'absolute right-0 w-44 overflow-hidden overflow-y-auto rounded-2xl z-[70]',
                        placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
                        'bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl',
                        'shadow-2xl',
                        'border border-black/10 dark:border-white/10'
                    )}
                    style={maxHeight ? { maxHeight } : undefined}
                >
                    {entries.map((entry, index) => {
                        if (entry.kind === 'divider') {
                            return <div key={`divider-${index}`} className="my-1 h-px bg-black/10 dark:bg-white/10" />;
                        }
                        return (
                            <button
                                key={`action-${entry.label}-${index}`}
                                type="button"
                                role="menuitem"
                                disabled={entry.disabled}
                                onClick={() => {
                                    if (entry.disabled) return;
                                    setOpen(false);
                                    entry.onSelect();
                                }}
                                className={cn(
                                    'w-full px-4 py-2.5 flex items-center gap-2 text-left text-sm font-medium',
                                    'text-gray-800 dark:text-gray-100',
                                    'hover:bg-black/5 dark:hover:bg-white/10',
                                    'disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                )}
                            >
                                {entry.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function TaskRow({
    task,
    tone,
    meta,
    draggable,
    onDragStart,
    onClick,
    actions,
}: {
    task: Task;
    tone: 'blue' | 'amber' | 'gray' | 'purple';
    meta?: ReactNode;
    draggable: boolean;
    onDragStart?: (e: PointerEvent) => void;
    onClick: () => void;
    actions: ReactNode;
}) {
    const toneRing = (() => {
        switch (tone) {
            case 'blue':
                return 'focus-visible:ring-blue-500/60';
            case 'amber':
                return 'focus-visible:ring-amber-500/60';
            case 'purple':
                return 'focus-visible:ring-purple-500/60';
            default:
                return 'focus-visible:ring-blue-500/60';
        }
    })();

    return (
        <div
            className={cn(
                'flex items-center justify-between gap-3 px-3 py-2 rounded-2xl group',
                'bg-gray-50 dark:bg-gray-800',
                'border border-transparent hover:border-gray-200 dark:hover:border-gray-700'
            )}
        >
            <div className="min-w-0 flex-1 flex items-center gap-3">
                {draggable ? (
                    <button
                        type="button"
                        onPointerDown={(e) => onDragStart?.(e.nativeEvent)}
                        className={cn(
                            'shrink-0 p-1.5 rounded-xl',
                            'text-gray-400 hover:bg-black/5 dark:text-gray-500 dark:hover:bg-white/10',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                        )}
                        aria-label={`Reorder: ${task.title}`}
                    >
                        <GripVertical size={16} />
                    </button>
                ) : (
                    <div className="shrink-0 w-8" aria-hidden="true" />
                )}

                <button
                    type="button"
                    onClick={onClick}
                    className={cn(
                        'min-w-0 flex-1 text-left rounded-xl px-2 py-1',
                        'hover:bg-black/5 dark:hover:bg-white/10',
                        'focus:outline-none focus-visible:ring-2',
                        toneRing
                    )}
                    aria-label={`Edit: ${task.title}`}
                >
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{task.title}</div>
                    {meta && <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{meta}</div>}
                </button>
            </div>

            <div className="shrink-0 flex items-center gap-2">{actions}</div>
        </div>
    );
}

function ReorderableTaskRow({
    id,
    task,
    tone,
    onClick,
    actions,
}: {
    id: TaskId;
    task: Task;
    tone: 'amber' | 'gray';
    onClick: () => void;
    actions: ReactNode;
}) {
    const controls = useDragControls();

    return (
        <Reorder.Item value={id} dragListener={false} dragControls={controls}>
            <TaskRow
                task={task}
                tone={tone}
                draggable
                onDragStart={(e) => controls.start(e)}
                onClick={onClick}
                actions={actions}
            />
        </Reorder.Item>
    );
}

export function AllTasksPanel({ isOpen, onClose }: AllTasksPanelProps) {
    const reducedMotion = useReducedMotion();

    const currentTaskId = useStore((state) => state.currentTaskId);
    const wokenQueue = useStore((state) => state.wokenQueue);
    const readyQueue = useStore((state) => state.readyQueue);
    const snoozedIds = useStore((state) => state.snoozedIds);
    const completedIds = useStore((state) => state.completedIds);
    const tasks = useStore((state) => state.tasks);

    const completeTaskById = useStore((state) => state.completeTaskById);
    const focusTask = useStore((state) => state.focusTask);
    const focusTaskFromQueue = useStore((state) => state.focusTaskFromQueue);
    const moveCurrentToQueueHead = useStore((state) => state.moveCurrentToQueueHead);
    const moveTaskToWake = useStore((state) => state.moveTaskToWake);
    const moveTaskToQueue = useStore((state) => state.moveTaskToQueue);
    const moveTaskToQueueHead = useStore((state) => state.moveTaskToQueueHead);
    const reorderWokenQueue = useStore((state) => state.reorderWokenQueue);
    const reorderReadyQueue = useStore((state) => state.reorderReadyQueue);
    const swapCurrentWithWakeHead = useStore((state) => state.swapCurrentWithWakeHead);

    const [editorTaskId, setEditorTaskId] = useState<TaskId | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (!isOpen) return;
        const update = () => setNowMs(Date.now());
        const timeoutId = window.setTimeout(update, 0);
        const intervalId = window.setInterval(update, 1000);
        return () => {
            window.clearTimeout(timeoutId);
            window.clearInterval(intervalId);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    const completedSet = useMemo(() => new Set(completedIds), [completedIds]);

    const currentTask = useMemo(() => {
        if (!currentTaskId) return null;
        if (completedSet.has(currentTaskId)) return null;
        return tasks[currentTaskId] ?? null;
    }, [completedSet, currentTaskId, tasks]);

    const displayedWokenIds = useMemo(() => {
        const seen = new Set<TaskId>();
        const out: TaskId[] = [];
        wokenQueue.forEach((id) => {
            if (id === currentTaskId) return;
            if (completedSet.has(id)) return;
            const task = tasks[id];
            if (!task) return;
            if (seen.has(id)) return;
            seen.add(id);
            out.push(id);
        });
        return out;
    }, [completedSet, currentTaskId, tasks, wokenQueue]);

    const wokenSet = useMemo(() => new Set(displayedWokenIds), [displayedWokenIds]);

    const displayedReadyIds = useMemo(() => {
        const seen = new Set<TaskId>();
        const out: TaskId[] = [];
        readyQueue.forEach((id) => {
            if (id === currentTaskId) return;
            if (completedSet.has(id)) return;
            if (wokenSet.has(id)) return;
            const task = tasks[id];
            if (!task) return;
            if (seen.has(id)) return;
            seen.add(id);
            out.push(id);
        });
        return out;
    }, [completedSet, currentTaskId, readyQueue, tasks, wokenSet]);

    const snoozedTasks = useMemo(() => {
        const out: Task[] = [];
        snoozedIds.forEach((id) => {
            if (completedSet.has(id)) return;
            const task = tasks[id];
            if (!task || typeof task.snoozeUntil !== 'number') return;
            out.push(task);
        });
        out.sort((a, b) => (a.snoozeUntil ?? 0) - (b.snoozeUntil ?? 0) || (a.snoozeSeq ?? 0) - (b.snoozeSeq ?? 0));
        return out;
    }, [completedSet, snoozedIds, tasks]);

    const hasAny =
        !!currentTask ||
        displayedWokenIds.length > 0 ||
        displayedReadyIds.length > 0 ||
        snoozedTasks.length > 0;

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            key="backdrop"
                            className="fixed inset-0 z-50 bg-black/30 dark:bg-black/60 backdrop-blur-sm"
                            initial={reducedMotion ? undefined : { opacity: 0 }}
                            animate={reducedMotion ? undefined : { opacity: 1 }}
                            exit={reducedMotion ? undefined : { opacity: 0 }}
                            onClick={onClose}
                        />

                        <motion.div
                            key="panel"
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                            initial={reducedMotion ? undefined : { y: 24, opacity: 0 }}
                            animate={reducedMotion ? undefined : { y: 0, opacity: 1 }}
                            exit={reducedMotion ? undefined : { y: 24, opacity: 0 }}
                            transition={reducedMotion ? undefined : { duration: 0.18, ease: 'easeOut' }}
                        >
                            <div
                                role="dialog"
                                aria-modal="true"
                                aria-label="All tasks"
                                className={cn(
                                    'pointer-events-auto w-full max-w-lg',
                                    'mx-auto w-full rounded-t-3xl sm:rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-black/5 dark:border-white/10',
                                    'max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-hidden flex flex-col'
                                )}
                            >
                                <div className="px-6 pt-5 pb-4 flex items-center justify-between bg-white dark:bg-gray-900">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">All tasks</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">Reorder and manage everything in one place.</p>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        aria-label="Close"
                                    >
                                        <X size={18} className="text-gray-500 dark:text-gray-400" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-6 pb-6">
                                    {!hasAny ? (
                                        <div className="py-10 text-center text-sm text-gray-400">No tasks yet.</div>
                                    ) : (
                                        <>
                                            {currentTask && (
                                                <>
                                                    <SectionHeader label="Focus" tone="blue" />
                                                    <div className="mt-2">
                                                        <TaskRow
                                                            task={currentTask}
                                                            tone="blue"
                                                            draggable={false}
                                                            onClick={() => setEditorTaskId(currentTask.id)}
                                                            actions={
                                                                <TaskRowMenu
                                                                    entries={[
                                                                        {
                                                                            kind: 'action',
                                                                            label: 'Move to Wake',
                                                                            onSelect: () => swapCurrentWithWakeHead(),
                                                                        },
                                                                        {
                                                                            kind: 'action',
                                                                            label: 'Move to Queue',
                                                                            onSelect: () => moveCurrentToQueueHead(),
                                                                        },
                                                                        { kind: 'divider' },
                                                                        {
                                                                            kind: 'action',
                                                                            label: 'Complete',
                                                                            onSelect: () => completeTaskById(currentTask.id),
                                                                        },
                                                                    ]}
                                                                />
                                                            }
                                                        />
                                                    </div>
                                                </>
                                            )}

                                            <SectionHeader label="Wake" count={displayedWokenIds.length} tone="amber" />
                                            <div className="mt-2">
                                                {displayedWokenIds.length === 0 ? (
                                                    <div className="text-sm text-gray-400 py-3">No wake tasks.</div>
                                                ) : (
                                                    <Reorder.Group
                                                        axis="y"
                                                        values={displayedWokenIds}
                                                        onReorder={(next) => reorderWokenQueue(next)}
                                                        className="space-y-2"
                                                    >
                                                        {displayedWokenIds.map((id) => {
                                                            const task = tasks[id];
                                                            if (!task) return null;
                                                            return (
                                                                <ReorderableTaskRow
                                                                    key={id}
                                                                    id={id}
                                                                    task={task}
                                                                    tone="amber"
                                                                    onClick={() => setEditorTaskId(id)}
                                                                    actions={
                                                                        <TaskRowMenu
                                                                            entries={[
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Focus',
                                                                                    onSelect: () => focusTask(id),
                                                                                },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Queue',
                                                                                    onSelect: () => moveTaskToQueueHead(id),
                                                                                },
                                                                                { kind: 'divider' },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Complete',
                                                                                    onSelect: () => completeTaskById(id),
                                                                                },
                                                                            ]}
                                                                        />
                                                                    }
                                                                />
                                                            );
                                                        })}
                                                    </Reorder.Group>
                                                )}
                                            </div>

                                            <SectionHeader label="Queue" count={displayedReadyIds.length} tone="gray" />
                                            <div className="mt-2">
                                                {displayedReadyIds.length === 0 ? (
                                                    <div className="text-sm text-gray-400 py-3">No queued tasks.</div>
                                                ) : (
                                                    <Reorder.Group
                                                        axis="y"
                                                        values={displayedReadyIds}
                                                        onReorder={(next) => reorderReadyQueue(next)}
                                                        className="space-y-2"
                                                    >
                                                        {displayedReadyIds.map((id) => {
                                                            const task = tasks[id];
                                                            if (!task) return null;
                                                            return (
                                                                <ReorderableTaskRow
                                                                    key={id}
                                                                    id={id}
                                                                    task={task}
                                                                    tone="gray"
                                                                    onClick={() => setEditorTaskId(id)}
                                                                    actions={
                                                                        <TaskRowMenu
                                                                            entries={[
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Focus',
                                                                                    onSelect: () => focusTaskFromQueue(id),
                                                                                },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Wake',
                                                                                    onSelect: () => moveTaskToWake(id),
                                                                                },
                                                                                { kind: 'divider' },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Complete',
                                                                                    onSelect: () => completeTaskById(id),
                                                                                },
                                                                            ]}
                                                                        />
                                                                    }
                                                                />
                                                            );
                                                        })}
                                                    </Reorder.Group>
                                                )}
                                            </div>

                                            <SectionHeader label="Sleep" count={snoozedTasks.length} tone="purple" />
                                            <div className="mt-2">
                                                {snoozedTasks.length === 0 ? (
                                                    <div className="text-sm text-gray-400 py-3">No sleeping tasks.</div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {snoozedTasks.map((task) => {
                                                            const untilMs = task.snoozeUntil ?? nowMs;
                                                            const remaining = formatRemaining(nowMs, untilMs);
                                                            const atTime = new Date(untilMs).toLocaleTimeString([], {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            });
                                                            return (
                                                                <TaskRow
                                                                    key={task.id}
                                                                    task={task}
                                                                    tone="purple"
                                                                    draggable={false}
                                                                    meta={
                                                                        <span className="inline-flex items-center gap-1">
                                                                            <Clock size={12} className="opacity-70" />
                                                                            <span className="font-mono tabular-nums">{remaining}</span>
                                                                            <span className="opacity-70">·</span> {atTime}
                                                                        </span>
                                                                    }
                                                                    onClick={() => setEditorTaskId(task.id)}
                                                                    actions={
                                                                        <TaskRowMenu
                                                                            entries={[
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Focus',
                                                                                    onSelect: () => focusTask(task.id),
                                                                                },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Wake',
                                                                                    onSelect: () => moveTaskToWake(task.id),
                                                                                },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Move to Queue',
                                                                                    onSelect: () => moveTaskToQueue(task.id),
                                                                                },
                                                                                { kind: 'divider' },
                                                                                {
                                                                                    kind: 'action',
                                                                                    label: 'Complete',
                                                                                    onSelect: () => completeTaskById(task.id),
                                                                                },
                                                                            ]}
                                                                        />
                                                                    }
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <TaskEditorModal
                taskId={editorTaskId}
                isOpen={editorTaskId !== null}
                onClose={() => setEditorTaskId(null)}
            />
        </>
    );
}
