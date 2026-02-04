import type { AppState, Task, TaskId } from '../../types';

function orderKey(state: Pick<AppState, 'updatedAt' | 'rev' | 'clientId'>) {
  return { updatedAt: state.updatedAt, rev: state.rev, clientId: state.clientId };
}

function compareOrderKey(
  a: ReturnType<typeof orderKey>,
  b: ReturnType<typeof orderKey>
): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  if (a.rev !== b.rev) return a.rev - b.rev;
  return a.clientId.localeCompare(b.clientId);
}

function pickNewerByOrderKey(a: AppState, b: AppState): AppState {
  return compareOrderKey(orderKey(a), orderKey(b)) >= 0 ? a : b;
}

function pickNewerTask(a: Task, b: Task, tieBreaker: AppState): Task {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return tieBreaker.tasks[a.id] === a ? a : b;
}

function maxOptionalNumber(a: number | undefined, b: number | undefined): number | undefined {
  if (typeof a !== 'number') return typeof b === 'number' ? b : undefined;
  if (typeof b !== 'number') return a;
  return Math.max(a, b);
}

function isCompleted(task: Pick<Task, 'doneAt' | 'restoredAt'>): boolean {
  const doneAt = task.doneAt ?? -1;
  const restoredAt = task.restoredAt ?? -1;
  return doneAt > restoredAt;
}

function uniqueSortedIds(ids: Iterable<TaskId>): TaskId[] {
  return Array.from(new Set(ids)).sort();
}

function sortIdsByCreatedAt(tasks: Record<TaskId, Task>, ids: TaskId[]): TaskId[] {
  return ids.slice().sort((x, y) => tasks[x].createdAt - tasks[y].createdAt || x.localeCompare(y));
}

