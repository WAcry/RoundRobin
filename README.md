# To Do Or Not To Do

A single-task, round-robin scheduler for your todos. It keeps your attention on **one** current task while everything else waits in a fair queue.

Try it now: https://to-do-or-not.vercel.app/

![Screenshot](./image.png)

## Highlights

- One-task focus UI
- Round-robin queue: quick **Defer** rotates the current task to the back
- Defer longer with presets; snoozed tasks wake back into the queue
- Subtasks + Markdown notes per task
- Undo/redo (Ctrl/Cmd+Z)
- Local-first: persists in `localStorage` + JSON export/import

## Core model

- **Add**: new tasks preempt the current one.
- **Complete**: moves the current task to history and loads the next queued one.
- **Defer**: rotate to the back (quick), or snooze until later (pick a duration/date).

## Quick start

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Data & privacy

All data stays in your browser. Storage key: `roundrobin.state.v1`.
