import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import type { AppState, AttachmentId, TaskAttachment, TaskId, Task } from '../types';
import { createDebouncedLocalStorage, STORAGE_KEY } from './storage';

function nextUpdatedAt(prev: number, nowMs: number) {
    return nowMs <= prev ? prev + 1 : nowMs;
}

const LOCAL_CLIENT_ID = crypto.randomUUID();
let maxKnownRev = 0;

export function getLocalClientId() {
    return LOCAL_CLIENT_ID;
}

export function noteExternalRevision(rev: number) {
    if (!Number.isFinite(rev)) return;
    maxKnownRev = Math.max(maxKnownRev, Math.floor(rev));
}

export function getNextWriteMeta(current: Pick<AppState, 'rev' | 'updatedAt'>) {
    const now = Date.now();
    const updatedAt = nextUpdatedAt(current.updatedAt, now);
    const rev = Math.max(current.rev, maxKnownRev) + 1;
    maxKnownRev = Math.max(maxKnownRev, rev);
    return { rev, updatedAt, clientId: LOCAL_CLIENT_ID };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function takeNextTaskId(wokenQueue: TaskId[], readyQueue: TaskId[]) {
    if (wokenQueue.length > 0) {
        const [nextId, ...rest] = wokenQueue;
        return { nextId, wokenQueue: rest, readyQueue };
    }
    if (readyQueue.length > 0) {
        const [nextId, ...rest] = readyQueue;
        return { nextId, wokenQueue, readyQueue: rest };
    }
    return { nextId: null as TaskId | null, wokenQueue, readyQueue };
}

interface AppActions {
    addTask: (title: string) => void;
    completeTask: () => void;
    completeTaskById: (id: TaskId) => void;
    snoozeTask: (durationMs?: number) => void;
    resumeSnoozedTask: (id: TaskId) => void;
    moveTaskToWake: (id: TaskId) => void;
    moveTaskToQueue: (id: TaskId) => void;
    moveTaskToQueueHead: (id: TaskId) => void;
    focusTask: (id: TaskId) => void;
    focusTaskFromQueue: (id: TaskId) => void;
    moveCurrentToQueueHead: () => void;
    swapCurrentWithWakeHead: () => void;
    deleteTask: () => void;
    updateTaskTitle: (id: TaskId, title: string) => void;
    reorderWokenQueue: (newOrder: TaskId[]) => void;
    reorderReadyQueue: (newOrder: TaskId[]) => void;

    // Subtasks
    toggleSubtasks: (taskId: TaskId) => void;
    toggleShowCompletedSubtasks: (taskId: TaskId) => void;
    addSubtask: (taskId: TaskId, text: string) => void;
    toggleSubtask: (taskId: TaskId, subtaskId: string) => void;

    // Notes
    toggleNotes: (taskId: TaskId) => void;
    updateNotes: (taskId: TaskId, markdown: string) => void;

    // Attachments
    toggleAttachments: (taskId: TaskId) => void;
    addAttachment: (taskId: TaskId, attachment: TaskAttachment) => void;
    removeAttachment: (taskId: TaskId, attachmentId: AttachmentId) => void;
    setAttachmentCloudPath: (taskId: TaskId, attachmentId: AttachmentId, cloudPath: string) => void;

    // System
    tick: () => number; // Check snoozed tasks; returns number of tasks moved into Wake Queue
    clearHistory: () => void;
    restoreTask: (id: TaskId) => void;
}

type Store = AppState & AppActions;

const initialAppState: AppState = {
    rev: 0,
    updatedAt: Date.now(),
    clientId: LOCAL_CLIENT_ID,
    version: 2,
    currentTaskId: null,
    wokenQueue: [],
    readyQueue: [],
    snoozedIds: [],
    completedIds: [],
    deletedIds: [],
    tasks: {},
    nextSnoozeSeq: 1,
};

export const useStore = create<Store>()(
    temporal(
        persist(
            (setRaw, get) => {
                const set = (partial: Store | Partial<Store> | ((state: Store) => Store | Partial<Store>)) => {
                    if (typeof partial === 'function') {
                        return setRaw((state: Store) => {
                            const next = partial(state);
                            if (Object.is(next, state)) return state;
                            const meta = getNextWriteMeta(state);
                            return { ...next, ...meta };
                        });
                    }

                    return setRaw((state: Store) => {
                        if (Object.is(partial, state)) return state;
                        const meta = getNextWriteMeta(state);
                        return { ...partial, ...meta };
                    });
                };

                return {
                    ...initialAppState,

                addTask: (title: string) => {
                    const id = crypto.randomUUID();
                    const newTask: Task = {
                        id,
                        title: title.trim(),
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        attachments: [],
                        subtasks: [],
                        notesMd: '',
                        ui: { subtasksOpen: false, notesOpen: false, attachmentsOpen: false, showCompletedSubtasks: false },
                    };

                    set((state) => {
                        const { currentTaskId, readyQueue, tasks } = state;

                        // Logic 5.1: New task preempts current
                        const newCurrent = id;
                        const newReadyQueue = [...readyQueue];

                        if (currentTaskId) {
                            newReadyQueue.push(currentTaskId);
                        }

                        return {
                            tasks: { ...tasks, [id]: newTask },
                            currentTaskId: newCurrent,
                            readyQueue: newReadyQueue,
                        };
                    });
                },

                completeTask: () => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, completedIds, tasks } = state;
                        if (!currentTaskId) return state;

                        const now = Date.now();
                        const currentTask = tasks[currentTaskId];
                        const updatedAt = currentTask ? nextUpdatedAt(currentTask.updatedAt, now) : now;
                        const updatedTasks = currentTask
                            ? {
                                ...tasks,
                                [currentTaskId]: { ...currentTask, doneAt: updatedAt, restoredAt: undefined, updatedAt },
                            }
                            : tasks;

                        const newCompletedIds = [currentTaskId, ...completedIds];

                        // Logic 5.4: Complete -> Move to history, pick next (Wake > Ready)
                        const nextPick = takeNextTaskId(wokenQueue, readyQueue);

                        return {
                            tasks: updatedTasks,
                            currentTaskId: nextPick.nextId,
                            wokenQueue: nextPick.wokenQueue,
                            readyQueue: nextPick.readyQueue,
                            completedIds: newCompletedIds,
                        };
                    });
                },

                completeTaskById: (id: TaskId) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        const task = tasks[id];
                        if (!task) return state;
                        if (completedIds.includes(id)) return state;

                        const now = Date.now();
                        const updatedAt = nextUpdatedAt(task.updatedAt, now);
                        const updatedTask: Task = {
                            ...task,
                            doneAt: updatedAt,
                            updatedAt,
                            restoredAt: undefined,
                            snoozeUntil: undefined,
                            snoozeSeq: undefined,
                        };

                        let nextWokenQueue = wokenQueue.filter((x) => x !== id);
                        let nextReadyQueue = readyQueue.filter((x) => x !== id);
                        const nextSnoozedIds = snoozedIds.filter((x) => x !== id);
                        const nextCompletedIds = [id, ...completedIds.filter((x) => x !== id)];

                        let nextCurrentId = currentTaskId;
                        if (id === currentTaskId) {
                            const pick = takeNextTaskId(nextWokenQueue, nextReadyQueue);
                            nextCurrentId = pick.nextId;
                            nextWokenQueue = pick.wokenQueue;
                            nextReadyQueue = pick.readyQueue;
                        }

                        return {
                            tasks: { ...tasks, [id]: updatedTask },
                            currentTaskId: nextCurrentId,
                            wokenQueue: nextWokenQueue,
                            readyQueue: nextReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            completedIds: nextCompletedIds,
                        };
                    });
                },

                snoozeTask: (durationMs?: number) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, tasks, nextSnoozeSeq } = state;
                        if (!currentTaskId) return state;

                        const currentTask = tasks[currentTaskId];
                        if (!currentTask) {
                            const pick = takeNextTaskId(wokenQueue, readyQueue);
                            return {
                                currentTaskId: pick.nextId,
                                wokenQueue: pick.wokenQueue,
                                readyQueue: pick.readyQueue,
                            };
                        }

                        const now = Date.now();
                        let updatedTasks = tasks;
                        let updatedSnoozedIds = snoozedIds;
                        let updatedReadyQueue = readyQueue;
                        let updatedWokenQueue = wokenQueue;
                        let nextCurrentId: TaskId | null = null;
                        let updatedNextSnoozeSeq = nextSnoozeSeq;

                        // Case A: Snooze with Duration (Long Press/Menu)
                        if (typeof durationMs === 'number' && durationMs > 0) {
                            const seq = updatedNextSnoozeSeq;
                            updatedNextSnoozeSeq += 1;

                            updatedTasks = {
                                ...tasks,
                                [currentTaskId]: {
                                    ...currentTask,
                                    snoozeUntil: now + durationMs,
                                    snoozeSeq: seq,
                                },
                            };
                            updatedSnoozedIds = snoozedIds.includes(currentTaskId) ? snoozedIds : [...snoozedIds, currentTaskId];

                            const pick = takeNextTaskId(updatedWokenQueue, updatedReadyQueue);
                            nextCurrentId = pick.nextId;
                            updatedWokenQueue = pick.wokenQueue;
                            updatedReadyQueue = pick.readyQueue;
                        }
                        // Case B: Snooze Click (Round Robin / Auto-1min)
                        else {
                            const hasOtherReady = wokenQueue.length > 0 || readyQueue.length > 0;

                            // Rule 5.2.A: Has another runnable task
                            if (hasOtherReady) {
                                updatedReadyQueue = [...readyQueue, currentTaskId];

                                const pick = takeNextTaskId(updatedWokenQueue, updatedReadyQueue);
                                nextCurrentId = pick.nextId;
                                updatedWokenQueue = pick.wokenQueue;
                                updatedReadyQueue = pick.readyQueue;
                            }
                            // Rule 5.2.B: Only 1 task -> auto snooze 1 min
                            else {
                                const autoDurationMs = 60 * 1000;
                                const seq = updatedNextSnoozeSeq;
                                updatedNextSnoozeSeq += 1;

                                updatedTasks = {
                                    ...tasks,
                                    [currentTaskId]: {
                                        ...currentTask,
                                        snoozeUntil: now + autoDurationMs,
                                        snoozeSeq: seq,
                                    },
                                };
                                updatedSnoozedIds = snoozedIds.includes(currentTaskId) ? snoozedIds : [...snoozedIds, currentTaskId];
                                nextCurrentId = null; // Empty state
                            }
                        }

                        return {
                            tasks: updatedTasks,
                            wokenQueue: updatedWokenQueue,
                            readyQueue: updatedReadyQueue,
                            snoozedIds: updatedSnoozedIds,
                            currentTaskId: nextCurrentId,
                            nextSnoozeSeq: updatedNextSnoozeSeq,
                        };
                    });
                },

                moveTaskToWake: (id: TaskId) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (id === currentTaskId) return state;
                        if (completedIds.includes(id)) return state;
                        const task = tasks[id];
                        if (!task) return state;

                        const wasSnoozed = snoozedIds.includes(id);
                        const nextSnoozedIds = snoozedIds.filter((x) => x !== id);

                        let nextWokenQueue = [...wokenQueue.filter((x) => x !== id), id];
                        let nextReadyQueue = readyQueue.filter((x) => x !== id);

                        let updatedTasks = tasks;
                        if (wasSnoozed) {
                            updatedTasks = { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } };
                        }

                        let nextCurrentId = currentTaskId;
                        if (!nextCurrentId) {
                            const pick = takeNextTaskId(nextWokenQueue, nextReadyQueue);
                            nextCurrentId = pick.nextId;
                            nextWokenQueue = pick.wokenQueue;
                            nextReadyQueue = pick.readyQueue;
                        }

                        return {
                            currentTaskId: nextCurrentId,
                            wokenQueue: nextWokenQueue,
                            readyQueue: nextReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                moveTaskToQueue: (id: TaskId) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (id === currentTaskId) return state;
                        if (completedIds.includes(id)) return state;
                        const task = tasks[id];
                        if (!task) return state;

                        const wasSnoozed = snoozedIds.includes(id);
                        const nextSnoozedIds = snoozedIds.filter((x) => x !== id);

                        const nextWokenQueue = wokenQueue.filter((x) => x !== id);
                        const nextReadyQueue = [...readyQueue.filter((x) => x !== id), id];

                        let updatedTasks = tasks;
                        if (wasSnoozed) {
                            updatedTasks = { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } };
                        }

                        let nextCurrentId = currentTaskId;
                        let normalizedWokenQueue = nextWokenQueue;
                        let normalizedReadyQueue = nextReadyQueue;
                        if (!nextCurrentId) {
                            const pick = takeNextTaskId(nextWokenQueue, nextReadyQueue);
                            nextCurrentId = pick.nextId;
                            normalizedWokenQueue = pick.wokenQueue;
                            normalizedReadyQueue = pick.readyQueue;
                        }

                        return {
                            currentTaskId: nextCurrentId,
                            wokenQueue: normalizedWokenQueue,
                            readyQueue: normalizedReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                moveTaskToQueueHead: (id: TaskId) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (id === currentTaskId) return state;
                        if (completedIds.includes(id)) return state;
                        const task = tasks[id];
                        if (!task) return state;

                        const wasSnoozed = snoozedIds.includes(id);
                        const nextSnoozedIds = snoozedIds.filter((x) => x !== id);

                        const nextWokenQueue = wokenQueue.filter((x) => x !== id);
                        const nextReadyQueue = [id, ...readyQueue.filter((x) => x !== id)];

                        let updatedTasks = tasks;
                        if (wasSnoozed) {
                            updatedTasks = { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } };
                        }

                        let nextCurrentId = currentTaskId;
                        let normalizedWokenQueue = nextWokenQueue;
                        let normalizedReadyQueue = nextReadyQueue;
                        if (!nextCurrentId) {
                            const pick = takeNextTaskId(nextWokenQueue, nextReadyQueue);
                            nextCurrentId = pick.nextId;
                            normalizedWokenQueue = pick.wokenQueue;
                            normalizedReadyQueue = pick.readyQueue;
                        }

                        return {
                            currentTaskId: nextCurrentId,
                            wokenQueue: normalizedWokenQueue,
                            readyQueue: normalizedReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                focusTask: (id: TaskId) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (id === currentTaskId) return state;
                        if (completedIds.includes(id)) return state;
                        const task = tasks[id];
                        if (!task) return state;

                        const wasSnoozed = snoozedIds.includes(id);
                        const nextSnoozedIds = snoozedIds.filter((x) => x !== id);
                        const nextWokenQueue = wokenQueue.filter((x) => x !== id);
                        const nextReadyQueue = readyQueue.filter((x) => x !== id);

                        let updatedTasks = tasks;
                        if (wasSnoozed) {
                            updatedTasks = { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } };
                        }

                        let normalizedWokenQueue = nextWokenQueue;
                        if (currentTaskId && tasks[currentTaskId]) {
                            normalizedWokenQueue = [currentTaskId, ...normalizedWokenQueue.filter((x) => x !== currentTaskId)];
                        }

                        return {
                            currentTaskId: id,
                            wokenQueue: normalizedWokenQueue,
                            readyQueue: nextReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                focusTaskFromQueue: (id: TaskId) => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (id === currentTaskId) return state;
                        if (completedIds.includes(id)) return state;
                        const task = tasks[id];
                        if (!task) return state;

                        const wasSnoozed = snoozedIds.includes(id);
                        const nextSnoozedIds = snoozedIds.filter((x) => x !== id);
                        const nextWokenQueue = wokenQueue.filter((x) => x !== id);
                        const nextReadyQueue = readyQueue.filter((x) => x !== id);

                        let updatedTasks = tasks;
                        if (wasSnoozed) {
                            updatedTasks = { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } };
                        }

                        let normalizedWokenQueue = nextWokenQueue;
                        if (currentTaskId && tasks[currentTaskId]) {
                            normalizedWokenQueue = [...normalizedWokenQueue.filter((x) => x !== currentTaskId), currentTaskId];
                        }

                        return {
                            currentTaskId: id,
                            wokenQueue: normalizedWokenQueue,
                            readyQueue: nextReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                moveCurrentToQueueHead: () => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (!currentTaskId) return state;
                        if (completedIds.includes(currentTaskId)) return state;
                        const currentTask = tasks[currentTaskId];
                        if (!currentTask) {
                            const pick = takeNextTaskId(wokenQueue, readyQueue);
                            return { currentTaskId: pick.nextId, wokenQueue: pick.wokenQueue, readyQueue: pick.readyQueue };
                        }

                        let updatedTasks = tasks;
                        if (typeof currentTask.snoozeUntil === 'number') {
                            updatedTasks = {
                                ...tasks,
                                [currentTaskId]: { ...currentTask, snoozeUntil: undefined, snoozeSeq: undefined },
                            };
                        }

                        const nextSnoozedIds = snoozedIds.filter((id) => id !== currentTaskId);
                        const baseWokenQueue = wokenQueue.filter((id) => id !== currentTaskId);
                        const baseReadyQueue = readyQueue.filter((id) => id !== currentTaskId);

                        let nextReadyQueue = [currentTaskId, ...baseReadyQueue];
                        let nextWokenQueue = baseWokenQueue;
                        let nextCurrentId: TaskId | null = null;

                        if (nextWokenQueue.length > 0) {
                            const [wakeHead, ...restWake] = nextWokenQueue;
                            nextCurrentId = wakeHead;
                            nextWokenQueue = restWake;
                            nextReadyQueue = nextReadyQueue.filter((id) => id !== wakeHead);
                        } else if (baseReadyQueue.length > 0) {
                            const queueHead = baseReadyQueue[0];
                            nextCurrentId = queueHead;
                            nextReadyQueue = [currentTaskId, ...baseReadyQueue.slice(1)];
                        } else {
                            nextCurrentId = null;
                        }

                        return {
                            currentTaskId: nextCurrentId,
                            wokenQueue: nextWokenQueue,
                            readyQueue: nextReadyQueue,
                            snoozedIds: nextSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                swapCurrentWithWakeHead: () => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, tasks } = state;
                        if (!currentTaskId) return state;
                        if (completedIds.includes(currentTaskId)) return state;
                        const currentTask = tasks[currentTaskId];
                        if (!currentTask) {
                            const pick = takeNextTaskId(wokenQueue, readyQueue);
                            return { currentTaskId: pick.nextId, wokenQueue: pick.wokenQueue, readyQueue: pick.readyQueue };
                        }

                        let updatedTasks = tasks;
                        if (typeof currentTask.snoozeUntil === 'number') {
                            updatedTasks = {
                                ...tasks,
                                [currentTaskId]: { ...currentTask, snoozeUntil: undefined, snoozeSeq: undefined },
                            };
                        }

                        const baseWokenQueue = wokenQueue.filter((id) => id !== currentTaskId);
                        const baseReadyQueue = readyQueue.filter((id) => id !== currentTaskId);
                        const baseSnoozedIds = snoozedIds.filter((id) => id !== currentTaskId);

                        if (baseWokenQueue.length > 0) {
                            const [wakeHead, ...restWake] = baseWokenQueue;
                            const nextWokenQueue = [currentTaskId, ...restWake];

                            const normalizedReadyQueue = baseReadyQueue.filter((id) => id !== wakeHead);
                            const normalizedSnoozedIds = baseSnoozedIds.filter((id) => id !== wakeHead);

                            const wakeTask = tasks[wakeHead];
                            if (wakeTask && typeof wakeTask.snoozeUntil === 'number') {
                                updatedTasks = {
                                    ...updatedTasks,
                                    [wakeHead]: { ...wakeTask, snoozeUntil: undefined, snoozeSeq: undefined },
                                };
                            }

                            return {
                                currentTaskId: wakeHead,
                                wokenQueue: nextWokenQueue,
                                readyQueue: normalizedReadyQueue,
                                snoozedIds: normalizedSnoozedIds,
                                tasks: updatedTasks,
                            };
                        }

                        let nextCurrentId: TaskId | null = null;
                        let nextReadyQueue = baseReadyQueue;
                        if (baseReadyQueue.length > 0) {
                            nextCurrentId = baseReadyQueue[0];
                            nextReadyQueue = baseReadyQueue.slice(1);
                        }

                        return {
                            currentTaskId: nextCurrentId,
                            wokenQueue: [currentTaskId],
                            readyQueue: nextReadyQueue,
                            snoozedIds: baseSnoozedIds,
                            tasks: updatedTasks,
                        };
                    });
                },

                resumeSnoozedTask: (id: TaskId) => {
                    set((state) => {
                        const { snoozedIds, tasks, wokenQueue, readyQueue, currentTaskId, completedIds } = state;
                        if (!snoozedIds.includes(id)) return state;

                        const task = tasks[id];
                        const nextSnoozedIds = snoozedIds.filter((sid) => sid !== id);

                        if (!task) {
                            return { snoozedIds: nextSnoozedIds };
                        }

                        if (currentTaskId === id || wokenQueue.includes(id) || readyQueue.includes(id) || completedIds.includes(id)) {
                            return {
                                snoozedIds: nextSnoozedIds,
                                tasks: { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } },
                            };
                        }

                        const updatedTasks = { ...tasks, [id]: { ...task, snoozeUntil: undefined, snoozeSeq: undefined } };

                        // Add to ready queue end, then honor the "if current is empty, take head" rule.
                        let nextReadyQueue = [...readyQueue, id];
                        let nextCurrentId = currentTaskId;
                        let nextWokenQueue = wokenQueue;
                        if (!nextCurrentId) {
                            const pick = takeNextTaskId(nextWokenQueue, nextReadyQueue);
                            nextCurrentId = pick.nextId;
                            nextWokenQueue = pick.wokenQueue;
                            nextReadyQueue = pick.readyQueue;
                        }

                        return {
                            tasks: updatedTasks,
                            snoozedIds: nextSnoozedIds,
                            wokenQueue: nextWokenQueue,
                            readyQueue: nextReadyQueue,
                            currentTaskId: nextCurrentId,
                        };
                    });
                },

                reorderWokenQueue: (newOrder: TaskId[]) => {
                    set((state) => {
                        if (state.wokenQueue.length === 0) return state;

                        const existingSet = new Set(state.wokenQueue);
                        const normalized: TaskId[] = [];
                        const seen = new Set<TaskId>();

                        newOrder.forEach((taskId) => {
                            if (!existingSet.has(taskId)) return;
                            if (seen.has(taskId)) return;
                            seen.add(taskId);
                            normalized.push(taskId);
                        });

                        state.wokenQueue.forEach((taskId) => {
                            if (seen.has(taskId)) return;
                            seen.add(taskId);
                            normalized.push(taskId);
                        });

                        const isSame =
                            normalized.length === state.wokenQueue.length &&
                            normalized.every((taskId, idx) => taskId === state.wokenQueue[idx]);
                        if (isSame) return state;

                        return { wokenQueue: normalized };
                    });
                },

                reorderReadyQueue: (newOrder: TaskId[]) => {
                    set((state) => {
                        if (state.readyQueue.length === 0) return state;

                        const existingSet = new Set(state.readyQueue);
                        const normalized: TaskId[] = [];
                        const seen = new Set<TaskId>();

                        newOrder.forEach((id) => {
                            if (!existingSet.has(id)) return;
                            if (seen.has(id)) return;
                            seen.add(id);
                            normalized.push(id);
                        });

                        state.readyQueue.forEach((id) => {
                            if (seen.has(id)) return;
                            seen.add(id);
                            normalized.push(id);
                        });

                        const isSame =
                            normalized.length === state.readyQueue.length &&
                            normalized.every((id, idx) => id === state.readyQueue[idx]);
                        if (isSame) return state;

                        return { readyQueue: normalized };
                    });
                },

                deleteTask: () => {
                    set((state) => {
                        const { currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, deletedIds, tasks } = state;
                        if (!currentTaskId) return state;

                        // Logic 5.5: Remove from system completely (but recoverable via undo)
                        const newTasks = { ...tasks };
                        delete newTasks[currentTaskId];

                        const nextWokenQueue = wokenQueue.filter((id) => id !== currentTaskId);
                        const nextReadyQueue = readyQueue.filter((id) => id !== currentTaskId);
                        const nextSnoozedIds = snoozedIds.filter((id) => id !== currentTaskId);
                        const nextCompletedIds = completedIds.filter((id) => id !== currentTaskId);
                        const nextDeletedIds = (
                            deletedIds.includes(currentTaskId) ? deletedIds : [...deletedIds, currentTaskId]
                        ).slice().sort();

                        const nextPick = takeNextTaskId(nextWokenQueue, nextReadyQueue);

                        return {
                            currentTaskId: nextPick.nextId,
                            wokenQueue: nextPick.wokenQueue,
                            readyQueue: nextPick.readyQueue,
                            snoozedIds: nextSnoozedIds,
                            completedIds: nextCompletedIds,
                            deletedIds: nextDeletedIds,
                            tasks: newTasks,
                        };
                    });
                },

                updateTaskTitle: (id, title) => {
                    set((state) => {
                        const task = state.tasks[id];
                        if (!task) return state;
                        const now = Date.now();
                        return {
                            tasks: {
                                ...state.tasks,
                                [id]: { ...task, title, updatedAt: nextUpdatedAt(task.updatedAt, now) }
                            }
                        };
                    });
                },

                toggleSubtasks: (taskId) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: {
                                    ...task,
                                    ui: { ...task.ui, subtasksOpen: !task.ui.subtasksOpen }
                                }
                            }
                        };
                    });
                },

                toggleShowCompletedSubtasks: (taskId) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        const current = task.ui.showCompletedSubtasks ?? false;
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: {
                                    ...task,
                                    ui: { ...task.ui, showCompletedSubtasks: !current }
                                }
                            }
                        };
                    });
                },

                addSubtask: (taskId, text) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        const now = Date.now();
                        const newSubtask = {
                            id: crypto.randomUUID(),
                            text,
                            done: false,
                            createdAt: now,
                        };
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: {
                                    ...task,
                                    subtasks: [...task.subtasks, newSubtask],
                                    updatedAt: nextUpdatedAt(task.updatedAt, now),
                                }
                            }
                        };
                    });
                },

                toggleSubtask: (taskId, subtaskId) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        const now = Date.now();
                        const newSubtasks = task.subtasks.map((st) => {
                            if (st.id !== subtaskId) return st;
                            const nextDone = !st.done;
                            return { ...st, done: nextDone, doneAt: nextDone ? now : undefined };
                        });
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: { ...task, subtasks: newSubtasks, updatedAt: nextUpdatedAt(task.updatedAt, now) }
                            }
                        };
                    });
                },

                toggleNotes: (taskId) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: {
                                    ...task,
                                    ui: { ...task.ui, notesOpen: !task.ui.notesOpen }
                                }
                            }
                        };
                    });
                },

                updateNotes: (taskId, markdown) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        const now = Date.now();
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: { ...task, notesMd: markdown, updatedAt: nextUpdatedAt(task.updatedAt, now) }
                            }
                        };
                    });
                },

                toggleAttachments: (taskId) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: {
                                    ...task,
                                    ui: { ...task.ui, attachmentsOpen: !task.ui.attachmentsOpen }
                                }
                            }
                        };
                    });
                },

                addAttachment: (taskId, attachment) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        if (task.attachments.some((x) => x.id === attachment.id)) return state;

                        const now = Date.now();
                        const updatedAt = nextUpdatedAt(task.updatedAt, Math.max(now, attachment.createdAt));
                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: { ...task, attachments: [...task.attachments, attachment], updatedAt },
                            }
                        };
                    });
                },

                removeAttachment: (taskId, attachmentId) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        const idx = task.attachments.findIndex((x) => x.id === attachmentId);
                        if (idx < 0) return state;

                        const existing = task.attachments[idx];
                        if (typeof existing.removedAt === 'number') return state;

                        const now = Date.now();
                        const updatedAt = nextUpdatedAt(task.updatedAt, now);
                        const nextAttachments = task.attachments.slice();
                        nextAttachments[idx] = { ...existing, removedAt: updatedAt };

                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: { ...task, attachments: nextAttachments, updatedAt },
                            }
                        };
                    });
                },

                setAttachmentCloudPath: (taskId, attachmentId, cloudPath) => {
                    set((state) => {
                        const task = state.tasks[taskId];
                        if (!task) return state;
                        const idx = task.attachments.findIndex((x) => x.id === attachmentId);
                        if (idx < 0) return state;

                        const existing = task.attachments[idx];
                        if (existing.cloudPath === cloudPath) return state;

                        const now = Date.now();
                        const updatedAt = nextUpdatedAt(task.updatedAt, now);
                        const nextAttachments = task.attachments.slice();
                        nextAttachments[idx] = { ...existing, cloudPath };

                        return {
                            tasks: {
                                ...state.tasks,
                                [taskId]: { ...task, attachments: nextAttachments, updatedAt },
                            }
                        };
                    });
                },

                tick: () => {
                    if (get().snoozedIds.length === 0) return 0;
                    let enqueuedCount = 0;

                    set((state) => {
                        const { snoozedIds, tasks, wokenQueue, readyQueue, currentTaskId, completedIds } = state;
                        if (snoozedIds.length === 0) return state;

                        const now = Date.now();
                        let hasDue = false;
                        for (let i = 0; i < snoozedIds.length; i += 1) {
                            const id = snoozedIds[i];
                            const until = tasks[id]?.snoozeUntil;
                            if (typeof until === 'number' && until <= now) {
                                hasDue = true;
                                break;
                            }
                        }
                        if (!hasDue) return state;

                        type DueEntry = { id: TaskId; until: number; seq: number; index: number };

                        const due: DueEntry[] = [];
                        const remainSnoozedIds: TaskId[] = [];

                        for (let i = 0; i < snoozedIds.length; i += 1) {
                            const id = snoozedIds[i];
                            const task = tasks[id];
                            const until = task?.snoozeUntil;
                            if (typeof until === 'number' && until <= now) {
                                const seq = typeof task.snoozeSeq === 'number' ? task.snoozeSeq : i;
                                due.push({ id, until, seq, index: i });
                                continue;
                            }
                            remainSnoozedIds.push(id);
                        }

                        if (due.length === 0) return state;

                        due.sort((a, b) => a.until - b.until || a.seq - b.seq || a.index - b.index);

                        const existing = new Set<TaskId>();
                        if (currentTaskId) existing.add(currentTaskId);
                        wokenQueue.forEach((id) => existing.add(id));
                        readyQueue.forEach((id) => existing.add(id));
                        completedIds.forEach((id) => existing.add(id));

                        const enqueuedIds: TaskId[] = [];
                        const updatedTasks: Record<TaskId, Task> = { ...tasks };

                        due.forEach(({ id }) => {
                            const task = tasks[id];
                            if (task) {
                                updatedTasks[id] = { ...task, snoozeUntil: undefined, snoozeSeq: undefined };
                            }

                            if (existing.has(id)) return;
                            existing.add(id);
                            enqueuedIds.push(id);
                        });

                        enqueuedCount = enqueuedIds.length;

                        let nextWokenQueue = wokenQueue;
                        if (enqueuedIds.length > 0) {
                            nextWokenQueue = [...wokenQueue, ...enqueuedIds];
                        }

                        let nextReadyQueue = readyQueue;
                        let nextCurrentId = currentTaskId;

                        // If current is empty, take next (Wake > Ready).
                        if (!nextCurrentId) {
                            const pick = takeNextTaskId(nextWokenQueue, nextReadyQueue);
                            nextCurrentId = pick.nextId;
                            nextWokenQueue = pick.wokenQueue;
                            nextReadyQueue = pick.readyQueue;
                        }

                        return {
                            snoozedIds: remainSnoozedIds,
                            wokenQueue: nextWokenQueue,
                            readyQueue: nextReadyQueue,
                            currentTaskId: nextCurrentId,
                            tasks: updatedTasks,
                        };
                    });

                    return enqueuedCount;
                },

                restoreTask: (id: TaskId) => {
                    set((state) => {
                        const { completedIds, wokenQueue, readyQueue, currentTaskId, tasks } = state;
                        if (!completedIds.includes(id)) return state;

                        const now = Date.now();
                        const newCompletedIds = completedIds.filter(cid => cid !== id);
                        let newReadyQueue = [...readyQueue, id];

                        // If current is empty, take head (which is this one if queue was empty)
                        let newCurrentId = currentTaskId;
                        let newWokenQueue = wokenQueue;
                        if (!newCurrentId) {
                            const pick = takeNextTaskId(newWokenQueue, newReadyQueue);
                            newCurrentId = pick.nextId;
                            newWokenQueue = pick.wokenQueue;
                            newReadyQueue = pick.readyQueue;
                        }

                        const task = tasks[id];
                        const restoredAt = task ? nextUpdatedAt(task.updatedAt, now) : now;
                        const updatedTasks = task
                            ? { ...tasks, [id]: { ...task, restoredAt, updatedAt: restoredAt } }
                            : tasks;

                        return {
                            completedIds: newCompletedIds,
                            wokenQueue: newWokenQueue,
                            readyQueue: newReadyQueue,
                            currentTaskId: newCurrentId,
                            tasks: updatedTasks,
                        };
                    });
                },

                clearHistory: () => {
                    set((state) => {
                        const { completedIds, deletedIds, tasks, currentTaskId, wokenQueue, readyQueue, snoozedIds } = state;
                        if (completedIds.length === 0) return state;

                        const referencedIds = new Set<TaskId>();
                        if (currentTaskId) referencedIds.add(currentTaskId);
                        wokenQueue.forEach((id) => referencedIds.add(id));
                        readyQueue.forEach((id) => referencedIds.add(id));
                        snoozedIds.forEach((id) => referencedIds.add(id));

                        const updatedTasks = { ...tasks };
                        const deletedIdSet = new Set(deletedIds);
                        const nextDeletedIds = [...deletedIds];
                        completedIds.forEach((id) => {
                            if (!referencedIds.has(id)) {
                                delete updatedTasks[id];
                                if (!deletedIdSet.has(id)) {
                                    deletedIdSet.add(id);
                                    nextDeletedIds.push(id);
                                }
                            }
                        });

                        return { completedIds: [], deletedIds: nextDeletedIds.slice().sort(), tasks: updatedTasks };
                    });
                }
                };
            },
            {
                name: STORAGE_KEY,
                version: 4,
                storage: createJSONStorage(() => createDebouncedLocalStorage()),
                migrate: (persisted, persistedVersion) => {
                    if (!isRecord(persisted)) return initialAppState;

                    const data = persisted;
                    const rev =
                        typeof data.rev === 'number' && Number.isFinite(data.rev) ? Math.max(0, Math.floor(data.rev)) : 0;
                    const updatedAt =
                        typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now();
                    const clientId =
                        typeof data.clientId === 'string' && data.clientId.trim().length > 0 ? data.clientId : LOCAL_CLIENT_ID;
                    const tasksValue = isRecord(data.tasks) ? data.tasks : {};

                    const deletedIds = (isStringArray(data.deletedIds) ? data.deletedIds : []).filter((id) => typeof id === 'string');
                    const deletedIdSet = new Set<TaskId>(deletedIds);
                    deletedIds.forEach((id) => {
                        if (id in tasksValue) {
                            delete tasksValue[id];
                        }
                    });

                    const allIds = new Set<TaskId>(Object.keys(tasksValue));

                    const uniqueExistingIds = (value: unknown): TaskId[] => {
                        if (!isStringArray(value)) return [];
                        const out: TaskId[] = [];
                        const seen = new Set<TaskId>();
                        value.forEach((id) => {
                            if (!allIds.has(id)) return;
                            if (seen.has(id)) return;
                            seen.add(id);
                            out.push(id);
                        });
                        return out;
                    };

                    let currentTaskId: TaskId | null =
                        data.currentTaskId == null ? null : (data.currentTaskId as TaskId);
                    if (currentTaskId !== null && typeof currentTaskId !== 'string') currentTaskId = null;
                    if (currentTaskId !== null && !allIds.has(currentTaskId)) currentTaskId = null;

                    let maxSeq = 0;
                    Object.values(tasksValue).forEach((task) => {
                        if (!isRecord(task)) return;

                        if (!isRecord(task.ui)) {
                            task.ui = { subtasksOpen: false, notesOpen: false, attachmentsOpen: false, showCompletedSubtasks: false };
                        } else {
                            if (typeof task.ui.subtasksOpen !== 'boolean') task.ui.subtasksOpen = false;
                            if (typeof task.ui.notesOpen !== 'boolean') task.ui.notesOpen = false;
                            if (typeof task.ui.attachmentsOpen !== 'boolean') task.ui.attachmentsOpen = false;
                            if (typeof task.ui.showCompletedSubtasks !== 'boolean') task.ui.showCompletedSubtasks = false;
                        }

                        if (!Array.isArray(task.attachments)) {
                            task.attachments = [];
                        } else {
                            const seen = new Set<string>();
                            const normalized: unknown[] = [];
                            task.attachments.forEach((att) => {
                                if (!isRecord(att)) return;

                                const id = typeof att.id === 'string' && att.id.trim().length > 0 ? att.id.trim() : crypto.randomUUID();
                                if (seen.has(id)) return;
                                seen.add(id);

                                const name = typeof att.name === 'string' ? att.name : '';
                                const mimeType = typeof att.mimeType === 'string' ? att.mimeType : 'application/octet-stream';
                                const size =
                                    typeof att.size === 'number' && Number.isFinite(att.size) && att.size >= 0
                                        ? Math.floor(att.size)
                                        : 0;
                                const createdAt =
                                    typeof att.createdAt === 'number' && Number.isFinite(att.createdAt)
                                        ? att.createdAt
                                        : typeof task.createdAt === 'number' && Number.isFinite(task.createdAt)
                                            ? task.createdAt
                                            : Date.now();
                                const removedAt =
                                    typeof att.removedAt === 'number' && Number.isFinite(att.removedAt) ? att.removedAt : undefined;
                                const cloudPath = typeof att.cloudPath === 'string' ? att.cloudPath.trim() : '';

                                const normalizedAtt: Record<string, unknown> = {
                                    id,
                                    name,
                                    mimeType,
                                    size,
                                    createdAt,
                                };
                                if (typeof removedAt === 'number') normalizedAtt.removedAt = removedAt;
                                if (cloudPath) normalizedAtt.cloudPath = cloudPath;
                                normalized.push(normalizedAtt);
                            });
                            task.attachments = normalized;
                        }

                        if (typeof task.snoozeUntil !== 'number' || !Number.isFinite(task.snoozeUntil)) {
                            delete task.snoozeUntil;
                        }

                        if (typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) {
                            delete task.snoozeSeq;
                        } else {
                            const normalizedSeq = Math.floor(task.snoozeSeq);
                            task.snoozeSeq = normalizedSeq;
                            maxSeq = Math.max(maxSeq, normalizedSeq);
                        }
                    });

                    const completedIds = uniqueExistingIds(data.completedIds).filter((id) => id !== currentTaskId);
                    const completedIdSet = new Set(completedIds);

                    const computedSnoozed: TaskId[] = [];
                    Object.entries(tasksValue).forEach(([id, task]) => {
                        if (!isRecord(task)) return;
                        if (typeof task.snoozeUntil !== 'number') return;
                        if (!Number.isFinite(task.snoozeUntil)) return;
                        computedSnoozed.push(id);
                    });

                    const importedSnoozed = uniqueExistingIds(data.snoozedIds).filter((id) => {
                        const task = tasksValue[id];
                        return (
                            !completedIdSet.has(id) &&
                            id !== currentTaskId &&
                            isRecord(task) &&
                            typeof task.snoozeUntil === 'number' &&
                            Number.isFinite(task.snoozeUntil)
                        );
                    });

                    const snoozedSet = new Set<TaskId>(importedSnoozed);
                    const snoozedIds = [...importedSnoozed];
                    computedSnoozed.forEach((id) => {
                        if (id === currentTaskId) return;
                        if (completedIdSet.has(id)) return;
                        if (snoozedSet.has(id)) return;
                        snoozedSet.add(id);
                        snoozedIds.push(id);
                    });

                    snoozedIds.forEach((id) => {
                        const task = tasksValue[id];
                        if (!isRecord(task)) return;
                        if (typeof task.snoozeUntil !== 'number') return;
                        if (typeof task.snoozeSeq === 'number' && Number.isFinite(task.snoozeSeq)) return;
                        maxSeq += 1;
                        task.snoozeSeq = maxSeq;
                    });

                    let nextSnoozeSeq = 1;
                    const candidateNextSeq = data.nextSnoozeSeq;
                    if (typeof candidateNextSeq === 'number' && Number.isFinite(candidateNextSeq) && candidateNextSeq > 0) {
                        nextSnoozeSeq = Math.floor(candidateNextSeq);
                    } else {
                        nextSnoozeSeq = maxSeq + 1;
                    }
                    if (nextSnoozeSeq <= maxSeq) nextSnoozeSeq = maxSeq + 1;

                    let wokenQueue = uniqueExistingIds(data.wokenQueue).filter((id) => id !== currentTaskId);
                    wokenQueue = wokenQueue.filter((id) => !completedIdSet.has(id) && !snoozedSet.has(id));
                    const wokenIdSet = new Set(wokenQueue);

                    let readyQueue = uniqueExistingIds(data.readyQueue).filter((id) => id !== currentTaskId);
                    readyQueue = readyQueue.filter((id) => !completedIdSet.has(id) && !snoozedSet.has(id) && !wokenIdSet.has(id));

                    if (!currentTaskId) {
                        if (wokenQueue.length > 0) {
                            currentTaskId = wokenQueue[0];
                            wokenQueue = wokenQueue.slice(1);
                        } else if (readyQueue.length > 0) {
                            currentTaskId = readyQueue[0];
                            readyQueue = readyQueue.slice(1);
                        }
                    }

                    const inputVersion = typeof data.version === 'number' && Number.isFinite(data.version) ? Math.floor(data.version) : 1;
                    const version = Math.max(2, inputVersion);

                    // Preserve v0/v1 data; v2 is the current schema.
                    void persistedVersion;
                    return {
                        rev,
                        updatedAt,
                        clientId,
                        version,
                        currentTaskId,
                        wokenQueue,
                        readyQueue,
                        snoozedIds,
                        completedIds,
                        deletedIds: Array.from(deletedIdSet).sort(),
                        tasks: tasksValue as Record<TaskId, Task>,
                        nextSnoozeSeq,
                    };
                },
                partialize: (state) => {
                    // Only persist data, not actions
                    const { rev, updatedAt, clientId, version, currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, deletedIds, tasks, nextSnoozeSeq } =
                        state;
                    return { rev, updatedAt, clientId, version, currentTaskId, wokenQueue, readyQueue, snoozedIds, completedIds, deletedIds, tasks, nextSnoozeSeq };
                },
            }
        ),
        {
            limit: 50, // Undo stack size
            // Prevent no-op state setters (e.g. periodic tick) from polluting history.
            equality: (pastState, currentState) => Object.is(pastState, currentState),
            // Helper to get handle to undo/redo from hook if needed, but zundo usually exposes useStore.temporal.getState()
        }
    )
);
