import { reactive, watch } from "vue";
import { setStockLevel, stockOwned } from "../domain/inventory.js";
import { nextProjectColor } from "../domain/project-color.js";
import { syncCatalogShopping } from "../domain/shopping.js";
import { stitchStatusFromThreads } from "../domain/stitching.js";
import { loadState, saveState } from "../persistence/state-storage.js";
import { uid } from "../shared/id.js";
import { todayIso } from "../shared/date.js";

export const state = reactive(loadState());
syncCatalogShopping(state);

let saveTimer;
watch(
  state,
  () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveState(state), 80);
  },
  { deep: true },
);

export const actions = {
  toggleHome(kind, id) {
    const list = kind === "work" ? state.work : kind === "chore" ? state.chores : state.todos;
    const item = list.find((entry) => entry.id === id);
    if (!item) return;
    if (kind === "todo") item.done = !item.done;
    else item.homeDone = !item.homeDone;
  },
  toggleWork(id) {
    const index = state.work.findIndex((task) => task.id === id);
    if (index < 0) return;
    const [item] = state.work.splice(index, 1);
    state.workHistory.push({
      id: uid("work-history"),
      title: item.title,
      endedAt: todayIso(),
    });
  },
  toggleTodo(id) {
    const item = state.todos.find((todo) => todo.id === id);
    if (item) item.done = !item.done;
  },
  toggleChore(id) {
    const item = state.chores.find((chore) => chore.id === id);
    if (!item) return;
    item.homeDone = true;
    item.history.push({ due: item.due, completed: todayIso() });
  },
  toggleShopping(id) {
    const item = state.shopping.find((product) => product.id === id);
    if (!item) return;
    if (item.linked) {
      const stock = item.sourceType === "filament" ? state.filamentStock : state.threadStock;
      setStockLevel(stock, item.sourceId, stockOwned(stock, item.sourceId) + item.quantity);
      syncCatalogShopping(state);
      return;
    }
    item.done = !item.done;
  },
  togglePrintPart(projectId, partId) {
    const project = state.printing.find((item) => item.id === projectId);
    const part = project?.parts.find((item) => item.id === partId);
    if (!part) return;
    part.status = part.status === "Done" ? "Planned" : "Done";
    syncCatalogShopping(state);
  },
  setThreadCrosses(projectId, threadId, value) {
    const project = state.stitch.find((item) => item.id === projectId);
    const thread = project?.threads.find((item) => item.id === threadId);
    if (!project || !thread) return;
    const previous = stitchStatusFromThreads(project);
    thread.completedCrosses = Math.min(Math.max(0, Number(value) || 0), Number(thread.totalCrosses) || 0);
    const current = stitchStatusFromThreads(project);
    const today = todayIso();
    if (previous === "Planned" && current === "In progress" && !project.startDate) project.startDate = today;
    if (current === "Completed" && !project.completionDate) project.completionDate = today;
    if (!["Completed", "Abandoned"].includes(current)) project.completionDate = "";
    syncCatalogShopping(state);
  },
  setStock(kind, catalogId, value) {
    setStockLevel(kind === "filament" ? state.filamentStock : state.threadStock, catalogId, value);
    syncCatalogShopping(state);
  },
  addWork(group = "today") {
    state.work.push({
      id: uid("work"),
      title: "",
      group,
      selectedAt: todayIso(),
      homeDone: false,
    });
  },
  removeEmptyWork(id) {
    const item = state.work.find((task) => task.id === id);
    if (item && !item.title.trim()) state.work = state.work.filter((task) => task.id !== id);
  },
  moveWork(id, group) {
    const item = state.work.find((task) => task.id === id);
    if (item && ["today", "backlog"].includes(group)) item.group = group;
  },
  setWorkDay(date, type) {
    if (["work", "pto", "sick", "holiday", "weekend"].includes(type)) state.workDays[date] = type;
  },
  addTodo() {
    state.todos.push({ id: uid("todo"), title: "", dateMode: "none", date: "", done: false });
  },
  removeEmptyTodo(id) {
    const item = state.todos.find((todo) => todo.id === id);
    if (item && !item.title.trim()) state.todos = state.todos.filter((todo) => todo.id !== id);
  },
  addShopping() {
    state.shopping.push({ id: uid("shop"), title: "", done: false });
  },
  removeEmptyShopping(id) {
    const item = state.shopping.find((product) => product.id === id);
    if (item && !item.linked && !item.title.trim()) {
      state.shopping = state.shopping.filter((product) => product.id !== id);
    }
  },
  addPrintProject(title) {
    state.printing.push({
      id: uid("print"),
      title,
      color: nextProjectColor([...state.printing, ...state.stitch]),
      parts: [],
    });
  },
  addStitchProject(title) {
    state.stitch.push({
      id: uid("stitch"),
      title,
      color: nextProjectColor([...state.printing, ...state.stitch]),
      startDate: "",
      completionDate: "",
      abandoned: false,
      threads: [],
    });
  },
};
