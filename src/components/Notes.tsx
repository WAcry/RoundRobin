import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { TaskId } from '../types';
import ReactMarkdown from 'react-markdown';
import { Eye, Edit2 } from 'lucide-react';

interface NotesProps {
    taskId: TaskId;
}

export function Notes({ taskId }: NotesProps) {
    const task = useStore((state) => state.tasks[taskId]);
    const updateNotes = useStore((state) => state.updateNotes);

    const initialContent = task?.notesMd ?? '';
    const [isEditing, setIsEditing] = useState(() => initialContent.trim().length === 0);
    const [content, setContent] = useState(() => initialContent);

    const handleBlur = () => {
        if (!task) return;
        if (content !== task.notesMd) {
            updateNotes(taskId, content);
        }
    };

    if (!task) return null;

    return (
        <div className="w-full mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notes</span>
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                    title={isEditing ? "Preview" : "Edit"}
                    aria-label={isEditing ? "Preview notes" : "Edit notes"}
                >
                    {isEditing ? <Eye size={14} /> : <Edit2 size={14} />}
                </button>
            </div>

            {isEditing ? (
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Type details in Markdown..."
                    className="w-full min-h-[150px] bg-transparent resize-y border-none focus:ring-0 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
                />
            ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none min-h-[50px]">
                    {content ? <ReactMarkdown>{content}</ReactMarkdown> : <span className="text-gray-400 italic">No notes.</span>}
                </div>
            )}
        </div>
    );
}
