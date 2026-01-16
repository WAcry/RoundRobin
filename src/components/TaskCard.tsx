import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock, FileText, ListTodo } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { SubtaskList } from './SubtaskList';
import { Notes } from './Notes';
import { SnoozePanel } from './SnoozePanel';
import type { Task, TaskId } from '../types';
import { useToastStore } from '../store/useToastStore';

export function TaskCard({ onOpenDeferredTasks }: { onOpenDeferredTasks?: () => void }) {
    const currentTaskId = useStore((state) => state.currentTaskId);
    const tasks = useStore((state) => state.tasks);
    const wokenQueue = useStore((state) => state.wokenQueue);
    const readyQueue = useStore((state) => state.readyQueue);
    const snoozedIds = useStore((state) => state.snoozedIds);

    const task = currentTaskId ? tasks[currentTaskId] : null;

    if (!task) {
        return (
            <EmptyTaskCard
                tasks={tasks}
                wokenQueue={wokenQueue}
                readyQueue={readyQueue}
                snoozedIds={snoozedIds}
                onOpenDeferredTasks={onOpenDeferredTasks}
            />
        );
    }

    return <ActiveTaskCard key={task.id} taskId={task.id} />;
}

function EmptyTaskCard({
    tasks,
    wokenQueue,
    readyQueue,
    snoozedIds,
    onOpenDeferredTasks,
}: {
    tasks: Record<TaskId, Task>;
    wokenQueue: TaskId[];
    readyQueue: TaskId[];
    snoozedIds: TaskId[];
    onOpenDeferredTasks?: () => void;
}) {
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (snoozedIds.length === 0) return;
        const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, [snoozedIds.length]);

    const nextWakeAtMs = snoozedIds.reduce<number | null>((min, id) => {
        const until = tasks[id]?.snoozeUntil;
        if (typeof until !== 'number') return min;
        if (min === null) return until;
        return Math.min(min, until);
    }, null);

    const remainingSeconds = nextWakeAtMs ? Math.max(0, Math.ceil((nextWakeAtMs - nowMs) / 1000)) : 0;
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    const queuedCount = wokenQueue.length + readyQueue.length;

    return (
        <>
            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500 dark:text-gray-400 h-[400px]">
                {nextWakeAtMs ? (
                    <>
                        <p className="text-xl font-medium">No active task</p>
                        <button
                            type="button"
                            onClick={onOpenDeferredTasks}
                            disabled={!onOpenDeferredTasks}
                            className="mt-2 text-sm opacity-70 hover:opacity-100 transition-opacity underline underline-offset-4 decoration-dotted"
                            aria-label="View deferred tasks"
                        >
                            Next task resumes in <span className="font-mono tabular-nums">{mm}:{ss}</span>
                        </button>
                        {queuedCount > 0 && <p className="mt-3 text-xs opacity-60">Queue: {queuedCount}</p>}
                        <p className="mt-4 text-xs opacity-60">Add a new task above to preempt.</p>
                    </>
                ) : queuedCount > 0 ? (
                    <>
                        <p className="text-xl font-medium">No active task</p>
                        <p className="mt-2 text-sm opacity-70">Queue: {queuedCount}</p>
                        <p className="mt-4 text-xs opacity-60">Add a new task above to preempt.</p>
                    </>
                ) : (
                    <>
                        <p className="text-xl font-medium">All tasks cleared!</p>
                        <p className="mt-2 text-sm opacity-70">Add a task above to get started.</p>
                    </>
                )}
            </div>
        </>
    );
}

