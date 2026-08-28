const EMPTY_TASKS = Object.freeze([]);
const TODAY = new Date();
const TASK_GROUPS = [
  { dayOffset: -7, tasks: [{ checkedAt: "09:00:00", title: "Set up the work calendar" }] },
  {
    dayOffset: -1,
    tasks: [{ title: "Triage inbox" }, { title: "Prepare the quarterly planning notes" }],
  },
  {
    dayOffset: 0,
    tasks: [
      { title: "Daily stand-up" },
      { title: "Review pull requests" },
      { title: "Pair on calendar navigation" },
      { title: "Update the team roadmap" },
    ],
  },
  { dayOffset: 1, tasks: [{ title: "Document the release process and share it with the team" }] },
];

function isoDate(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateFromToday(dayOffset) {
  const date = new Date(TODAY);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return isoDate(date);
}

const tasksByDate = new Map(
  TASK_GROUPS.map(({ dayOffset, tasks: taskDefinitions }) => {
    const date = dateFromToday(dayOffset);
    const tasks = taskDefinitions.map(({ checkedAt, title }, index) =>
      Object.freeze({
        id: `${date}-${index}`,
        date,
        title,
        ...(checkedAt && { checkedAt: `${date}T${checkedAt}` }),
      }),
    );
    return [date, Object.freeze(tasks)];
  }),
);
const allTasks = Object.freeze([...tasksByDate.values()].flat());

const firstCheckedTaskDate = allTasks
  .filter((task) => task.checkedAt)
  .sort((first, second) => first.checkedAt.localeCompare(second.checkedAt))[0]?.date;

export function getFirstCheckedWorkTaskDate() {
  return firstCheckedTaskDate;
}

export function getWorkTasks(date) {
  return tasksByDate.get(date) ?? EMPTY_TASKS;
}

export function getAllWorkTasks() {
  return allTasks;
}
