export function recordProjectActivity(
  history,
  project,
  previous,
  crossStitch,
  timestamp = new Date().toISOString(),
) {
  const record = (event) =>
    history.push({
      id: `activity-${crypto.randomUUID()}`,
      title: project.title,
      completed: true,
      completedAt: timestamp,
      event: { projectId: project.id, ...event },
    });
  if (!previous) record({ type: "created" });
  if (!crossStitch) return;
  const before = new Map(
    (previous?.tasks ?? []).map((task) => [task.id, task.crossesDone]),
  );
  // Removing a color keeps its recorded work; editing progress records the correction.
  const stitches = project.tasks.reduce(
    (total, task) => total + task.crossesDone - (before.get(task.id) ?? 0),
    0,
  );
  if (stitches) record({ type: "stitches", stitches });
}
