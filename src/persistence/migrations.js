import { createInitialState } from "../data/initial-state.js";
import { projectColor } from "../domain/project-color.js";

const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
const rows = (value) => (Array.isArray(value) ? value.filter(isRecord) : []);
const record = (value) => (isRecord(value) ? value : {});
const text = (value) => (typeof value === "string" ? value : "");
const number = (value) => Math.max(0, Number(value) || 0);
const id = (value, fallback) => text(value) || fallback;

function normalizeWork(value, index) {
  return {
    id: id(value.id, `work-${index + 1}`),
    title: text(value.title),
    group: value.group === "backlog" ? "backlog" : "today",
    selectedAt: text(value.selectedAt),
    homeDone: Boolean(value.homeDone),
  };
}

function normalizeWorkHistory(value, index) {
  return {
    id: id(value.id, `work-history-${index + 1}`),
    title: text(value.title),
    endedAt: text(value.endedAt || value.completedAt),
  };
}

function normalizeTodo(value, index, done = false) {
  const dateMode = ["on", "before"].includes(value.dateMode) ? value.dateMode : "none";
  return {
    id: id(value.id, `todo-${index + 1}`),
    title: text(value.title),
    dateMode,
    date: dateMode === "none" ? "" : text(value.date),
    done: done || Boolean(value.done || value.homeDone),
  };
}

function normalizeChore(value, index) {
  return {
    id: id(value.id, `chore-${index + 1}`),
    title: text(value.title),
    scheduleType: text(value.scheduleType),
    rule: text(value.rule),
    due: text(value.due),
    anchor: text(value.anchor),
    mode: value.mode === "after" ? "after" : "fixed",
    history: rows(value.history).map((entry) => ({
      due: text(entry.due),
      completed: text(entry.completed),
    })),
    homeDone: Boolean(value.homeDone),
  };
}

function normalizeShopping(value, index) {
  return {
    id: id(value.id, `shop-${index + 1}`),
    title: text(value.title),
    done: Boolean(value.done),
  };
}

function normalizeStock(value) {
  const levels = new Map();
  for (const item of rows(value)) {
    const catalogId = text(item.catalogId || item.id);
    if (catalogId) levels.set(catalogId, Math.max(levels.get(catalogId) || 0, number(item.owned)));
  }
  return [...levels].filter(([, owned]) => owned > 0).map(([catalogId, owned]) => ({ catalogId, owned }));
}

function legacyFilamentStock(state) {
  return normalizeStock(
    rows(state.filaments).map((item) => ({
      catalogId: item.catalogId,
      owned:
        item.unit === "spools" ? number(item.owned) : Math.ceil(number(item.owned) / (number(item.spoolSize) || 1000)),
    })),
  );
}

function legacyThreadStock(state) {
  const entries = [...rows(state.threadCatalog)];
  for (const project of rows(state.stitch)) {
    for (const thread of rows(project.threads)) {
      entries.push({ catalogId: thread.catalogId, owned: thread.owned });
    }
  }
  return normalizeStock(entries);
}

function normalizePrintPart(value, index, filamentIds, filamentLabels, forceDone) {
  return {
    id: id(value.id, `print-part-${index + 1}`),
    title: text(value.title),
    status: forceDone ? "Done" : text(value.status) || "Planned",
    filamentId: filamentIds.get(value.filamentId) || text(value.filamentId),
    filamentLabel: text(value.filamentLabel) || filamentLabels.get(value.filamentId) || text(value.material),
    nozzleMm: number(value.nozzleMm) || 0.4,
    materialGrams: number(value.materialGrams),
  };
}

function normalizePrintProject(value, index, filamentIds, filamentLabels) {
  const forceDone = value.status === "completed";
  const parts = rows(value.parts).map((part, partIndex) =>
    normalizePrintPart(part, partIndex, filamentIds, filamentLabels, forceDone),
  );
  if (forceDone && !parts.length) {
    parts.push({
      id: `${id(value.id, `print-${index + 1}`)}-part`,
      title: text(value.title),
      status: "Done",
      filamentId: "",
      filamentLabel: "",
      nozzleMm: 0.4,
      materialGrams: 0,
    });
  }
  return {
    id: id(value.id, `print-${index + 1}`),
    title: text(value.title),
    color: text(value.color) || projectColor(value.id, index),
    parts,
  };
}

function normalizeStitchThread(value, index) {
  return {
    id: id(value.id, `stitch-thread-${index + 1}`),
    catalogId: text(value.catalogId),
    label: text(value.label || value.colorName) || text(value.catalogId),
    required: number(value.required),
    completedCrosses: number(value.completedCrosses),
    totalCrosses: number(value.totalCrosses),
  };
}

function normalizeStitchProject(value, index) {
  return {
    id: id(value.id, `stitch-${index + 1}`),
    title: text(value.title),
    color: text(value.color) || projectColor(value.id, index),
    startDate: text(value.startDate),
    completionDate: text(value.completionDate),
    abandoned: Boolean(value.abandoned || value.status === "Abandoned"),
    threads: rows(value.threads).map(normalizeStitchThread),
  };
}

export function normalizeState(value) {
  const source = record(value);
  const state = createInitialState();
  const legacyFilamentIds = new Map(rows(source.filaments).map((item) => [item.id, text(item.catalogId || item.id)]));
  const legacyFilamentLabels = new Map(
    rows(source.filaments).map((item) => [
      item.id,
      text(item.name) || [item.family, item.color].filter(Boolean).join(" · "),
    ]),
  );

  state.workDays = Object.fromEntries(
    Object.entries(record(source.workDays)).filter(([, type]) =>
      ["work", "pto", "sick", "holiday", "weekend"].includes(type),
    ),
  );
  state.work = rows(source.work)
    .map(normalizeWork)
    .filter((item) => item.title.trim());
  state.workHistory = rows(source.workHistory)
    .map(normalizeWorkHistory)
    .filter((item) => item.title.trim());
  state.todos = [
    ...rows(source.todos).map((item, index) => normalizeTodo(item, index)),
    ...rows(source.completedTodos).map((item, index) => normalizeTodo(item, rows(source.todos).length + index, true)),
  ].filter((item) => item.title.trim());
  state.chores = rows(source.chores)
    .map(normalizeChore)
    .filter((item) => item.title.trim());
  state.shopping = rows(source.shopping)
    .filter((item) => !item.linked)
    .map(normalizeShopping)
    .filter((item) => item.title.trim());
  state.filamentStock = source.filamentStock ? normalizeStock(source.filamentStock) : legacyFilamentStock(source);
  state.threadStock = source.threadStock ? normalizeStock(source.threadStock) : legacyThreadStock(source);
  state.printing = rows(source.printing)
    .map((project, index) => normalizePrintProject(project, index, legacyFilamentIds, legacyFilamentLabels))
    .filter((project) => project.title.trim());
  state.stitch = rows(source.stitch)
    .map(normalizeStitchProject)
    .filter((project) => project.title.trim());
  return state;
}
