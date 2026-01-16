import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

export function TaskInput() {
    const [title, setTitle] = useState('');
    const addTask = useStore((state) => state.addTask);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (title.trim()) {
                addTask(title);
                setTitle('');
            }
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto mb-8">
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a new task..."
                className={cn(
                    "w-full px-4 py-3 text-lg bg-white/50 dark:bg-gray-800/50 rounded-lg",
                    "border-2 border-transparent focus:border-blue-500",
                    "focus:outline-none focus:bg-white dark:focus:bg-gray-800 transition-all",
                    "placeholder-gray-400 dark:placeholder-gray-500",
                    "shadow-sm"
                )}
            />
        </div>
    );
}
