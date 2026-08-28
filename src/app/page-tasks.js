import { normalizeInventory, readStoredJson, writeStoredJson } from "./storage.js";

const STORAGE_PREFIX = "done-ish.page-tasks.v1";
const FILAMENT_INVENTORY_KEY = "done-ish.filament-inventory.v1";
const FLOSS_INVENTORY_KEY = "done-ish.floss-inventory.v1";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_FILAMENT_INVENTORY = Object.freeze({
  "bambu-pla-basic-filament-10101": 1,
  "bambu-pla-basic-filament-10501": 1,
  "bambu-pla-basic-filament-10601": 1,
});
const DEFAULT_FLOSS_INVENTORY = Object.freeze({ dmc310: 1, dmc321: 1, dmc3347: 1 });

function isoDate(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function nextWeekdayIso(weekday) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
  return isoDate(date);
}

const DEFAULT_CHORE_DUE_DATES = [nextWeekdayIso(6), nextWeekdayIso(0), nextWeekdayIso(3)];
const completedAtDaysAgo = (dayOffset) => {
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

const DEFAULT_PAGE_DATA = Object.freeze({
  chores: {
    occurrenceOrder: ["chore-1", "chore-2", "chore-3"],
    tasks: [
      {
        id: "chore-1",
        title: "Water the plants",
        details: "Every Saturday",
        nextDue: DEFAULT_CHORE_DUE_DATES[0],
        completed: false,
      },
      {
        id: "chore-2",
        title: "Change the bed linen",
        details: "Every 2 weeks on Sunday",
        nextDue: DEFAULT_CHORE_DUE_DATES[1],
        completed: false,
      },
      {
        id: "chore-3",
        title: "Clean the kitchen",
        details: "Every Wednesday",
        nextDue: DEFAULT_CHORE_DUE_DATES[2],
        completed: true,
        completedAt: completedAtDaysAgo(2),
      },
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
          {
            id: "todo-home-2",
            title: "Choose frames for the prints",
            completed: true,
            completedAt: completedAtDaysAgo(4),
          },
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
        color: "#446e5c",
        description: "Small clips for routing charging cables under the desk.",
        tasks: [
          {
            id: "printing-cable-1",
            title: "Small cable clip",
            filaments: [
              {
                id: "printing-cable-1-filament-1",
                catalogId: "bambu-pla-basic-filament-10101",
                label: "PLA Basic · Black",
                weightGrams: 8,
              },
            ],
            completed: true,
            completedAt: completedAtDaysAgo(6),
          },
          {
            id: "printing-cable-2",
            title: "Large cable clip",
            filaments: [
              {
                id: "printing-cable-2-filament-1",
                catalogId: "discontinued-petg-charcoal",
                label: "PETG Basic · Charcoal",
                weightGrams: 12,
              },
            ],
            completed: false,
          },
          {
            id: "printing-cable-3",
            title: "Test clip",
            filaments: [
              {
                id: "printing-cable-3-filament-1",
                catalogId: "bambu-pla-basic-filament-10601",
                label: "PLA Basic · Blue",
                weightGrams: 1002,
              },
              {
                id: "printing-cable-3-filament-2",
                catalogId: "bambu-pla-basic-filament-10101",
                label: "PLA Basic · Black",
                weightGrams: 2,
              },
            ],
            completed: false,
          },
        ],
      },
      {
        id: "printing-planter",
        title: "Miniature planter",
        color: "#bd6a43",
        description: "A self-watering planter for the kitchen windowsill.",
        tasks: [
          {
            id: "printing-planter-1",
            title: "Planter body",
            filaments: [
              {
                id: "printing-planter-1-filament-1",
                catalogId: "bambu-pla-basic-filament-10501",
                label: "PLA Basic · Bambu Green",
                weightGrams: 84,
              },
            ],
            completed: false,
          },
          {
            id: "printing-planter-2",
            title: "Water reservoir",
            filaments: [
              {
                id: "printing-planter-2-filament-1",
                catalogId: "",
                label: "",
                weightGrams: 32,
              },
            ],
            completed: false,
          },
        ],
      },
    ],
  },
  crossStitch: {
    projects: [
      {
        id: "stitch-botanical",
        title: "Botanical sampler",
        color: "#71935c",
        totalCrosses: 2400,
        description: "A small sampler with herbs and wildflowers.",
        tasks: [
          {
            id: "stitch-botanical-1",
            title: "DMC 310 · Black",
            flossId: "dmc310",
            requiredSkeins: 1,
            crosses: 400,
            crossesDone: 400,
            completed: true,
            completedAt: completedAtDaysAgo(8),
          },
          {
            id: "stitch-botanical-2",
            title: "DMC 3347 · Yellow Green Med",
            flossId: "dmc3347",
            requiredSkeins: 2,
            crosses: 1200,
            crossesDone: 571,
            completed: false,
          },
          {
            id: "stitch-botanical-3",
            title: "DMC 3853 · Autumn Gold Dk",
            flossId: "dmc3853",
            requiredSkeins: 1,
            crosses: 800,
            crossesDone: 0,
            completed: false,
          },
        ],
      },
      {
        id: "stitch-canal-house",
        title: "Amsterdam canal house",
        color: "#c72b3b",
        totalCrosses: 1800,
        description: "A narrow canal-house pattern for the hallway.",
        tasks: [
          {
            id: "stitch-house-1",
            title: "DMC 321 · Red",
            flossId: "dmc321",
            requiredSkeins: 1,
            crosses: 900,
            crossesDone: 300,
            completed: false,
          },
          {
            id: "stitch-house-2",
            title: "DMC 310 · Black",
            flossId: "dmc310",
            requiredSkeins: 1,
            crosses: 900,
            crossesDone: 0,
            completed: false,
          },
        ],
      },
    ],
  },
});

