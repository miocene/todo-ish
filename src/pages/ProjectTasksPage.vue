<script>
import { filamentLabel, filamentsById } from "../app/filament-catalog.js";
import { flossById, flossLabel } from "../app/floss-catalog.js";
import { loadFilamentInventory, loadFlossInventory, loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
import { flossSupplyStatus, syncFlossShoppingList } from "../app/stitching-supplies.js";
import {
  completedTasksLast,
  createCompletionMoveScheduler,
  finishTaskDraft,
  moveItemToEnd,
  nextEntityId,
  setTaskCompletion,
  serializableTasks,
} from "../app/task-list.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMPrintingTaskDetails from "../components/JMProjectTaskDetails/JMPrintingTaskDetails.vue";
import JMStitchTaskDetails from "../components/JMProjectTaskDetails/JMStitchTaskDetails.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

function loadProjectTasks(pageKey) {
  const pageData = loadPageTasks(pageKey);
  for (const project of pageData.projects) project.tasks = completedTasksLast(project.tasks);
  return pageData;
}

export default {
  name: "ProjectTasksPage",
  components: { JMButton, JMPrintingTaskDetails, JMStitchTaskDetails, JMTaskCard },
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
      completionMoves: createCompletionMoveScheduler(),
      draftTaskIds: new Set(),
      filamentInventory: loadFilamentInventory(),
      flossInventory: loadFlossInventory(),
      pageData: loadProjectTasks(this.pageKey),
    };
  },
  computed: {
    isPrinting() {
      return this.pageKey === "printing";
    },
    isCrossStitch() {
      return this.pageKey === "crossStitch";
    },
    isCraftProject() {
      return this.isPrinting || this.isCrossStitch;
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
      this.draftTaskIds.clear();
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
      this.completionMoves.clear();
    },
    syncShoppingList() {
      if (this.isPrinting) syncFilamentShoppingList(this.pageData.projects, this.filamentInventory);
      if (this.isCrossStitch) syncFlossShoppingList(this.pageData.projects, this.flossInventory);
    },
    projectTitleId(project) {
      return `${this.pageKey}-project-${project.id}`;
    },
    projectTitleInputId(project) {
      return `${this.pageKey}-project-title-${project.id}`;
    },
    projectColorInputId(project) {
      return `${this.pageKey}-project-color-${project.id}`;
    },
    projectCrossesInputId(project) {
      return `${this.pageKey}-project-crosses-${project.id}`;
    },
    taskInputId(project, task) {
      return `${this.pageKey}-title-${project.id}-${task.id}`;
    },
    projectCrossesDone(project) {
      return Math.min(
        project.totalCrosses,
        project.tasks.reduce((total, task) => total + (Number(task.crossesDone) || 0), 0),
      );
    },
    projectProgress(project) {
      return project.totalCrosses > 0 ? Math.round((this.projectCrossesDone(project) / project.totalCrosses) * 100) : 0;
    },
    save() {
      savePageTasks(this.pageKey, {
        ...this.pageData,
        projects: this.pageData.projects.map((project) => ({
          ...project,
          tasks: serializableTasks(project.tasks, this.draftTaskIds),
        })),
      });
      this.syncShoppingList();
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateProjectTitle(project, title) {
      project.title = title;
      this.save();
    },
    updateProjectColor(project, color) {
      project.color = color;
      this.save();
    },
    updateProjectCrosses(project, value) {
      project.totalCrosses = Math.max(0, Math.floor(Number(value) || 0));
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
      this.$nextTick(() => document.getElementById(`printing-filament-${task.id}-${usage.id}`)?.focus());
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
    updateCrosses(task, value) {
      const wasCompleted = task.completed;
      task.crosses = Math.max(0, Math.floor(Number(value) || 0));
      task.crossesDone = Math.min(task.crossesDone, task.crosses);
      const completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      if (completed !== wasCompleted) setTaskCompletion(task, completed);
      this.save();
    },
    updateCrossesDone(task, value) {
      const wasCompleted = task.completed;
      task.crossesDone = Math.min(task.crosses, Math.max(0, Math.floor(Number(value) || 0)));
      const completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      if (completed !== wasCompleted) setTaskCompletion(task, completed);
      this.save();
    },
    removeStitchColor(project, task) {
      project.tasks = project.tasks.filter((item) => item.id !== task.id);
      this.save();
    },
    updateCompleted(project, task, completed) {
      setTaskCompletion(task, completed);
      this.save();
      this.completionMoves.schedule(task.id, completed, () => {
        if (moveItemToEnd(project.tasks, task)) this.save();
      });
    },
    addTask(project) {
      const task = { id: nextEntityId(project.tasks, `${project.id}-task`), title: "", completed: false };
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
      project.tasks.push(task);
      if (!this.isCrossStitch) this.draftTaskIds.add(task.id);
      this.save();
      if (this.isCrossStitch) {
        this.$nextTick(() => document.getElementById(`stitch-floss-${task.id}`)?.focus());
      } else {
        this.focusTask(project, task);
      }
      return task;
    },
    addProject() {
      const project = {
        id: nextEntityId(this.pageData.projects, this.isPrinting ? "printing-project" : "stitch-project"),
        title: this.isPrinting ? "New 3D project" : "New cross stitch project",
        color: this.isPrinting ? "#526d9c" : "#a6638d",
        description: "",
        tasks: [],
      };
      if (this.isCrossStitch) project.totalCrosses = 0;
      this.pageData.projects.push(project);
      this.save();
      this.$nextTick(() => document.getElementById(this.projectTitleInputId(project))?.select());
    },
    handleTitleBlur(project, task) {
      if (!finishTaskDraft(project.tasks, task, this.draftTaskIds)) return;
      this.save();
    },
    handleEnter(project, task, event) {
      if (event.isComposing) return;
      event.preventDefault();
      const index = project.tasks.findIndex((item) => item.id === task.id);
      const nextTask = project.tasks[index + 1];
      if (nextTask) this.focusTask(project, nextTask);
      else this.addTask(project);
    },
    focusTask(project, task) {
      if (!task) return;
      this.$nextTick(() => document.getElementById(this.taskInputId(project, task))?.focus());
    },
  },
};
</script>

<template>
  <section class="task-page" :aria-labelledby="`${pageKey}-title`">
    <header class="task-page__header">
      <div>
        <h1 :id="`${pageKey}-title`">{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <JMButton v-if="isCraftProject" text="Add project" view="secondary" @click="addProject" />
    </header>

    <ul class="project-grid" :class="{ 'project-grid--stitching': isCrossStitch }" role="list">
      <li v-for="project in pageData.projects" :key="project.id">
        <article
          class="project-card"
          :class="{ 'project-card--printing': isPrinting, 'project-card--stitching': isCrossStitch }"
          :style="isCraftProject ? { '--project-color': project.color } : undefined"
          :aria-labelledby="projectTitleId(project)"
        >
          <header class="project-card__header">
            <div v-if="isCraftProject" class="project-card__identity">
              <h2 :id="projectTitleId(project)" class="task-page__visually-hidden">
                {{ project.title || (isPrinting ? "Untitled 3D project" : "Untitled cross stitch project") }}
              </h2>
              <label class="project-card__field-label" :for="projectTitleInputId(project)">Project title</label>
              <input
                :id="projectTitleInputId(project)"
                class="project-card__title-input"
                name="project-title"
                type="text"
                :value="project.title"
                @input="updateProjectTitle(project, $event.target.value)"
              />
              <label class="project-card__color-field" :for="projectColorInputId(project)">
                <span>Project color</span>
                <input
                  :id="projectColorInputId(project)"
                  name="project-color"
                  type="color"
                  :value="project.color"
                  @input="updateProjectColor(project, $event.target.value)"
                />
              </label>
            </div>
            <div v-else>
              <h2 :id="projectTitleId(project)">{{ project.title }}</h2>
              <p>{{ project.description }}</p>
            </div>
            <JMButton :text="isCrossStitch ? 'Add color' : 'Add item'" view="ghost" @click="addTask(project)" />
          </header>

          <div v-if="isCrossStitch" class="stitch-project__progress">
            <label :for="projectCrossesInputId(project)">Total project crosses</label>
            <input
              :id="projectCrossesInputId(project)"
              name="project-crosses"
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              :value="project.totalCrosses"
              @input="updateProjectCrosses(project, $event.target.value)"
            />
            <progress :max="project.totalCrosses || 1" :value="projectCrossesDone(project)">
              {{ projectProgress(project) }}%
            </progress>
            <p>
              {{ projectCrossesDone(project).toLocaleString() }} / {{ project.totalCrosses.toLocaleString() }} crosses ·
              {{ projectProgress(project) }}%
            </p>
          </div>

          <ul class="task-page__tasks" role="list">
            <li v-for="task in project.tasks" :key="task.id">
              <JMTaskCard
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
                    @update:crosses="updateCrosses(task, $event)"
                    @update:crosses-done="updateCrossesDone(task, $event)"
                    @update:floss="updateFloss(task, $event)"
                    @update:skeins="updateSkeins(task, $event)"
                  />
                </template>
              </JMTaskCard>
            </li>
          </ul>
        </article>
      </li>
    </ul>
  </section>
</template>
