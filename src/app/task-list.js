export { setTaskCompletion } from "../../backend/api/src/app-data-contract.mjs";

export const COMPLETION_MOVE_DELAY = 500;

const taskTitle = (task) => task.title;

/** @template {{ id: string, title: string }} T
 * @param {T[]} tasks @param {Set<string>} draftTaskIds @returns {T[]}
 */
export function serializableTasks(
  tasks,
  draftTaskIds,
  getTaskTitle = taskTitle,
) {
  return tasks.filter(
    (task) => !draftTaskIds.has(task.id) || getTaskTitle(task).trim(),
  );
}

export function finishTaskDraft(
  tasks,
  task,
  draftTaskIds,
  getTaskTitle = taskTitle,
) {
  if (!draftTaskIds.delete(task.id) || getTaskTitle(task).trim()) return false;
  const taskIndex = tasks.findIndex((item) => item.id === task.id);
  if (taskIndex !== -1) tasks.splice(taskIndex, 1);
  return taskIndex !== -1;
}

export function completedTasksLast(tasks) {
  return [
    ...tasks.filter((task) => !task.completed),
    ...tasks.filter((task) => task.completed),
  ];
}

export function nextEntityId(items, prefix) {
  const usedIds = new Set(items.map((item) => item.id));
  let index = items.length + 1;
  while (usedIds.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function moveItemForCompletion(items, item, completed) {
  const itemIndex = items.indexOf(item);
  const destination = completed ? items.length - 1 : 0;
  if (itemIndex === -1 || itemIndex === destination) return false;
  items.splice(itemIndex, 1);
  items.splice(destination, 0, item);
  return true;
}

export function createCompletionMoveScheduler(
  delay = COMPLETION_MOVE_DELAY,
  clock = globalThis,
) {
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
    schedule(id, move) {
      cancel(id);
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
