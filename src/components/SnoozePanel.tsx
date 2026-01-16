import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { useToastStore } from '../store/useToastStore';

interface SnoozePanelProps {
    isOpen: boolean;
    onClose: () => void;
}

function formatDateTimeLabel(ms: number) {
    const d = new Date(ms);
    const date = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
}

function msUntilNextWorkdayMorning(nowMs: number) {
    const now = new Date(nowMs);
    const target = new Date(now);
    target.setHours(9, 0, 0, 0);

    // Move to next day first
    target.setDate(target.getDate() + 1);

    // 0=Sun, 6=Sat
    while (target.getDay() === 0 || target.getDay() === 6) {
        target.setDate(target.getDate() + 1);
    }

    return Math.max(60_000, target.getTime() - nowMs);
}

function msUntilTomorrowMorning(nowMs: number) {
    const now = new Date(nowMs);
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    return Math.max(60_000, target.getTime() - nowMs);
}

function msUntilNextWeekMorning(nowMs: number) {
    const now = new Date(nowMs);
    const target = new Date(now);
    target.setDate(target.getDate() + 7);
    target.setHours(9, 0, 0, 0);
    return Math.max(60_000, target.getTime() - nowMs);
}

function msUntilNextMonthMorning(nowMs: number) {
    const now = new Date(nowMs);
    const day = now.getDate();

    const target = new Date(now);
    target.setDate(1);
    target.setMonth(target.getMonth() + 1);

    const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, daysInTargetMonth));
    target.setHours(9, 0, 0, 0);

    return Math.max(60_000, target.getTime() - nowMs);
}

