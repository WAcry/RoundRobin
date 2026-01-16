import { AnimatePresence, motion, Reorder, useReducedMotion } from 'framer-motion';
import { ArrowLeftToLine, GripVertical } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import type { TaskId } from '../types';
import { useStore } from '../store/useStore';

export function QueueBar() {
    const shouldReduceMotion = useReducedMotion();

    const wokenQueue = useStore((state) => state.wokenQueue);
    const readyQueue = useStore((state) => state.readyQueue);
    const tasks = useStore((state) => state.tasks);
    const reorderReadyQueue = useStore((state) => state.reorderReadyQueue);

    const queueScrollerRef = useRef<HTMLDivElement | null>(null);
    const [queueDraft, setQueueDraft] = useState<TaskId[] | null>(null);
    const queueDraftRef = useRef<TaskId[] | null>(null);
    const lastDragEndAtRef = useRef(0);

    const displayedWokenIds = useMemo(() => {
        const seen = new Set<TaskId>();
        const out: TaskId[] = [];
        wokenQueue.forEach((id) => {
            if (seen.has(id)) return;
            if (!tasks[id]) return;
            seen.add(id);
            out.push(id);
        });
        return out;
    }, [tasks, wokenQueue]);

    const wokenIdSet = useMemo(() => new Set(displayedWokenIds), [displayedWokenIds]);

    const displayedReadyIds = useMemo(() => {
        const base = queueDraft ?? readyQueue;
        const seen = new Set<TaskId>();
        const out: TaskId[] = [];
        base.forEach((id) => {
            if (seen.has(id)) return;
            if (wokenIdSet.has(id)) return;
            if (!tasks[id]) return;
            seen.add(id);
            out.push(id);
        });
        return out;
    }, [queueDraft, readyQueue, tasks, wokenIdSet]);

    const wakeCount = displayedWokenIds.length;
    const queueCount = displayedReadyIds.length;

    const promoteToNext = useCallback(
        (id: TaskId) => {
            if (queueDraftRef.current) return;
            if (Date.now() - lastDragEndAtRef.current < 250) return;
            const index = readyQueue.indexOf(id);
            if (index <= 0) return;

            const next = [id, ...readyQueue.filter((x) => x !== id)];
            reorderReadyQueue(next);
        },
        [readyQueue, reorderReadyQueue]
    );

    const scrollQueueToStart = useCallback(() => {
        const el = queueScrollerRef.current;
        if (!el) return;
        el.scrollTo({ left: 0, behavior: shouldReduceMotion ? 'auto' : 'smooth' });
    }, [shouldReduceMotion]);

    const hasAny = wakeCount > 0 || queueCount > 0;

    return (
        <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="shrink-0 flex items-center gap-1">
                <button
                    type="button"
                    onClick={scrollQueueToStart}
                    disabled={!hasAny}
                    className={cn(
                        "inline-flex items-center justify-center rounded p-1 text-gray-400 dark:text-gray-500",
                        "hover:text-gray-700 dark:hover:text-gray-300 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
                        "disabled:opacity-40 disabled:pointer-events-none"
                    )}
                    title="Scroll queue to start"
                    aria-label="Scroll queue to start"
                >
                    <ArrowLeftToLine size={14} />
                </button>
                {wakeCount > 0 && (
                    <>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/80 dark:text-amber-400/80">
                            Wake
                        </span>
                        <span className="text-[11px] text-amber-500/80 dark:text-amber-400/80 tabular-nums">{wakeCount}</span>
                        <span className="px-1 text-[11px] text-gray-300 dark:text-gray-700">·</span>
                    </>
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Queue
                </span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{queueCount}</span>
            </div>

            <div className="relative min-w-0 flex-1">
                {hasAny && (
                    <>
                        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent" />
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent" />
                    </>
                )}

                {!hasAny ? (
                    <div className="py-1 text-xs text-gray-400 dark:text-gray-500 truncate">No queued tasks</div>
                ) : (
                    <div
                        ref={queueScrollerRef}
                        className={cn(
                            "no-scrollbar flex items-center gap-2 overflow-x-auto py-1 pr-1",
                            "scroll-px-2 snap-x snap-mandatory"
                        )}
                    >
                        {displayedWokenIds.map((id, index) => {
                            const task = tasks[id];
                            if (!task) return null;
                            const isNext = index === 0;

                            return (
                                <div
                                    key={id}
                                    className={cn(
                                        "snap-start group flex items-center gap-2 px-3 py-2 rounded-full select-none",
                                        "border shadow-sm",
                                        isNext
                                            ? "bg-gradient-to-b from-amber-50 to-white text-amber-900 border-amber-200 shadow-amber-100/70 dark:from-amber-950/50 dark:to-gray-900 dark:text-amber-100 dark:border-amber-900/60"
                                            : "bg-amber-50/70 text-amber-900 border-amber-100 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/30"
                                    )}
                                    title={task.title}
                                >
                                    <span className="text-xs font-semibold truncate max-w-[10rem]">{task.title}</span>
                                    {isNext && (
                                        <motion.span
                                            layout
                                            initial={false}
                                            animate={
                                                shouldReduceMotion
                                                    ? undefined
                                                    : { opacity: [0.65, 1, 0.65] }
                                            }
                                            transition={
                                                shouldReduceMotion
                                                    ? undefined
                                                    : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                                            }
                                            className="ml-1 text-[10px] font-bold tracking-wider text-amber-600 dark:text-amber-300"
                                        >
                                            NEXT
                                        </motion.span>
                                    )}
                                </div>
                            );
                        })}

                        {displayedWokenIds.length > 0 && displayedReadyIds.length > 0 && (
                            <div className="h-6 w-px bg-gray-200/70 dark:bg-gray-700/60 shrink-0" />
                        )}

                        <Reorder.Group
                            axis="x"
                            values={displayedReadyIds}
                            onReorder={(next) => {
                                if (!queueDraftRef.current) return;
                                queueDraftRef.current = next;
                                setQueueDraft(next);
                            }}
                            className="flex items-center gap-2"
                        >
                            <AnimatePresence initial={false}>
                                {displayedReadyIds.map((id, index) => {
                                    const task = tasks[id];
                                    if (!task) return null;

                                    const isNext = displayedWokenIds.length === 0 && index === 0;

                                    return (
                                        <Reorder.Item
                                            key={id}
                                            value={id}
                                            onDragStart={() => {
                                                const base = readyQueue.filter((taskId) => !!tasks[taskId] && !wokenIdSet.has(taskId));
                                                queueDraftRef.current = base;
                                                setQueueDraft(base);
                                            }}
                                            onDragEnd={() => {
                                                const draft = queueDraftRef.current;
                                                queueDraftRef.current = null;
                                                lastDragEndAtRef.current = Date.now();
                                                setQueueDraft(null);
                                                if (draft) reorderReadyQueue(draft);
                                            }}
                                            className="snap-start"
                                        >
                                            <motion.button
                                                type="button"
                                                layout
                                                whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                                                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                                                whileDrag={shouldReduceMotion ? undefined : { scale: 1.03, rotate: -1 }}
                                                onClick={() => promoteToNext(id)}
                                                aria-label={
                                                    isNext
                                                        ? `Next task: ${task.title}`
                                                        : `Move earlier: ${task.title}`
                                                }
                                                className={cn(
                                                    "group flex items-center gap-2 px-3 py-2 rounded-full select-none",
                                                    "border shadow-sm",
                                                    "cursor-grab active:cursor-grabbing",
                                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
                                                    isNext
                                                        ? "bg-gradient-to-b from-blue-50 to-white text-blue-900 border-blue-200 shadow-blue-100/70 dark:from-blue-950/50 dark:to-gray-900 dark:text-blue-100 dark:border-blue-900/60"
                                                        : "bg-white/80 text-gray-700 border-black/5 dark:bg-gray-800/70 dark:text-gray-200 dark:border-white/10"
                                                )}
                                            >
                                                <GripVertical
                                                    size={14}
                                                    className={cn(
                                                        "shrink-0",
                                                        isNext ? "text-blue-400 dark:text-blue-500" : "text-gray-400 dark:text-gray-500"
                                                    )}
                                                />
                                                <span className="text-xs font-semibold truncate max-w-[10rem]" title={task.title}>
                                                    {task.title}
                                                </span>
                                                {isNext && (
                                                    <motion.span
                                                        layout
                                                        initial={false}
                                                        animate={
                                                            shouldReduceMotion
                                                                ? undefined
                                                                : { opacity: [0.65, 1, 0.65] }
                                                        }
                                                        transition={
                                                            shouldReduceMotion
                                                                ? undefined
                                                                : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                                                        }
                                                        className="ml-1 text-[10px] font-bold tracking-wider text-blue-600 dark:text-blue-300"
                                                    >
                                                        NEXT
                                                    </motion.span>
                                                )}
                                            </motion.button>
                                        </Reorder.Item>
                                    );
                                })}
                            </AnimatePresence>
                        </Reorder.Group>
                    </div>
                )}
            </div>
        </div>
    );
}
