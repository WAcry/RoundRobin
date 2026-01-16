import { useStore } from '../store/useStore';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useEffect, useMemo } from 'react';

interface HistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function HistoryDrawer({ isOpen, onClose }: HistoryDrawerProps) {
    const reducedMotion = useReducedMotion();
    const completedIds = useStore((state) => state.completedIds);
    const tasks = useStore((state) => state.tasks);
    const restoreTask = useStore((state) => state.restoreTask);
    const clearHistory = useStore((state) => state.clearHistory);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    const completedTasks = useMemo(() => completedIds.map((id) => tasks[id]).filter(Boolean), [completedIds, tasks]);

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
                            aria-label="History"
                            className={cn(
                                'pointer-events-auto w-full max-w-lg',
                                'mx-auto w-full rounded-t-3xl sm:rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-black/5 dark:border-white/10',
                                'max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-hidden flex flex-col'
                            )}
                        >
                            <div className="px-6 pt-5 pb-4 flex items-center justify-between bg-white dark:bg-gray-900">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">History</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">Restore adds a task to the end of the queue.</p>
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
                                {completedTasks.length === 0 ? (
                                    <div className="py-10 text-center text-sm text-gray-400">No completed tasks yet.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {completedTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    'flex items-center justify-between gap-3 px-3 py-2 rounded-2xl group',
                                                    'bg-gray-50 dark:bg-gray-800',
                                                    'border border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                                                )}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate line-through opacity-70">
                                                        {task.title}
                                                    </div>
                                                    <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                                        Done at{' '}
                                                        {new Date(task.doneAt ?? task.updatedAt).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => restoreTask(task.id)}
                                                    className={cn(
                                                        'shrink-0 p-2 rounded-xl transition-colors',
                                                        'text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30',
                                                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'
                                                    )}
                                                    title="Restore"
                                                    aria-label={`Restore task: ${task.title}`}
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {completedTasks.length > 0 && (
                                <div className="px-6 pb-6 pt-4 border-t border-black/5 dark:border-white/10 bg-white dark:bg-gray-900">
                                    <button
                                        onClick={() => {
                                            if (confirm('Clear all history?')) clearHistory();
                                        }}
                                        className={cn(
                                            'w-full py-3 flex items-center justify-center gap-2 rounded-2xl transition-colors font-semibold',
                                            'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20'
                                        )}
                                    >
                                        <Trash2 size={18} />
                                        Clear History
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
