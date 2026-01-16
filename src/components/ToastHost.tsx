import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { cn } from '../lib/utils';
import { useToastStore } from '../store/useToastStore';

const DEFAULT_DURATION_MS = 4_000;

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const reducedMotion = useReducedMotion();

  const durations = useMemo(() => new Map(toasts.map((t) => [t.id, t.durationMs ?? DEFAULT_DURATION_MS])), [toasts]);

  useEffect(() => {
    if (toasts.length === 0) return;

    const timers = toasts
      .filter((t) => (t.durationMs ?? DEFAULT_DURATION_MS) > 0)
      .map((t) => window.setTimeout(() => dismissToast(t.id), t.durationMs ?? DEFAULT_DURATION_MS));

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [dismissToast, toasts, durations]);

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] px-4">
      <div className="mx-auto w-full max-w-md space-y-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role="status"
              initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: 12 }}
              transition={reducedMotion ? undefined : { duration: 0.18, ease: 'easeOut' }}
              className={cn(
                'rounded-2xl border shadow-lg backdrop-blur',
                'bg-white/90 dark:bg-gray-900/90',
                'border-black/10 dark:border-white/10'
              )}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1">
                  <p
                    className={cn(
                      'text-sm leading-snug',
                      toast.kind === 'error' ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-100'
                    )}
                  >
                    {toast.message}
                  </p>
                </div>

                {toast.actions && toast.actions.length > 0 && (
                  <div className="flex items-center gap-2">
                    {toast.actions.slice(0, 2).map((action) => (
                      <button
                        key={action.label}
                        onClick={() => {
                          action.onClick();
                          dismissToast(toast.id);
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                          action.variant === 'danger'
                            ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
                            : action.variant === 'primary'
                              ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => dismissToast(toast.id)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

