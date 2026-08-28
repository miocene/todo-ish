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
