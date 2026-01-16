import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { TaskId } from '../types';
import { Plus, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface SubtaskListProps {
    taskId: TaskId;
}

export function SubtaskList({ taskId }: SubtaskListProps) {
    const task = useStore((state) => state.tasks[taskId]);
    const addSubtask = useStore((state) => state.addSubtask);
    const toggleSubtask = useStore((state) => state.toggleSubtask);
    const toggleShowCompletedSubtasks = useStore((state) => state.toggleShowCompletedSubtasks);

    const [newSubtask, setNewSubtask] = useState('');

    if (!task) return null;

    const showCompleted = task.ui.showCompletedSubtasks ?? false;
    const activeSubtasks = task.subtasks.filter((st) => !st.done);
    const completedSubtasks = task.subtasks.filter((st) => st.done);

    const handleAdd = () => {
        if (newSubtask.trim()) {
            addSubtask(taskId, newSubtask);
            setNewSubtask('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAdd();
    };

    return (
        <div className="w-full mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="space-y-2">
                {activeSubtasks.map((st) => (
                    <div key={st.id} className="flex items-center group">
                        <button
                            onClick={() => toggleSubtask(taskId, st.id)}
                            className={cn(
                                "flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                st.done
                                    ? "bg-blue-500 border-blue-500 text-white"
                                    : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                            )}
                            aria-label={`${st.done ? 'Mark incomplete' : 'Mark complete'}: ${st.text}`}
                        >
                            {st.done && <Check size={12} strokeWidth={3} />}
                        </button>
                        <span
                            className={cn(
                                "ml-3 text-sm flex-1 break-words transition-all",
                                st.done ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-200"
                            )}
                        >
                            {st.text}
                        </span>
                    </div>
                ))}

                {completedSubtasks.length > 0 && (
                    <button
                        type="button"
                        onClick={() => toggleShowCompletedSubtasks(taskId)}
                        className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        aria-label={showCompleted ? 'Hide completed subtasks' : 'Show completed subtasks'}
                    >
                        {showCompleted ? 'Hide' : 'Show'} completed ({completedSubtasks.length})
                    </button>
                )}

                {showCompleted &&
                    completedSubtasks.map((st) => (
                        <div key={st.id} className="flex items-center group opacity-80">
                            <button
                                onClick={() => toggleSubtask(taskId, st.id)}
                                className={cn(
                                    "flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                    st.done
                                        ? "bg-blue-500 border-blue-500 text-white"
                                        : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                                )}
                                aria-label={`${st.done ? 'Mark incomplete' : 'Mark complete'}: ${st.text}`}
                            >
                                {st.done && <Check size={12} strokeWidth={3} />}
                            </button>
                            <span
                                className={cn(
                                    "ml-3 text-sm flex-1 break-words transition-all",
                                    st.done ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-200"
                                )}
                            >
                                {st.text}
                            </span>
                        </div>
                    ))}
            </div>

            <div className="mt-3 flex items-center">
                <Plus size={16} className="text-gray-400 mr-2" />
                <input
                    type="text"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add subtask..."
                    className="flex-1 bg-transparent text-sm border-none focus:ring-0 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                />
            </div>
        </div>
    );
}
