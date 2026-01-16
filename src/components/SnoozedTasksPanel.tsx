import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import type { Task, TaskId } from '../types';

interface SnoozedTasksPanelProps {
    isOpen: boolean;
    onClose: () => void;
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

export function SnoozedTasksPanel({ isOpen, onClose }: SnoozedTasksPanelProps) {
    const reducedMotion = useReducedMotion();

    const snoozedIds = useStore((state) => state.snoozedIds);
    const tasks = useStore((state) => state.tasks);
    const resumeSnoozedTask = useStore((state) => state.resumeSnoozedTask);
    const pushToast = useToastStore((state) => state.pushToast);

    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (!isOpen) return;
        const id = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    const snoozedTasks = useMemo(() => {
        const out: Task[] = [];
        snoozedIds.forEach((id) => {
            const task = tasks[id];
            if (!task || typeof task.snoozeUntil !== 'number') return;
            out.push(task);
        });
        out.sort((a, b) => (a.snoozeUntil ?? 0) - (b.snoozeUntil ?? 0) || (a.snoozeSeq ?? 0) - (b.snoozeSeq ?? 0));
        return out;
    }, [snoozedIds, tasks]);

    const handleResume = (id: TaskId, title: string) => {
        resumeSnoozedTask(id);
        pushToast({
            kind: 'info',
            message: `Resumed: ${title}.`,
            actions: [
                {
                    label: 'Undo',
                    variant: 'primary',
                    onClick: () => useStore.temporal.getState().undo(),
                },
            ],
        });
    };

    return (
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
                            aria-label="Deferred tasks"
                            className={cn(
                                "pointer-events-auto w-full max-w-lg",
                                "mx-auto w-full rounded-t-3xl sm:rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-black/5 dark:border-white/10",
                                "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-x-hidden overflow-y-auto overscroll-contain no-scrollbar"
                            )}
                        >
                            <div className="sticky top-0 z-10 px-6 pt-5 pb-4 flex items-center justify-between bg-white dark:bg-gray-900">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                        Deferred
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-0.5">Resume adds a task to the end of the queue.</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    aria-label="Close"
                                >
                                    <X size={18} className="text-gray-500 dark:text-gray-400" />
                                </button>
                            </div>

                            <div className="px-6 pb-6">
                                {snoozedTasks.length === 0 ? (
                                    <div className="py-10 text-center text-sm text-gray-400">
                                        No deferred tasks.
                                    </div>
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
                                                <div
                                                    key={task.id}
                                                    className={cn(
                                                        "flex items-center justify-between gap-3 px-3 py-2 rounded-2xl",
                                                        "bg-gray-50 dark:bg-gray-800",
                                                        "border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                                                    )}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                                            {task.title}
                                                        </div>
                                                        <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                                            Resumes in <span className="font-mono tabular-nums">{remaining}</span> · {atTime}
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => handleResume(task.id, task.title)}
                                                        className={cn(
                                                            "shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors",
                                                            "text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
                                                        )}
                                                        aria-label={`Resume ${task.title}`}
                                                    >
                                                        Resume
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