function ActiveTaskCard({ taskId }: { taskId: TaskId }) {
    const task = useStore((state) => state.tasks[taskId]);
    const wokenQueue = useStore((state) => state.wokenQueue);
    const readyQueue = useStore((state) => state.readyQueue);
    const updateTaskTitle = useStore((state) => state.updateTaskTitle);
    const completeTask = useStore((state) => state.completeTask);
    const snoozeTask = useStore((state) => state.snoozeTask);
    const deleteTask = useStore((state) => state.deleteTask);
    const toggleSubtasks = useStore((state) => state.toggleSubtasks);
    const toggleNotes = useStore((state) => state.toggleNotes);
    const pushToast = useToastStore((state) => state.pushToast);

    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(() => task?.title ?? '');
    const [deleteArmed, setDeleteArmed] = useState(false);
    const [snoozePanelOpen, setSnoozePanelOpen] = useState(false);

    const deleteTimerRef = useRef<number | null>(null);
    const suppressCompleteClickRef = useRef(false);

    const snoozeTimerRef = useRef<number | null>(null);
    const suppressSnoozeClickRef = useRef(false);

    useEffect(() => {
        return () => {
            if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
            if (snoozeTimerRef.current) window.clearTimeout(snoozeTimerRef.current);
        };
    }, []);

    if (!task) return null;

    const handleSave = () => {
        if (editTitle.trim()) {
            updateTaskTitle(task.id, editTitle);
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setIsEditing(false);
            setEditTitle(task.title);
        }
    };

    const startDeletePress = () => {
        if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = window.setTimeout(() => {
            setDeleteArmed(true);
        }, 1000);
    };

    const clearDeletePress = () => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
        }
        setDeleteArmed(false);
    };

    const showUndoToast = (message: string, kind: 'info' | 'success' | 'error' = 'info') => {
        pushToast({
            kind,
            message,
            actions: [
                {
                    label: 'Undo',
                    variant: 'primary',
                    onClick: () => useStore.temporal.getState().undo(),
                },
            ],
        });
    };

    const handleCompleteClick = () => {
        if (suppressCompleteClickRef.current) {
            suppressCompleteClickRef.current = false;
            return;
        }
        completeTask();
        showUndoToast('Completed.', 'success');
    };

    const handleCompletePointerUp = () => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
        }

        if (deleteArmed) {
            suppressCompleteClickRef.current = true;
            setDeleteArmed(false);
            deleteTask();
            showUndoToast('Deleted.', 'error');
        }
    };

    const startSnoozePress = () => {
        if (snoozeTimerRef.current) window.clearTimeout(snoozeTimerRef.current);
        snoozeTimerRef.current = window.setTimeout(() => {
            suppressSnoozeClickRef.current = true;
            setSnoozePanelOpen(true);
        }, 450);
    };

    const clearSnoozePress = () => {
        if (snoozeTimerRef.current) {
            window.clearTimeout(snoozeTimerRef.current);
            snoozeTimerRef.current = null;
        }
    };

    const handleSnoozeClick = () => {
        if (suppressSnoozeClickRef.current) {
            suppressSnoozeClickRef.current = false;
            return;
        }
        const autoOneMinute = readyQueue.length === 0 && wokenQueue.length === 0;
        snoozeTask();
        showUndoToast(autoOneMinute ? 'Deferred for 1 minute.' : 'Deferred.', 'info');
    };

    const handleSnoozePanelClose = () => {
        setSnoozePanelOpen(false);
        suppressSnoozeClickRef.current = false;
    };

    return (
        <div className="w-full max-w-xl mx-auto perspective-1000">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 min-h-[400px] flex flex-col justify-between relative overflow-hidden transition-all duration-300">

                {/* Main Content */}
                <div className="flex-1 flex flex-col items-center z-10 w-full">
                    <div className="w-full text-center py-4">
                        {isEditing ? (
                            <input
                                autoFocus
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={handleSave}
                                onKeyDown={handleKeyDown}
                                className="w-full text-4xl font-bold text-center bg-transparent border-b-2 border-blue-500 focus:outline-none dark:text-white"
                            />
                        ) : (
                            <h2
                                onClick={() => {
                                    setEditTitle(task.title);
                                    setIsEditing(true);
                                }}
                                className="text-4xl font-bold cursor-pointer hover:opacity-80 break-words w-full dark:text-white min-h-[3rem]"
                            >
                                {task.title}
                            </h2>
                        )}
                    </div>

                    {/* Toggle Buttons */}
	                    <div className="flex justify-center gap-6 py-2">
	                        <button
	                            onClick={() => toggleSubtasks(task.id)}
	                            className={cn(
	                                "p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium",
	                                task.ui.subtasksOpen
	                                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
	                                    : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
	                            )}
	                            title="Subtasks"
	                            aria-label={task.ui.subtasksOpen ? "Hide subtasks" : "Show subtasks"}
	                            aria-pressed={task.ui.subtasksOpen}
	                        >
	                            <ListTodo size={20} />
	                            {task.subtasks.length > 0 && <span>{task.subtasks.filter(t => !t.done).length}</span>}
	                        </button>
	                        <button
	                            onClick={() => toggleNotes(task.id)}
	                            className={cn(
	                                "p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium",
	                                task.ui.notesOpen
	                                    ? "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400"
	                                    : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
	                            )}
	                            title="Notes"
	                            aria-label={task.ui.notesOpen ? "Hide notes" : "Show notes"}
	                            aria-pressed={task.ui.notesOpen}
	                        >
	                            <FileText size={20} />
	                        </button>
	                    </div>



                    {/* Expandable Areas */}
                    <div className="w-full space-y-4">
                        {task.ui.subtasksOpen && <SubtaskList taskId={task.id} />}
                        {task.ui.notesOpen && <Notes key={`${task.id}:${task.notesMd}`} taskId={task.id} />}
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-8 hidden sm:flex items-center justify-center space-x-12 z-10">
                    <button
                        onClick={handleCompleteClick}
                        onPointerDown={startDeletePress}
                        onPointerUp={handleCompletePointerUp}
                        onPointerCancel={clearDeletePress}
                        onPointerLeave={clearDeletePress}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (confirm("Delete this task?")) {
                                deleteTask();
                                showUndoToast('Deleted.', 'error');
                            }
                        }}
                        className="group flex flex-col items-center"
                        aria-label="Complete task"
                    >
                        <div
                            className={cn(
                                "p-5 rounded-full transition-all duration-200 shadow-md",
                                deleteArmed
                                    ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 scale-110"
                                    : "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400 group-hover:scale-110 group-hover:bg-green-200 dark:group-hover:bg-green-900/60"
                            )}
                        >
                            <Check size={36} strokeWidth={3} />
                        </div>
                        <span className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            {deleteArmed ? "Release to delete" : "Done"}
                        </span>
                    </button>

                    <button
                        onClick={handleSnoozeClick}
                        onPointerDown={startSnoozePress}
                        onPointerUp={clearSnoozePress}
                        onPointerCancel={clearSnoozePress}
                        onPointerLeave={clearSnoozePress}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            suppressSnoozeClickRef.current = true;
                            setSnoozePanelOpen(true);
                        }}
                        className="group flex flex-col items-center"
                        aria-label="Defer task"
                    >
                        <div className="p-5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 group-hover:scale-110 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/60 transition-all duration-200 shadow-md">
                            <Clock size={36} strokeWidth={3} />
                        </div>
                        <span className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">Defer</span>
                    </button>
                </div>
            </div>

            {/* Mobile action bar */}
            <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden px-4 pb-4">
                <div
                    className={cn(
                        "mx-auto w-full max-w-xl rounded-2xl border shadow-xl",
                        "bg-white/90 dark:bg-gray-900/90 backdrop-blur",
                        "border-black/10 dark:border-white/10"
                    )}
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
                >
                    <div className="flex items-center justify-around px-4 pt-3">
                        <button
                            onClick={handleCompleteClick}
                            onPointerDown={startDeletePress}
                            onPointerUp={handleCompletePointerUp}
                            onPointerCancel={clearDeletePress}
                            onPointerLeave={clearDeletePress}
                            className="flex flex-col items-center gap-1 w-1/2"
                            aria-label="Complete task"
                        >
                            <div
                                className={cn(
                                    "w-full py-3 rounded-xl transition-colors font-semibold",
                                    deleteArmed
                                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                        : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                )}
                            >
                                {deleteArmed ? "Release to delete" : "Done"}
                            </div>
                        </button>

                        <button
                            onClick={handleSnoozeClick}
                            onPointerDown={startSnoozePress}
                            onPointerUp={clearSnoozePress}
                            onPointerCancel={clearSnoozePress}
                            onPointerLeave={clearSnoozePress}
                            className="flex flex-col items-center gap-1 w-1/2"
                            aria-label="Defer task"
                        >
                            <div className="w-full py-3 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 transition-colors font-semibold">
                                Defer
                            </div>
                        </button>
                    </div>

                    <div className="px-4 pt-2 text-[11px] text-center text-gray-400">
                        Long-press Defer for more options. Long-press Done to delete.
                    </div>
                </div>
            </div>

            <SnoozePanel isOpen={snoozePanelOpen} onClose={handleSnoozePanelClose} />
        </div>
    );
}
