<script>
import { createTaskEditor } from "../app/task-editor.js";
import { randomCardColor } from "../app/card-colors.js";
import { filamentCatalog, filamentLabel, filamentsById } from "../app/filament-catalog.js";
import { flossCatalog, flossById, flossLabel } from "../app/floss-catalog.js";
import { loadFilamentInventory, loadFlossInventory, loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
import { flossSupplyStatus, syncFlossShoppingList } from "../app/stitching-supplies.js";
import { completedTasksLast, nextEntityId, setTaskCompletion, serializableTasks } from "../app/task-list.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMCard from "../components/JMCard/JMCard.vue";
import JMCatalogLoader from "../components/JMCatalogLoader/JMCatalogLoader.vue";
import JMPrintingTaskDetails from "../components/JMProjectTaskDetails/JMPrintingTaskDetails.vue";
import JMStitchTaskDetails from "../components/JMProjectTaskDetails/JMStitchTaskDetails.vue";
import JMTaskItem from "../components/JMTaskItem/JMTaskItem.vue";

function loadProjectTasks(pageKey) {
  const pageData = loadPageTasks(pageKey);
  for (const project of pageData.projects) project.tasks = completedTasksLast(project.tasks);
  return { ...pageData, history: pageData.history ?? [] };
}

export default {
  name: "ProjectTasksPage",
  components: {
    JMCatalogLoader,
    JMButton,
    JMCard,
    JMPrintingTaskDetails,
    JMStitchTaskDetails,
    JMTaskItem,
  },
  props: {
    description: { type: String, required: true },
    pageKey: {
      type: String,
      required: true,
      validator: (value) => ["printing", "crossStitch"].includes(value),
    },
    title: { type: String, required: true },
  },
  data() {
    return {
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      filamentInventory: loadFilamentInventory(),
      flossInventory: loadFlossInventory(),
      pageData: loadProjectTasks(this.pageKey),
    };
  },
  computed: {
    catalog() {
      return this.isPrinting ? filamentCatalog : flossCatalog;
    },
    isPrinting() {
      return this.pageKey === "printing";
    },
    isCrossStitch() {
      return this.pageKey === "crossStitch";
    },
    cardActions() {
      return [
        { id: "edit", label: "Edit" },
        { id: "remove", label: "Remove" },
        { id: "add", label: this.isCrossStitch ? "Add color" : "Add item" },
      ];
    },
    supplyById() {
      return this.isPrinting ? filamentSupplyStatus(this.pageData.projects, this.filamentInventory) : new Map();
    },
    flossSupplyById() {
      return this.isCrossStitch ? flossSupplyStatus(this.pageData.projects, this.flossInventory) : new Map();
    },
  },
  watch: {
    pageKey(value) {
      this.clearCompletionMoveTimers();
      this.filamentInventory = loadFilamentInventory();
      this.flossInventory = loadFlossInventory();
      this.pageData = loadProjectTasks(value);
      this.syncShoppingList();
    },
  },
  mounted() {
    this.syncShoppingList();
  },
  beforeUnmount() {
    this.clearCompletionMoveTimers();
  },
  methods: {
    clearCompletionMoveTimers() {
      this.editor.clear();
    },
    syncShoppingList() {
      if (this.isPrinting) syncFilamentShoppingList(this.pageData.projects, this.filamentInventory);
      if (this.isCrossStitch) syncFlossShoppingList(this.pageData.projects, this.flossInventory);
    },
    taskInputId(project, task) {
      return `${this.pageKey}-title-${project.id}-${task.id}`;
    },
    projectCrossesDone(project) {
      return Math.min(
        this.projectTotalCrosses(project),
        project.tasks.reduce((total, task) => total + (Number(task.crossesDone) || 0), 0),
      );
    },
    projectTotalCrosses(project) {
      return project.tasks.reduce((total, task) => total + (Number(task.crosses) || 0), 0);
    },
    projectProgress(project) {
      if (this.isCrossStitch) {
        const value = this.projectCrossesDone(project);
        const max = this.projectTotalCrosses(project);
        const percent = max > 0 ? Math.round((value / max) * 100) : 0;
        return { value, max, text: `${value.toLocaleString()} / ${max.toLocaleString()} crosses · ${percent}%` };
      }
      const tasks = project.tasks.filter((task) => task.title.trim());
      const value = tasks.filter((task) => task.completed).length;
      return { value, max: tasks.length, text: `${value} / ${tasks.length} items` };
    },
    handleProjectAction(project, action) {
      if (action === "add") this.addTask(project);
      if (action === "remove") {
        this.retainHistory(project, project.tasks);
        for (const task of project.tasks) {
          this.editor.moves.cancel(task.id);
          this.editor.drafts.delete(task.id);
        }
        this.pageData.projects = this.pageData.projects.filter((item) => item.id !== project.id);
        this.save();
        this.$nextTick(() => this.$refs.addProject.$el.focus());
      }
    },
    save() {
      savePageTasks(this.pageKey, {
        ...this.pageData,
        projects: this.pageData.projects.map((project) => ({
          ...project,
          tasks: serializableTasks(project.tasks, this.editor.drafts),
        })),
      });
      this.syncShoppingList();
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateFilament(usage, catalogId) {
      const filament = filamentsById.get(catalogId);
      usage.catalogId = catalogId;
      usage.label = filament ? filamentLabel(filament) : "";
      this.save();
    },
    updateWeight(usage, value) {
      usage.weightGrams = value === "" ? "" : Number(value);
      this.save();
    },
    addFilament(project, task) {
      const usage = {
        id: nextEntityId(task.filaments, `${task.id}-filament`),
        catalogId: "",
        label: "",
        weightGrams: "",
      };
      task.filaments.push(usage);
      this.save();
      this.editor.focus(`printing-filament-${task.id}-${usage.id}`);
    },
    removeFilament(task, usage) {
      const usageIndex = task.filaments.findIndex((filament) => filament.id === usage.id);
      if (usageIndex === -1) return;
      task.filaments.splice(usageIndex, 1);
      this.save();
    },
    updateFloss(task, flossId) {
      const thread = flossById.get(flossId);
      task.flossId = flossId;
      task.title = thread ? flossLabel(thread) : "Choose a thread color";
      this.save();
    },
    updateSkeins(task, value) {
      task.requiredSkeins = Math.max(0, Math.floor(Number(value) || 0));
      this.save();
    },
    updateCrosses(project, task, value) {
      const wasCompleted = task.completed;
      task.crosses = Math.max(0, Math.floor(Number(value) || 0));
      task.crossesDone = Math.min(task.crossesDone, task.crosses);
      const completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      if (completed !== wasCompleted) this.updateCompleted(project, task, completed);
      else this.save();
    },
    updateCrossesDone(project, task, value) {
      const wasCompleted = task.completed;
      task.crossesDone = Math.min(task.crosses, Math.max(0, Math.floor(Number(value) || 0)));
      const completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      if (completed !== wasCompleted) this.updateCompleted(project, task, completed);
      else this.save();
    },
    retainHistory(project, tasks) {
      const history = new Map(this.pageData.history.map((item) => [item.id, item]));
      for (const task of tasks)
        if (task.completedAt && task.title.trim())
          history.set(task.id, {
            id: task.id,
            title: task.title,
            completedAt: task.completedAt,
            completed: true,
            context: project.title,
          });
      this.pageData.history = [...history.values()];
    },
    removeStitchColor(project, task) {
      this.retainHistory(project, [task]);
      this.editor.moves.cancel(task.id);
      project.tasks = project.tasks.filter((item) => item.id !== task.id);
      this.save();
    },
    updateCompleted(project, task, completed) {
      setTaskCompletion(task, completed);
      this.save();
      this.editor.scheduleMove(task, completed, project.tasks);
    },
    addTask(project) {
      const task = { id: `project-task-${crypto.randomUUID()}`, title: "", completed: false };
      if (this.isPrinting) {
        task.filaments = [{ id: `${task.id}-filament-1`, catalogId: "", label: "", weightGrams: "" }];
      } else if (this.isCrossStitch) {
        Object.assign(task, {
          title: "Choose a thread color",
          flossId: "",
          requiredSkeins: 1,
          crosses: 0,
          crossesDone: 0,
        });
      }
      this.editor.add(project.tasks, task, { draft: !this.isCrossStitch });
      if (this.isCrossStitch) {
        this.editor.focus(`stitch-floss-${task.id}`);
      } else {
        this.focusTask(project, task);
      }
      return task;
    },
    addProject() {
      const project = {
        id: `project-${crypto.randomUUID()}`,
        title: this.isPrinting ? "New 3D project" : "New cross stitch project",
        color: randomCardColor(),
        description: "",
        tasks: [],
      };
      if (this.isCrossStitch) project.totalCrosses = 0;
      this.pageData.projects.push(project);
      this.save();
    },
    handleTitleBlur(project, task) {
      this.editor.finish(project.tasks, task);
    },
    handleEnter(project, task, event) {
      this.editor.enter(project.tasks, task, event, {
        create: () => this.addTask(project),
        focus: (next) => this.focusTask(project, next),
      });
    },
    focusTask(project, task) {
      if (!task) return;
      this.editor.focus(this.taskInputId(project, task));
    },
  },
};
</script>

<template>
  <header class="page-header">
    <h1>{{ title }}</h1>
    <JMButton ref="addProject" text="Add project" view="secondary" @click="addProject" />
  </header>

  <JMCatalogLoader :catalog="catalog" />

  <ul class="project-list" role="list">
    <JMCard
      v-for="project in pageData.projects"
      :key="`${pageKey}-${project.id}`"
      tag="li"
      class="project-card"
      :class="{ 'project-card--printing': isPrinting, 'project-card--stitching': isCrossStitch }"
      :title="project.title || (isPrinting ? 'Untitled 3D project' : 'Untitled cross stitch project')"
      :color="project.color"
      :progress="projectProgress(project)"
      :actions="cardActions"
      collapsible
      @action="handleProjectAction(project, $event)"
    >
      <li v-for="task in project.tasks" :key="task.id">
        <JMTaskItem
          :task-id="task.id"
          :title="task.title"
          :title-input-id="taskInputId(project, task)"
          :title-label="isPrinting ? 'Item name' : 'Task title'"
          :completed="task.completed"
          :completable="!isCrossStitch"
          :editable="!isCrossStitch"
          :removable="isCrossStitch"
          :remove-label="`Remove ${task.title || 'thread color'} from ${project.title}`"
          @enter="handleEnter(project, task, $event)"
          @remove="removeStitchColor(project, task)"
          @title-blur="handleTitleBlur(project, task)"
          @update:completed="updateCompleted(project, task, $event)"
          @update:title="updateTitle(task, $event)"
        >
          <template #details>
            <JMPrintingTaskDetails
              v-if="isPrinting"
              :supply-by-id="supplyById"
              :task="task"
              @add="addFilament(project, task)"
              @remove="removeFilament(task, $event)"
              @update:filament="updateFilament"
              @update:weight="updateWeight"
            />
            <JMStitchTaskDetails
              v-else-if="isCrossStitch"
              :supply-by-id="flossSupplyById"
              :task="task"
              @update:crosses="updateCrosses(project, task, $event)"
              @update:crosses-done="updateCrossesDone(project, task, $event)"
              @update:floss="updateFloss(task, $event)"
              @update:skeins="updateSkeins(task, $event)"
            />
          </template>
        </JMTaskItem>
      </li>
    </JMCard>
  </ul>
</template>