const clone = structuredClone;

function isTask(task) {
  return (
    task &&
    typeof task === "object" &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.completed === "boolean" &&
    (task.completedAt === undefined || typeof task.completedAt === "string")
  );
}

function isTaskList(value) {
  return Array.isArray(value) && value.every(isTask);
}

function isProjectData(data) {
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

function normalizePrinting(data) {
  if (!data || typeof data !== "object" || !isProjectData(data)) return undefined;
  return {
    ...data,
    projects: data.projects.map((project, projectIndex) => ({
      ...project,
      color: /^#[\da-f]{6}$/i.test(project.color) ? project.color : ["#446e5c", "#bd6a43", "#526d9c"][projectIndex % 3],
      tasks: project.tasks.map((task) => {
        const { filamentId, filamentLabel, weightGrams, ...taskData } = task;
        const savedFilaments = Array.isArray(task.filaments) ? task.filaments : [];
        const legacyFilaments =
          typeof filamentId === "string" || typeof weightGrams === "number"
            ? [{ catalogId: filamentId, label: filamentLabel, weightGrams }]
            : [];
        const sourceFilaments = savedFilaments.length > 0 ? savedFilaments : legacyFilaments;
        return {
          ...taskData,
          filaments: sourceFilaments.map((filament, filamentIndex) => ({
            id:
              typeof filament.id === "string" && filament.id ? filament.id : `${task.id}-filament-${filamentIndex + 1}`,
            catalogId: typeof filament.catalogId === "string" ? filament.catalogId : "",
            label: typeof filament.label === "string" ? filament.label : "",
            weightGrams:
              typeof filament.weightGrams === "number" && filament.weightGrams >= 0 ? filament.weightGrams : "",
          })),
        };
      }),
    })),
  };
}

function normalizeCrossStitch(data) {
  if (!data || typeof data !== "object" || !isProjectData(data)) return undefined;
  return {
    ...data,
    projects: data.projects.map((project, projectIndex) => ({
      ...project,
      color: /^#[\da-f]{6}$/i.test(project.color) ? project.color : ["#71935c", "#c72b3b"][projectIndex % 2],
      totalCrosses:
        Number.isFinite(project.totalCrosses) && project.totalCrosses >= 0
          ? Math.floor(project.totalCrosses)
          : project.tasks.reduce((total, task) => total + (Number(task.crosses) || 0), 0),
      tasks: project.tasks.map((task) => {
        const crosses = Number.isFinite(task.crosses) && task.crosses >= 0 ? Math.floor(task.crosses) : 0;
        const crossesDone =
          Number.isFinite(task.crossesDone) && task.crossesDone >= 0 ? Math.floor(task.crossesDone) : 0;
        return {
          ...task,
          flossId: typeof task.flossId === "string" ? task.flossId : "",
          requiredSkeins:
            Number.isFinite(task.requiredSkeins) && task.requiredSkeins >= 0 ? Math.floor(task.requiredSkeins) : 1,
          crosses,
          crossesDone: Math.min(crossesDone, crosses),
          completed: crosses > 0 && crossesDone >= crosses,
          completedAt: crosses > 0 && crossesDone >= crosses ? task.completedAt : undefined,
        };
      }),
    })),
  };
}

function normalizeChores(data) {
  if (!data || typeof data !== "object" || !isTaskList(data.tasks)) return undefined;
  if (!data.tasks.every((task) => typeof task.details === "string")) return undefined;
  const tasks = data.tasks.map((task, index) => ({
    ...task,
    nextDue: ISO_DATE.test(task.nextDue) ? task.nextDue : (DEFAULT_CHORE_DUE_DATES[index] ?? isoDate(new Date())),
  }));
  const taskIds = new Set(tasks.map((task) => task.id));
  const defaultOrder = [...tasks.filter((task) => !task.completed), ...tasks.filter((task) => task.completed)].map(
    (task) => task.id,
  );
  const savedOrder = Array.isArray(data.occurrenceOrder)
    ? data.occurrenceOrder.filter((taskId) => taskIds.has(taskId))
    : defaultOrder;
  const occurrenceOrder = [...new Set([...savedOrder, ...defaultOrder])];
  return {
    ...data,
    occurrenceOrder,
    tasks,
  };
}

function normalizeShopping(data) {
  return data && typeof data === "object" && isTaskList(data.tasks) ? data : undefined;
}

function normalizeTodos(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.lists)) return undefined;
  return data.lists.every(
    (list) => list && typeof list.id === "string" && typeof list.title === "string" && isTaskList(list.tasks),
  )
    ? data
    : undefined;
}