function startOfMonthLocal(nowMs: number) {
    const d = new Date(nowMs);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfTodayLocal(nowMs: number) {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

export function SnoozePanel({ isOpen, onClose }: SnoozePanelProps) {
    const reducedMotion = useReducedMotion();
    const snoozeTask = useStore((state) => state.snoozeTask);
    const pushToast = useToastStore((state) => state.pushToast);

    const [customDateOpen, setCustomDateOpen] = useState(false);
    const [customSelectedDayMs, setCustomSelectedDayMs] = useState<number | null>(null);
    const [customMonthStart, setCustomMonthStart] = useState(() => startOfMonthLocal(0));
    const [customTodayStartMs, setCustomTodayStartMs] = useState(0);
    const [customCurrentMonthStartMs, setCustomCurrentMonthStartMs] = useState(0);

    const closeCustomDate = useCallback(() => {
        setCustomDateOpen(false);
        setCustomSelectedDayMs(null);
        setCustomMonthStart(startOfMonthLocal(0));
        setCustomTodayStartMs(0);
        setCustomCurrentMonthStartMs(0);
    }, []);

    const handleClose = useCallback(() => {
        closeCustomDate();
        onClose();
    }, [closeCustomDate, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (customDateOpen) {
                closeCustomDate();
                return;
            }
            handleClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [closeCustomDate, customDateOpen, handleClose, isOpen]);

    const handleSnooze = useCallback((durationMs: number, label: string) => {
        snoozeTask(durationMs);
        pushToast({
            kind: 'info',
            message: `Deferred: ${label}.`,
            actions: [
                {
                    label: 'Undo',
                    variant: 'primary',
                    onClick: () => useStore.temporal.getState().undo(),
                },
            ],
        });
        handleClose();
    }, [handleClose, pushToast, snoozeTask]);

    const openCustomDate = useCallback(() => {
        const nowMs = Date.now();
        const monthStart = startOfMonthLocal(nowMs);

        setCustomDateOpen(true);
        setCustomSelectedDayMs(null);
        setCustomTodayStartMs(startOfTodayLocal(nowMs));
        setCustomCurrentMonthStartMs(monthStart.getTime());
        setCustomMonthStart(monthStart);
    }, []);

    const options = useMemo(() => [
        { key: '5m', label: '5 minutes', onClick: () => handleSnooze(5 * 60_000, '5 minutes') },
        { key: '30m', label: '30 minutes', onClick: () => handleSnooze(30 * 60_000, '30 minutes') },
        { key: '1h', label: '1 hour', onClick: () => handleSnooze(60 * 60_000, '1 hour') },
        { key: '4h', label: '4 hours', onClick: () => handleSnooze(4 * 60 * 60_000, '4 hours') },
        {
            key: 'tomorrow',
            label: 'Tomorrow morning',
            onClick: () => handleSnooze(msUntilTomorrowMorning(Date.now()), 'Tomorrow morning'),
        },
        {
            key: 'workday',
            label: 'Next workday',
            onClick: () => handleSnooze(msUntilNextWorkdayMorning(Date.now()), 'Next workday'),
        },
        { key: 'week', label: 'Next week', onClick: () => handleSnooze(msUntilNextWeekMorning(Date.now()), 'Next week') },
        { key: 'month', label: 'Next month', onClick: () => handleSnooze(msUntilNextMonthMorning(Date.now()), 'Next month') },
        {
            key: 'custom',
            label: 'Custom date…',
            onClick: openCustomDate,
        },
    ], [handleSnooze, openCustomDate]);

    const handleCustomConfirm = useCallback(() => {
        if (customSelectedDayMs === null) return;

        const target = new Date(customSelectedDayMs);
        target.setHours(9, 0, 0, 0);

        const nowMs = Date.now();
        const durationMs = target.getTime() - nowMs;
        if (durationMs <= 0) {
            pushToast({
                kind: 'error',
                message: 'Pick a future date.',
            });
            return;
        }

        handleSnooze(durationMs, formatDateTimeLabel(target.getTime()));
        closeCustomDate();
    }, [closeCustomDate, customSelectedDayMs, handleSnooze, pushToast]);

    const customMonthStartMs = customMonthStart.getTime();

    const canGoPrevMonth = customMonthStartMs > customCurrentMonthStartMs;

    const monthLabel = useMemo(
        () => customMonthStart.toLocaleDateString([], { year: 'numeric', month: 'long' }),
        [customMonthStart]
    );

    const calendarCells = useMemo(() => {
        const year = customMonthStart.getFullYear();
        const month = customMonthStart.getMonth();
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        return Array.from({ length: 42 }, (_, idx) => {
            const dayNumber = idx - firstWeekday + 1;
            if (dayNumber < 1 || dayNumber > daysInMonth) return null;
            const day = new Date(year, month, dayNumber);
            day.setHours(0, 0, 0, 0);
            return day.getTime();
        });
    }, [customMonthStart]);

    const selectedLabel = useMemo(() => {
        if (customSelectedDayMs === null) return null;
        const target = new Date(customSelectedDayMs);
        target.setHours(9, 0, 0, 0);
        return formatDateTimeLabel(target.getTime());
    }, [customSelectedDayMs]);

    const goPrevMonth = useCallback(() => {
        if (!canGoPrevMonth) return;
        const next = new Date(customMonthStart);
        next.setMonth(next.getMonth() - 1, 1);
        next.setHours(0, 0, 0, 0);
        setCustomMonthStart(next);
    }, [canGoPrevMonth, customMonthStart]);

    const goNextMonth = useCallback(() => {
        const next = new Date(customMonthStart);
        next.setMonth(next.getMonth() + 1, 1);
        next.setHours(0, 0, 0, 0);
        setCustomMonthStart(next);
    }, [customMonthStart]);

    const weekdayLabels = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], []);

    const customTargetTimeLabel = useMemo(() => {
        const t = new Date();
        t.setHours(9, 0, 0, 0);
        return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, []);

    const handleDayPick = useCallback((dayMs: number) => {
        if (dayMs <= customTodayStartMs) return;
        setCustomSelectedDayMs(dayMs);
    }, [customTodayStartMs]);

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
                        onClick={handleClose}
                    />

                    <motion.div
                        key="panel"
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                        initial={reducedMotion ? undefined : { y: 18, opacity: 0 }}
                        animate={reducedMotion ? undefined : { y: 0, opacity: 1 }}
                        exit={reducedMotion ? undefined : { y: 18, opacity: 0 }}
                        transition={reducedMotion ? undefined : { duration: 0.18, ease: 'easeOut' }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            className={cn(
                                'pointer-events-auto w-full max-w-[420px]',
                                'bg-white/95 dark:bg-gray-900/95 backdrop-blur',
                                'rounded-3xl',
                                'border border-black/10 dark:border-white/10 shadow-2xl',
                                'max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-x-hidden overflow-y-auto overscroll-contain no-scrollbar'
                            )}
                        >
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Defer</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">Pick a duration.</p>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    aria-label="Close"
                                >
                                    <X size={18} className="text-gray-500 dark:text-gray-400" />
                                </button>
                            </div>

                            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {options.map((opt) => (
                                    <button
                                        key={opt.key}
                                        onClick={opt.onClick}
                                        className={cn(
                                            'px-3 py-2 rounded-xl text-sm font-medium',
                                            'bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700',
                                            'text-gray-700 dark:text-gray-200 transition-colors'
                                        )}
                                        aria-label={`Defer: ${opt.label}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {customDateOpen && (
                            <>
                                <motion.div
                                    key="custom-backdrop"
                                    className="fixed inset-0 z-[60] bg-black/30 dark:bg-black/60 backdrop-blur-sm"
                                    initial={reducedMotion ? undefined : { opacity: 0 }}
                                    animate={reducedMotion ? undefined : { opacity: 1 }}
                                    exit={reducedMotion ? undefined : { opacity: 0 }}
                                    onClick={closeCustomDate}
                                />

                                <motion.div
                                    key="custom-panel"
                                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
                                    initial={reducedMotion ? undefined : { y: 22, opacity: 0 }}
                                    animate={reducedMotion ? undefined : { y: 0, opacity: 1 }}
                                    exit={reducedMotion ? undefined : { y: 22, opacity: 0 }}
                                    transition={reducedMotion ? undefined : { duration: 0.18, ease: 'easeOut' }}
                                >
                                    <div
                                        role="dialog"
                                        aria-modal="true"
                                        aria-label="Pick a custom defer date"
                                        className={cn(
                                            'pointer-events-auto w-full max-w-[480px]',
                                            'bg-white/95 dark:bg-gray-900/95 backdrop-blur',
                                            'rounded-3xl',
                                            'border border-black/10 dark:border-white/10 shadow-2xl',
                                            'max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-6rem)] overflow-x-hidden overflow-y-auto overscroll-contain no-scrollbar'
                                        )}
                                    >
                                    <div className="p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom date</h3>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    Time is fixed at {customTargetTimeLabel}.
                                                </p>
                                            </div>
                                            <button
                                                onClick={closeCustomDate}
                                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                aria-label="Close"
                                            >
                                                <X size={18} className="text-gray-500 dark:text-gray-400" />
                                            </button>
                                        </div>

                                        <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-gray-950/30 overflow-hidden">
                                            <div className="px-4 py-3 flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={goPrevMonth}
                                                    disabled={!canGoPrevMonth}
                                                    className={cn(
                                                        'p-2 rounded-xl transition-colors',
                                                        canGoPrevMonth
                                                            ? 'hover:bg-gray-100 dark:hover:bg-gray-800'
                                                            : 'opacity-40 cursor-not-allowed'
                                                    )}
                                                    aria-label="Previous month"
                                                >
                                                    <ChevronLeft size={18} className="text-gray-600 dark:text-gray-300" />
                                                </button>

                                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                                    {monthLabel}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={goNextMonth}
                                                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                    aria-label="Next month"
                                                >
                                                    <ChevronRight size={18} className="text-gray-600 dark:text-gray-300" />
                                                </button>
                                            </div>

                                            <div className="px-4 pb-4">
                                                <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                                                    {weekdayLabels.map((d) => (
                                                        <div key={d} className="text-center font-medium">
                                                            {d}
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-7 gap-1">
                                                    {calendarCells.map((dayMs, idx) => {
                                                        if (dayMs === null) {
                                                            return <div key={idx} className="h-10" />;
                                                        }

                                                        const isSelected = customSelectedDayMs === dayMs;
                                                        const isDisabled = dayMs <= customTodayStartMs;
                                                        const dayNumber = new Date(dayMs).getDate();

                                                        return (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => handleDayPick(dayMs)}
                                                                disabled={isDisabled}
                                                                className={cn(
                                                                    'h-10 rounded-xl text-sm font-medium transition-colors',
                                                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
                                                                    isSelected
                                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                                        : isDisabled
                                                                            ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                                                                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                                                )}
                                                                aria-label={`Select ${new Date(dayMs).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}`}
                                                            >
                                                                {dayNumber}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-5 flex items-center justify-between gap-3">
                                            <div className="min-w-0 text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {selectedLabel ? `Defer until ${selectedLabel}` : 'Pick a future day.'}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleCustomConfirm}
                                                disabled={customSelectedDayMs === null}
                                                className={cn(
                                                    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                                                    customSelectedDayMs === null
                                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                )}
                                                aria-label="Confirm custom date"
                                            >
                                                Defer
                                            </button>
                                        </div>
                                    </div>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </>
            )}
        </AnimatePresence>
    );
}
