import type { AppState, Task, TaskAttachment, TaskId } from '../../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueIds(ids: TaskId[]): TaskId[] {
  const seen = new Set<TaskId>();
  const out: TaskId[] = [];
  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

export function normalizeAppState(raw: unknown): AppState {
  const root = isRecord(raw) ? raw : null;
  const candidate = root && isRecord(root.state) ? root.state : root;
  if (!isRecord(candidate)) throw new Error('Invalid state payload.');

  const tasksRaw = candidate.tasks;
  if (!isRecord(tasksRaw)) throw new Error('Invalid state payload: missing tasks.');

  const now = Date.now();

  const normalizedTasks: Record<TaskId, Task> = {};
  Object.entries(tasksRaw).forEach(([id, value]) => {
    if (!isRecord(value)) throw new Error(`Invalid task: ${id}`);

    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (!title) throw new Error(`Invalid task title: ${id}`);

    const createdAt = typeof value.createdAt === 'number' ? value.createdAt : now;
    const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : createdAt;
    const doneAt = typeof value.doneAt === 'number' ? value.doneAt : undefined;
    const restoredAt = typeof value.restoredAt === 'number' ? value.restoredAt : undefined;

    const attachmentsRaw = Array.isArray(value.attachments) ? value.attachments : [];
    const attachments: TaskAttachment[] = [];
    const seenAttachments = new Set<string>();
    attachmentsRaw.forEach((att) => {
      if (!isRecord(att)) return;

      const attId = typeof att.id === 'string' && att.id.trim().length > 0 ? att.id.trim() : crypto.randomUUID();
      if (seenAttachments.has(attId)) return;
      seenAttachments.add(attId);

      const name = typeof att.name === 'string' ? att.name : '';
      const mimeType = typeof att.mimeType === 'string' ? att.mimeType : 'application/octet-stream';
      const size =
        typeof att.size === 'number' && Number.isFinite(att.size) && att.size >= 0 ? Math.floor(att.size) : 0;
      const createdAt =
        typeof att.createdAt === 'number' && Number.isFinite(att.createdAt) ? att.createdAt : now;
      const removedAt =
        typeof att.removedAt === 'number' && Number.isFinite(att.removedAt) ? att.removedAt : undefined;
      const cloudPath = typeof att.cloudPath === 'string' ? att.cloudPath.trim() : '';

      const normalizedAtt: TaskAttachment = {
        id: attId,
        name: name || 'Attachment',
        mimeType,
        size,
        createdAt,
        removedAt,
        cloudPath: cloudPath || undefined,
      };

      attachments.push(normalizedAtt);
    });

    const subtasksRaw = Array.isArray(value.subtasks) ? value.subtasks : [];
    const subtasks = subtasksRaw.map((st, idx) => {
      if (!isRecord(st)) throw new Error(`Invalid subtask: ${id}[${idx}]`);
      return {
        id: typeof st.id === 'string' ? st.id : crypto.randomUUID(),
        text: typeof st.text === 'string' ? st.text : '',
        done: typeof st.done === 'boolean' ? st.done : false,
        createdAt: typeof st.createdAt === 'number' ? st.createdAt : now,
        doneAt: typeof st.doneAt === 'number' ? st.doneAt : undefined,
      };
    });

    const uiRaw = isRecord(value.ui) ? value.ui : {};
    const ui = {
      subtasksOpen: typeof uiRaw.subtasksOpen === 'boolean' ? uiRaw.subtasksOpen : false,
      notesOpen: typeof uiRaw.notesOpen === 'boolean' ? uiRaw.notesOpen : false,
      attachmentsOpen: typeof uiRaw.attachmentsOpen === 'boolean' ? uiRaw.attachmentsOpen : false,
      showCompletedSubtasks: typeof uiRaw.showCompletedSubtasks === 'boolean' ? uiRaw.showCompletedSubtasks : false,
    };

    const snoozeUntil = typeof value.snoozeUntil === 'number' ? value.snoozeUntil : undefined;
    const snoozeSeq = typeof value.snoozeSeq === 'number' ? value.snoozeSeq : undefined;
    const notesMd = typeof value.notesMd === 'string' ? value.notesMd : '';

    normalizedTasks[id] = {
      id,
      title,
      createdAt,
      updatedAt,
      doneAt,
      restoredAt,
      attachments,
      subtasks,
      notesMd,
      ui,
      snoozeUntil,
      snoozeSeq,
    };
  });

  const deletedIds = uniqueIds(
    Array.isArray(candidate.deletedIds) && candidate.deletedIds.every((x) => typeof x === 'string')
      ? (candidate.deletedIds as TaskId[])
      : []
  ).sort();

  deletedIds.forEach((id) => {
    delete normalizedTasks[id];
  });

  const allIds = new Set<TaskId>(Object.keys(normalizedTasks));
  const filterIds = (value: unknown, label: string) => {
    if (value == null) return [];
    if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) throw new Error(`Invalid ${label}.`);
    return value.filter((id) => allIds.has(id));
  };

  const rev = typeof candidate.rev === 'number' && Number.isFinite(candidate.rev) ? Math.max(0, Math.floor(candidate.rev)) : 0;
  const updatedAt = typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : now;
  const clientId =
    typeof candidate.clientId === 'string' && candidate.clientId.trim().length > 0 ? candidate.clientId : crypto.randomUUID();

  const version = Math.max(2, typeof candidate.version === 'number' ? candidate.version : 1);
  let currentTaskId: TaskId | null = candidate.currentTaskId == null ? null : (candidate.currentTaskId as TaskId);
  if (currentTaskId !== null && typeof currentTaskId !== 'string') throw new Error('Invalid currentTaskId.');
  if (currentTaskId !== null && !allIds.has(currentTaskId)) currentTaskId = null;

  let wokenQueue = uniqueIds(filterIds(candidate.wokenQueue, 'wokenQueue')).filter((id) => id !== currentTaskId);
  let readyQueue = uniqueIds(filterIds(candidate.readyQueue, 'readyQueue')).filter((id) => id !== currentTaskId);

  const computedSnoozed = Object.keys(normalizedTasks).filter((id) => typeof normalizedTasks[id]?.snoozeUntil === 'number');
  const importedSnoozed = uniqueIds(filterIds(candidate.snoozedIds, 'snoozedIds')).filter(
    (id) => typeof normalizedTasks[id]?.snoozeUntil === 'number'
  );
  const snoozedIds = [...importedSnoozed, ...computedSnoozed.filter((id) => !importedSnoozed.includes(id))].filter(
    (id) => id !== currentTaskId
  );

  const completedIds = uniqueIds(filterIds(candidate.completedIds, 'completedIds')).filter((id) => id !== currentTaskId);

  let maxSeq = 0;
  Object.values(normalizedTasks).forEach((task) => {
    if (!task || typeof task.snoozeSeq !== 'number' || !Number.isFinite(task.snoozeSeq)) return;
    task.snoozeSeq = Math.floor(task.snoozeSeq);
    maxSeq = Math.max(maxSeq, task.snoozeSeq);
  });
  snoozedIds.forEach((id) => {
    const task = normalizedTasks[id];
    if (!task || typeof task.snoozeUntil !== 'number') return;
    if (typeof task.snoozeSeq === 'number' && Number.isFinite(task.snoozeSeq)) return;
    maxSeq += 1;
    task.snoozeSeq = maxSeq;
  });

  wokenQueue = wokenQueue.filter((id) => !snoozedIds.includes(id) && !completedIds.includes(id));
  readyQueue = readyQueue.filter((id) => !wokenQueue.includes(id) && !snoozedIds.includes(id) && !completedIds.includes(id));

  if (!currentTaskId) {
    if (wokenQueue.length > 0) {
      currentTaskId = wokenQueue[0];
      wokenQueue = wokenQueue.slice(1);
    } else if (readyQueue.length > 0) {
      currentTaskId = readyQueue[0];
      readyQueue = readyQueue.slice(1);
    }
  }

  const nextSnoozeSeq = (() => {
    const candidateSeq = candidate.nextSnoozeSeq;
    if (typeof candidateSeq === 'number' && Number.isFinite(candidateSeq) && candidateSeq > 0) {
      const normalized = Math.floor(candidateSeq);
      return normalized <= maxSeq ? maxSeq + 1 : normalized;
    }
    return maxSeq + 1;
  })();

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
    deletedIds,
    tasks: normalizedTasks,
    nextSnoozeSeq,
  };
}

