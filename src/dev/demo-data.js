import { toIsoDate as isoDate } from "../app/date.js";

const DEFAULT_FILAMENT_INVENTORY = Object.freeze({
  "bambu-pla-basic-filament-10101": 1,
  "bambu-pla-basic-filament-10501": 1,
  "bambu-pla-basic-filament-10601": 1,
});
const DEFAULT_FLOSS_INVENTORY = Object.freeze({
  dmc310: 1,
  dmc321: 1,
  dmc3347: 1,
});

function nextWeekdayIso(weekday) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
  return isoDate(date);
}

const DEFAULT_CHORE_DUE_DATES = [
  nextWeekdayIso(6),
  nextWeekdayIso(0),
  nextWeekdayIso(3),
];
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
          {
            id: "todo-general-2",
            title: "Book a dentist appointment",
            completed: false,
          },
        ],
      },
      {
        id: "home",
        title: "Home",
        tasks: [
          {
            id: "todo-home-1",
            title: "Measure the hallway for a runner",
            completed: false,
          },
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
          {
            id: "todo-travel-2",
            title: "Pack a power adapter",
            completed: false,
          },
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

const TODAY = new Date();
const TASK_GROUPS = [
  {
    dayOffset: -7,
    tasks: [{ checkedAt: "09:00:00", title: "Set up the work calendar" }],
  },
  {
    dayOffset: -1,
    tasks: [
      { title: "Triage inbox" },
      { title: "Prepare the quarterly planning notes" },
    ],
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
  {
    dayOffset: 1,
    tasks: [
      { title: "Document the release process and share it with the team" },
    ],
  },
];

function dateFromToday(dayOffset) {
  const date = new Date(TODAY);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return isoDate(date);
}

const defaultTasksByDate = new Map(
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
const defaultTasks = Object.freeze([...defaultTasksByDate.values()].flat());

export const demoData = {
  "work-tasks": defaultTasks,
  chores: DEFAULT_PAGE_DATA.chores,
  todos: DEFAULT_PAGE_DATA.todos,
  shopping: DEFAULT_PAGE_DATA.shopping,
  printing: DEFAULT_PAGE_DATA.printing,
  "cross-stitch": DEFAULT_PAGE_DATA.crossStitch,
  "filament-inventory": DEFAULT_FILAMENT_INVENTORY,
  "floss-inventory": DEFAULT_FLOSS_INVENTORY,
};
