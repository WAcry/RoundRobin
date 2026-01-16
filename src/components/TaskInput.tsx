import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

function isEditableElement(element: Element | null): boolean {
    if (!(element instanceof HTMLElement)) return false;
    if (element instanceof HTMLInputElement) return true;
    if (element instanceof HTMLTextAreaElement) return true;
    if (element instanceof HTMLSelectElement) return true;
    return element.isContentEditable;
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T) {
    if (!ref) return;
    if (typeof ref === 'function') {
        ref(value);
        return;
    }
    if (typeof ref === 'object' && 'current' in ref) {
        (ref as React.MutableRefObject<T>).current = value;
    }
}

export const TaskInput = React.forwardRef<HTMLInputElement>(function TaskInput(_, forwardedRef) {
    const [title, setTitle] = useState('');
    const addTask = useStore((state) => state.addTask);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const shouldAutoFocus = useStore((state) => {
        const currentId = state.currentTaskId;
        const hasActive = !!currentId && !!state.tasks[currentId];
        return !hasActive && state.wokenQueue.length === 0 && state.readyQueue.length === 0 && state.snoozedIds.length === 0;
    });

    useEffect(() => {
        if (!shouldAutoFocus) return;
        const input = inputRef.current;
        if (!input) return;
        if (document.activeElement === input) return;
        if (isEditableElement(document.activeElement)) return;
        input.focus({ preventScroll: true });
    }, [shouldAutoFocus]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if ((e.key === ' ' || e.code === 'Space') && title.trim().length === 0) {
            e.preventDefault();
            inputRef.current?.blur();
            return;
        }
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
                ref={(value) => {
                    inputRef.current = value;
                    setRef(forwardedRef, value);
                }}
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
});

TaskInput.displayName = 'TaskInput';
