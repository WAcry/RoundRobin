import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '../lib/utils';

const HELP_TIPS = [
  {
    title: 'Undo/redo',
    detail: 'Press Ctrl+Z (or Cmd+Z) to undo.',
  },
  {
    title: 'Focus input',
    detail: "Press Space to focus the new task input.",
  },
  {
    title: 'Quick defer',
    detail: 'Long-press Defer to pick a time window.',
  },
  {
    title: 'Quick delete',
    detail: 'Long-press Done to delete the active task.',
  },
  {
    title: 'Edit fast',
    detail: 'Click the task title to edit it in place.',
  },
];

export function HelpFab() {
  const [open, setOpen] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pressTimerRef = useRef<number | null>(null);

  const panelId = useMemo(() => `help-panel-${crypto.randomUUID()}`, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    };
  }, []);

  const startPress = () => {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      setIsLongPress(true);
      setOpen(true);
    }, 450);
  };

  const endPress = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleClick = () => {
    if (isLongPress) {
      setIsLongPress(false);
      return;
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="fixed right-6 bottom-24 sm:bottom-6 z-50">
      <div
        ref={panelRef}
        className={cn(
          'absolute bottom-full right-0 mb-3 w-72 rounded-2xl border shadow-xl',
          'bg-white/95 dark:bg-gray-900/95 backdrop-blur',
          'border-black/10 dark:border-white/10',
          'transition-all duration-200',
          open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
        )}
        role="dialog"
        aria-hidden={!open}
        id={panelId}
      >
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Shortcuts</h3>
        </div>
        <div className="px-4 pb-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
          {HELP_TIPS.map((tip) => (
            <div key={tip.title} className="space-y-1">
              <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">{tip.title}</p>
              <p className="text-[12px] leading-relaxed">{tip.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={endPress}
        aria-label="Open help tips"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'h-12 w-12 rounded-full shadow-lg border',
          'bg-white/90 dark:bg-gray-900/90 backdrop-blur',
          'border-black/10 dark:border-white/10',
          'text-gray-700 dark:text-gray-200',
          'transition-all duration-200 hover:scale-105'
        )}
      >
        <CircleHelp className="mx-auto" size={20} strokeWidth={2.2} />
      </button>
    </div>
  );
}