export function mergeAppState(a: AppState, b: AppState): AppState {
  const newer = pickNewerByOrderKey(a, b);

  const deletedIdSet = new Set<TaskId>();
  a.deletedIds.forEach((id) => deletedIdSet.add(id));
  b.deletedIds.forEach((id) => deletedIdSet.add(id));
  const deletedIds = Array.from(deletedIdSet).sort();

  const allTaskIds = new Set<TaskId>();
  Object.keys(a.tasks).forEach((id) => allTaskIds.add(id as TaskId));
  Object.keys(b.tasks).forEach((id) => allTaskIds.add(id as TaskId));

  const mergedTasks: Record<TaskId, Task> = {};
  allTaskIds.forEach((id) => {
    if (deletedIdSet.has(id)) return;

    const taskA = a.tasks[id];
    const taskB = b.tasks[id];
    if (!taskA && !taskB) return;

    const base = taskA && taskB ? pickNewerTask(taskA, taskB, newer) : (taskA ?? taskB)!;

    const createdAt = taskA && taskB ? Math.min(taskA.createdAt, taskB.createdAt) : base.createdAt;
    const doneAt = maxOptionalNumber(taskA?.doneAt, taskB?.doneAt);
    const restoredAt = maxOptionalNumber(taskA?.restoredAt, taskB?.restoredAt);

    // Ensure the merged task carries forward status clock updates.
    const nextUpdatedAt = Math.max(base.updatedAt, doneAt ?? -1, restoredAt ?? -1);

    mergedTasks[id] = {
      ...base,
      id,
      createdAt,
      updatedAt: nextUpdatedAt,
      doneAt,
      restoredAt,
    };
  });

  const completedEntries: { id: TaskId; doneAt: number }[] = [];
  Object.entries(mergedTasks).forEach(([id, task]) => {
    if (!isCompleted(task)) return;
    if (typeof task.doneAt !== 'number') return;
    completedEntries.push({ id: id as TaskId, doneAt: task.doneAt });
  });
  completedEntries.sort((x, y) => y.doneAt - x.doneAt || x.id.localeCompare(y.id));
  const completedIds = completedEntries.map((x) => x.id);
  const completedSet = new Set(completedIds);

  let maxSnoozeSeq = 0;
  Object.values(mergedTasks).forEach((task) => {
    if (typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) return;
    task.snoozeSeq = Math.floor(task.snoozeSeq);
    maxSnoozeSeq = Math.max(maxSnoozeSeq, task.snoozeSeq);
  });

  const snoozedEntries: { id: TaskId; until: number; seq: number }[] = [];
  Object.entries(mergedTasks).forEach(([id, task]) => {
    if (completedSet.has(id as TaskId)) return;
    if (typeof task.snoozeUntil !== 'number' || !Number.isFinite(task.snoozeUntil)) return;
    if (typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) {
      maxSnoozeSeq += 1;
      task.snoozeSeq = maxSnoozeSeq;
    }
    snoozedEntries.push({ id: id as TaskId, until: task.snoozeUntil, seq: task.snoozeSeq });
  });
  snoozedEntries.sort((x, y) => x.until - y.until || x.seq - y.seq || x.id.localeCompare(y.id));
  const snoozedIds = snoozedEntries.map((x) => x.id);
  const snoozedSet = new Set(snoozedIds);

  const activeIdSet = new Set<TaskId>();
  Object.keys(mergedTasks).forEach((id) => {
    const taskId = id as TaskId;
    if (completedSet.has(taskId)) return;
    if (snoozedSet.has(taskId)) return;
    activeIdSet.add(taskId);
  });

  let currentTaskId: TaskId | null = newer.currentTaskId;
  if (currentTaskId != null && !activeIdSet.has(currentTaskId)) currentTaskId = null;

  const seenActive = new Set<TaskId>();

  const wokenQueue: TaskId[] = [];
  newer.wokenQueue.forEach((id) => {
    if (id === currentTaskId) return;
    if (!activeIdSet.has(id)) return;
    if (seenActive.has(id)) return;
    seenActive.add(id);
    wokenQueue.push(id);
  });

  const wokenSet = new Set(wokenQueue);
  const readyQueue: TaskId[] = [];
  newer.readyQueue.forEach((id) => {
    if (id === currentTaskId) return;
    if (!activeIdSet.has(id)) return;
    if (wokenSet.has(id)) return;
    if (seenActive.has(id)) return;
    seenActive.add(id);
    readyQueue.push(id);
  });

  const missingActive: TaskId[] = [];
  activeIdSet.forEach((id) => {
    if (id === currentTaskId) return;
    if (seenActive.has(id)) return;
    missingActive.push(id);
  });
  missingActive.sort((x, y) => mergedTasks[x].createdAt - mergedTasks[y].createdAt || x.localeCompare(y));
  readyQueue.push(...missingActive);

  if (!currentTaskId) {
    if (wokenQueue.length > 0) {
      currentTaskId = wokenQueue.shift() ?? null;
    } else if (readyQueue.length > 0) {
      currentTaskId = readyQueue.shift() ?? null;
    }
  }

  const nextSnoozeSeqCandidate = Math.max(
    Number.isFinite(a.nextSnoozeSeq) ? Math.floor(a.nextSnoozeSeq) : 1,
    Number.isFinite(b.nextSnoozeSeq) ? Math.floor(b.nextSnoozeSeq) : 1,
    maxSnoozeSeq + 1
  );
  const nextSnoozeSeq = nextSnoozeSeqCandidate <= maxSnoozeSeq ? maxSnoozeSeq + 1 : nextSnoozeSeqCandidate;

  return {
    rev: Math.max(a.rev, b.rev),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    clientId: newer.clientId,
    version: Math.max(a.version, b.version),
    currentTaskId,
    wokenQueue,
    readyQueue,
    snoozedIds,
    completedIds,
    deletedIds,
    tasks: mergedTasks,
    nextSnoozeSeq,
  };
}

