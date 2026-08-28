const STORAGE_PREFIX = "done-ish.page-tasks.v1";

const DEFAULT_PAGE_DATA = Object.freeze({
  chores: {
    tasks: [
      { id: "chore-1", title: "Water the plants", details: "Every Saturday", completed: false },
      { id: "chore-2", title: "Change the bed linen", details: "Every 2 weeks on Sunday", completed: false },
      { id: "chore-3", title: "Clean the kitchen", details: "Every Wednesday", completed: true },
    ],
  },
  todos: {
    lists: [
      {
        id: "general",
        title: "General",
        tasks: [
          { id: "todo-general-1", title: "Renew passport", completed: false },
          { id: "todo-general-2", title: "Book a dentist appointment", completed: false },
        ],
      },
      {
        id: "home",
        title: "Home",
        tasks: [
          { id: "todo-home-1", title: "Measure the hallway for a runner", completed: false },
          { id: "todo-home-2", title: "Choose frames for the prints", completed: true },
        ],
      },
      {
        id: "travel",
        title: "Travel",
        tasks: [
          { id: "todo-travel-1", title: "Check train times", completed: false },
          { id: "todo-travel-2", title: "Pack a power adapter", completed: false },
        ],
      },
    ],
  },
  shopping: {
    tasks: [
      { id: "shopping-1", title: "Oat milk", completed: false },
      { id: "shopping-2", title: "Apples", completed: false },
      { id: "shopping-3", title: "Dish soap", completed: false },
    ],
  },
  printing: {
    projects: [
      {
        id: "printing-cable-clips",
        title: "Desk cable clips",
        description: "Small clips for routing charging cables under the desk.",
        tasks: [
          { id: "printing-cable-1", title: "Measure cable diameters", completed: true },
          { id: "printing-cable-2", title: "Adjust the clip tolerance", completed: false },
          { id: "printing-cable-3", title: "Print a test set", completed: false },
        ],
      },
      {
        id: "printing-planter",
        title: "Miniature planter",
        description: "A self-watering planter for the kitchen windowsill.",
        tasks: [
          { id: "printing-planter-1", title: "Choose filament colour", completed: false },
          { id: "printing-planter-2", title: "Slice the final model", completed: false },
        ],
      },
    ],
  },
  crossStitch: {
    projects: [
      {
        id: "stitch-botanical",
        title: "Botanical sampler",
        description: "A small sampler with herbs and wildflowers.",
        tasks: [
          { id: "stitch-botanical-1", title: "Sort the green floss", completed: true },
          { id: "stitch-botanical-2", title: "Finish the rosemary border", completed: false },
          { id: "stitch-botanical-3", title: "Backstitch the labels", completed: false },
        ],
      },
      {
        id: "stitch-canal-house",
        title: "Amsterdam canal house",
        description: "A narrow canal-house pattern for the hallway.",
        tasks: [
          { id: "stitch-house-1", title: "Grid the fabric", completed: false },
          { id: "stitch-house-2", title: "Complete the roof section", completed: false },
        ],
      },
    ],
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isTask(task) {
  return (
    task &&
    typeof task === "object" &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.completed === "boolean"
  );
}

function isTaskList(value) {
  return Array.isArray(value) && value.every(isTask);
}

function isPageData(page, data) {
  if (!data || typeof data !== "object") return false;
  if (page === "chores") {
    return isTaskList(data.tasks) && data.tasks.every((task) => typeof task.details === "string");
  }
  if (page === "shopping") return isTaskList(data.tasks);
  if (page === "todos") {
    return (
      Array.isArray(data.lists) &&
      data.lists.every(
        (list) => list && typeof list.id === "string" && typeof list.title === "string" && isTaskList(list.tasks),
      )
    );
  }
  return (
    Array.isArray(data.projects) &&
    data.projects.every(
      (project) =>
        project &&
        typeof project.id === "string" &&
        typeof project.title === "string" &&
        typeof project.description === "string" &&
        isTaskList(project.tasks),
    )
  );
}

export function loadPageTasks(page) {
  const defaultData = DEFAULT_PAGE_DATA[page];
  if (!defaultData) throw new Error(`Unknown task page: ${page}`);

  try {
    const savedData = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}.${page}`) ?? "null");
    return clone(isPageData(page, savedData) ? savedData : defaultData);
  } catch {
    return clone(defaultData);
  }
}

export function savePageTasks(page, data) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${page}`, JSON.stringify(data));
  } catch {
    // Keep the in-memory page state usable when browser storage is unavailable.
  }
}

export function nextTaskId(tasks, prefix) {
  const usedIds = new Set(tasks.map((task) => task.id));
  let index = tasks.length + 1;
  while (usedIds.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
