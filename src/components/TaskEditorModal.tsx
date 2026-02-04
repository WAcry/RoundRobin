import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import type { TaskId } from '../types';
import { Attachments } from './Attachments';
import { Notes } from './Notes';
import { SubtaskList } from './SubtaskList';

interface TaskEditorModalProps {
    taskId: TaskId | null;
    isOpen: boolean;
    onClose: () => void;
}

export function TaskEditorModal({ taskId, isOpen, onClose }: TaskEditorModalProps) {
    const reducedMotion = useReducedMotion();
    const task = useStore((state) => (taskId ? state.tasks[taskId] : undefined));
    const updateTaskTitle = useStore((state) => state.updateTaskTitle);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    const handleSaveTitle = (raw: string) => {
        if (!taskId) return;
        const next = raw.trim();
        if (!next) return;
        if (!task) return;
        if (next === task.title) return;
        updateTaskTitle(taskId, next);
    };

    return (
        <AnimatePresence>
            {isOpen && taskId && task && (
                <>
                    <motion.div
                        key="backdrop"
                        className="fixed inset-0 z-[60] bg-black/30 dark:bg-black/60 backdrop-blur-sm"
                        initial={reducedMotion ? undefined : { opacity: 0 }}
                        animate={reducedMotion ? undefined : { opacity: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0 }}
                        onClick={onClose}
                    />

                    <motion.div
                        key="panel"
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
                        initial={reducedMotion ? undefined : { y: 24, opacity: 0 }}
                        animate={reducedMotion ? undefined : { y: 0, opacity: 1 }}
                        exit={reducedMotion ? undefined : { y: 24, opacity: 0 }}
                        transition={reducedMotion ? undefined : { duration: 0.18, ease: 'easeOut' }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Edit task"
                            className={cn(
                                'pointer-events-auto w-full max-w-lg',
                                'mx-auto w-full rounded-t-3xl sm:rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-black/5 dark:border-white/10',
                                'max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-hidden flex flex-col'
                            )}
                        >
                            <div className="px-6 pt-5 pb-4 flex items-center justify-between bg-white dark:bg-gray-900">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">Edit</h3>
                                    <p className="text-xs text-gray-400 mt-0.5 truncate">Update title, subtasks, notes, and attachments.</p>
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
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</span>
                                    <input
                                        autoFocus
                                        key={task.id}
                                        defaultValue={task.title}
                                        onBlur={(e) => handleSaveTitle(e.currentTarget.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSaveTitle(e.currentTarget.value);
                                                (e.target as HTMLInputElement).blur();
                                            }
                                            if (e.key === 'Escape') onClose();
                                        }}
                                        className={cn(
                                            'mt-2 w-full rounded-2xl px-4 py-3 text-base font-semibold',
                                            'bg-gray-50 dark:bg-gray-800',
                                            'border border-black/5 dark:border-white/10',
                                            'text-gray-900 dark:text-gray-100',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60'
                                        )}
                                        placeholder="Task title"
                                        aria-label="Task title"
                                    />
                                </label>

                                <div className="mt-4">
                                    <SubtaskList taskId={taskId} />
                                </div>

                                <div className="mt-4">
                                    <Notes taskId={taskId} />
                                </div>

                                <div className="mt-4">
                                    <Attachments taskId={taskId} />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
