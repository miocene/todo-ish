export function stitchProgress(project) {
  const threads = project.threads || [];
  const total = threads.reduce((sum, thread) => sum + Math.max(0, Number(thread.totalCrosses) || 0), 0);
  const completed = threads.reduce(
    (sum, thread) =>
      sum + Math.min(Math.max(0, Number(thread.completedCrosses) || 0), Math.max(0, Number(thread.totalCrosses) || 0)),
    0,
  );
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 1000) / 10 : 0,
  };
}

export function stitchStatusFromThreads(project) {
  if (project.abandoned) return "Abandoned";
  const threads = project.threads || [];
  if (!threads.length) return "Planned";
  if (
    threads.every(
      (thread) => Number(thread.totalCrosses) > 0 && Number(thread.completedCrosses) >= Number(thread.totalCrosses),
    )
  )
    return "Completed";
  if (threads.some((thread) => Number(thread.completedCrosses) > 0)) return "In progress";
  return "Planned";
}
