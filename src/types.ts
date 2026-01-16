export type TaskId = string;

export interface Subtask {
    id: string;
    text: string;
    done: boolean;
    createdAt: number;
    doneAt?: number;
}

export interface TaskUIState {
    subtasksOpen: boolean;
    notesOpen: boolean;
    showCompletedSubtasks?: boolean;
}

export interface Task {
    id: TaskId;
    title: string;
    createdAt: number;
    updatedAt: number;
    doneAt?: number;
    subtasks: Subtask[];
    notesMd: string;
    ui: TaskUIState;
    snoozeUntil?: number;
    snoozeSeq?: number;
}

export interface AppState {
    rev: number;
    updatedAt: number;
    clientId: string;
    version: number;
    currentTaskId: TaskId | null;
    wokenQueue: TaskId[];
    readyQueue: TaskId[];
    snoozedIds: TaskId[];
    completedIds: TaskId[];
    tasks: Record<TaskId, Task>;
    nextSnoozeSeq: number;
}
