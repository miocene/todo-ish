export const COMPLETION_MOVE_DELAY = 500;

const taskTitle = (task) => task.title;

export function serializableTasks(tasks, draftTaskIds, getTaskTitle = taskTitle) {
  return tasks.filter((task) => !draftTaskIds.has(task.id) || getTaskTitle(task).trim());
}

export function finishTaskDraft(tasks, task, draftTaskIds, getTaskTitle = taskTitle) {
  if (!draftTaskIds.delete(task.id) || getTaskTitle(task).trim()) return false;
  const taskIndex = tasks.findIndex((item) => item.id === task.id);
  if (taskIndex !== -1) tasks.splice(taskIndex, 1);
  return taskIndex !== -1;
}

export function completedTasksLast(tasks) {
  return [...tasks.filter((task) => !task.completed), ...tasks.filter((task) => task.completed)];
}

export function setTaskCompletion(task, completed, completedAt = new Date().toISOString()) {
  task.completed = completed;
  task.completedAt = completed ? completedAt : undefined;
}

export function nextEntityId(items, prefix) {
  const usedIds = new Set(items.map((item) => item.id));
  let index = items.length + 1;
  while (usedIds.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function moveItemToEnd(items, item) {
  const itemIndex = items.indexOf(item);
  if (itemIndex === -1 || itemIndex === items.length - 1) return false;
  items.splice(itemIndex, 1);
  items.push(item);
  return true;
}

export function createCompletionMoveScheduler(delay = COMPLETION_MOVE_DELAY, clock = globalThis) {
  const timers = new Map();

  function cancel(id) {
    clock.clearTimeout(timers.get(id));
    timers.delete(id);
  }

  return {
    cancel,
    clear() {
      for (const id of timers.keys()) cancel(id);
    },
    schedule(id, completed, move) {
      cancel(id);
      if (!completed) return;
      timers.set(
        id,
        clock.setTimeout(() => {
          timers.delete(id);
          move();
        }, delay),
      );
    },
  };
}