const PAGE_NORMALIZERS = Object.freeze({
  chores: normalizeChores,
  crossStitch: normalizeCrossStitch,
  printing: normalizePrinting,
  shopping: normalizeShopping,
  todos: normalizeTodos,
});

export function loadPageTasks(page) {
  const defaultData = DEFAULT_PAGE_DATA[page];
  const normalize = PAGE_NORMALIZERS[page];
  if (!defaultData || !normalize) throw new Error(`Unknown task page: ${page}`);

  const savedData = readStoredJson(`${STORAGE_PREFIX}.${page}`);
  return clone(normalize(savedData) ?? normalize(defaultData));
}

export function savePageTasks(page, data) {
  writeStoredJson(`${STORAGE_PREFIX}.${page}`, data);
}

export function loadFilamentInventory() {
  return normalizeInventory(readStoredJson(FILAMENT_INVENTORY_KEY), DEFAULT_FILAMENT_INVENTORY);
}

export function saveFilamentInventory(inventory) {
  writeStoredJson(FILAMENT_INVENTORY_KEY, inventory);
}

export function loadFlossInventory() {
  return normalizeInventory(readStoredJson(FLOSS_INVENTORY_KEY), DEFAULT_FLOSS_INVENTORY);
}

export function saveFlossInventory(inventory) {
  writeStoredJson(FLOSS_INVENTORY_KEY, inventory);
}
