export type TaskId = string;
export type AttachmentId = string;

export interface TaskAttachment {
    id: AttachmentId;
    name: string;
    mimeType: string;
    size: number;
    createdAt: number;
    removedAt?: number;
    cloudPath?: string;
}

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
    attachmentsOpen: boolean;
    showCompletedSubtasks?: boolean;
}

export interface Task {
    id: TaskId;
    title: string;
    createdAt: number;
    updatedAt: number;
    doneAt?: number;
    restoredAt?: number;
    attachments: TaskAttachment[];
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
    deletedIds: TaskId[];
    tasks: Record<TaskId, Task>;
    nextSnoozeSeq: number;
}