export function mergeRemoteIntoLocalState(local: AppState, remote: AppState): AppState {
  const deletedIds = uniqueSortedIds([...local.deletedIds, ...remote.deletedIds]);
  const deletedIdSet = new Set(deletedIds);

  const mergedTasks: Record<TaskId, Task> = {};
  Object.entries(local.tasks).forEach(([id, task]) => {
    const taskId = id as TaskId;
    if (deletedIdSet.has(taskId)) return;
    mergedTasks[taskId] = { ...task };
  });

  Object.entries(remote.tasks).forEach(([id, task]) => {
    const taskId = id as TaskId;
    if (deletedIdSet.has(taskId)) return;
    if (mergedTasks[taskId]) return;
    mergedTasks[taskId] = { ...task };
  });

  Object.entries(remote.tasks).forEach(([id, remoteTask]) => {
    const taskId = id as TaskId;
    if (deletedIdSet.has(taskId)) return;
    const localTask = mergedTasks[taskId];
    if (!localTask) return;

    const doneAt = maxOptionalNumber(localTask.doneAt, remoteTask.doneAt);
    const restoredAt = maxOptionalNumber(localTask.restoredAt, remoteTask.restoredAt);
    if (doneAt === localTask.doneAt && restoredAt === localTask.restoredAt) return;

    mergedTasks[taskId] = {
      ...localTask,
      doneAt,
      restoredAt,
      updatedAt: Math.max(localTask.updatedAt, doneAt ?? -1, restoredAt ?? -1),
    };
  });

  const completedEntries: { id: TaskId; doneAt: number }[] = [];
  Object.entries(mergedTasks).forEach(([id, task]) => {
    if (!isCompleted(task)) return;
    if (typeof task.doneAt !== 'number') return;
    completedEntries.push({ id: id as TaskId, doneAt: task.doneAt });
  });
  completedEntries.sort((x, y) => y.doneAt - x.doneAt || x.id.localeCompare(y.id));
  const completedIds = completedEntries.map((x) => x.id);
  const completedSet = new Set(completedIds);

  let maxSnoozeSeq = 0;
  Object.values(mergedTasks).forEach((task) => {
    if (typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) return;
    task.snoozeSeq = Math.floor(task.snoozeSeq);
    maxSnoozeSeq = Math.max(maxSnoozeSeq, task.snoozeSeq);
  });

  const snoozedEntries: { id: TaskId; until: number; seq: number }[] = [];
  Object.entries(mergedTasks).forEach(([id, task]) => {
    if (completedSet.has(id as TaskId)) return;
    if (typeof task.snoozeUntil !== 'number' || !Number.isFinite(task.snoozeUntil)) return;
    if (typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) {
      maxSnoozeSeq += 1;
      task.snoozeSeq = maxSnoozeSeq;
    }
    snoozedEntries.push({ id: id as TaskId, until: task.snoozeUntil, seq: task.snoozeSeq });
  });
  snoozedEntries.sort((x, y) => x.until - y.until || x.seq - y.seq || x.id.localeCompare(y.id));
  const snoozedIds = snoozedEntries.map((x) => x.id);
  const snoozedSet = new Set(snoozedIds);

  const activeIds: TaskId[] = [];
  Object.keys(mergedTasks).forEach((id) => {
    const taskId = id as TaskId;
    if (completedSet.has(taskId)) return;
    if (snoozedSet.has(taskId)) return;
    activeIds.push(taskId);
  });
  const activeIdSet = new Set(activeIds);

  let currentTaskId: TaskId | null = local.currentTaskId;
  if (currentTaskId != null && !activeIdSet.has(currentTaskId)) currentTaskId = null;

  const seen = new Set<TaskId>();
  const wokenQueue: TaskId[] = [];
  local.wokenQueue.forEach((id) => {
    if (id === currentTaskId) return;
    if (!activeIdSet.has(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    wokenQueue.push(id);
  });

  const wokenSet = new Set(wokenQueue);
  const readyQueue: TaskId[] = [];
  local.readyQueue.forEach((id) => {
    if (id === currentTaskId) return;
    if (!activeIdSet.has(id)) return;
    if (wokenSet.has(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    readyQueue.push(id);
  });

  const missingActive = activeIds.filter((id) => id !== currentTaskId && !seen.has(id));
  readyQueue.push(...sortIdsByCreatedAt(mergedTasks, missingActive));

  if (!currentTaskId) {
    if (wokenQueue.length > 0) currentTaskId = wokenQueue.shift() ?? null;
    else if (readyQueue.length > 0) currentTaskId = readyQueue.shift() ?? null;
  }

  const nextSnoozeSeqCandidate = Math.max(
    Number.isFinite(local.nextSnoozeSeq) ? Math.floor(local.nextSnoozeSeq) : 1,
    Number.isFinite(remote.nextSnoozeSeq) ? Math.floor(remote.nextSnoozeSeq) : 1,
    maxSnoozeSeq + 1
  );
  const nextSnoozeSeq = nextSnoozeSeqCandidate <= maxSnoozeSeq ? maxSnoozeSeq + 1 : nextSnoozeSeqCandidate;

  return {
    rev: local.rev,
    updatedAt: local.updatedAt,
    clientId: local.clientId,
    version: Math.max(local.version, remote.version),
    currentTaskId,
    wokenQueue,
    readyQueue,
    snoozedIds,
    completedIds,
    deletedIds,
    tasks: mergedTasks,
    nextSnoozeSeq,
  };
}
