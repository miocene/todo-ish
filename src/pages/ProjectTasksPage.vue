<script>
import { filamentLabel, filaments, filamentsById } from "../app/filament-catalog.js";
import { floss, flossById, flossLabel } from "../app/floss-catalog.js";
import {
  loadFilamentInventory,
  loadFlossInventory,
  loadPageTasks,
  nextTaskId,
  savePageTasks,
} from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
import { flossSupplyStatus, syncFlossShoppingList } from "../app/stitching-supplies.js";
import { completedTasksLast, finishTaskDraft, serializableTasks } from "../app/task-drafts.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";
import "./task-pages.css";

function loadProjectTasks(pageKey) {
  const pageData = loadPageTasks(pageKey);
  for (const project of pageData.projects) project.tasks = completedTasksLast(project.tasks);
  return pageData;
}

export default {
  name: "ProjectTasksPage",
  components: { JMButton, JMIcon, JMTaskCard },
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
      completionMoveTimers: new Map(),
      draftTaskIds: new Set(),
      filamentInventory: loadFilamentInventory(),
      filaments,
      floss,
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
      for (const timer of this.completionMoveTimers.values()) window.clearTimeout(timer);
      this.completionMoveTimers.clear();
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
    filamentInputId(project, task, usage) {
      return `${this.pageKey}-filament-${project.id}-${task.id}-${usage.id}`;
    },
    filamentStatusId(project, task, usage) {
      return `${this.pageKey}-filament-status-${project.id}-${task.id}-${usage.id}`;
    },
    weightInputId(project, task, usage) {
      return `${this.pageKey}-weight-${project.id}-${task.id}-${usage.id}`;
    },
    flossInputId(project, task) {
      return `${this.pageKey}-floss-${project.id}-${task.id}`;
    },
    flossStatusId(project, task) {
      return `${this.pageKey}-floss-status-${project.id}-${task.id}`;
    },
    skeinsInputId(project, task) {
      return `${this.pageKey}-skeins-${project.id}-${task.id}`;
    },
    crossesDoneInputId(project, task) {
      return `${this.pageKey}-crosses-done-${project.id}-${task.id}`;
    },
    crossesInputId(project, task) {
      return `${this.pageKey}-crosses-${project.id}-${task.id}`;
    },
    isMissingFilament(usage) {
      return Boolean(
        usage.catalogId &&
        (!filamentsById.has(usage.catalogId) || (this.supplyById.get(usage.catalogId)?.missingSpools ?? 0) > 0),
      );
    },
    missingFilamentLabel(usage) {
      return usage.label || usage.catalogId;
    },
    filamentShortage(usage) {
      return this.supplyById.get(usage.catalogId);
    },
    missingFilamentStatus(usage) {
      const supply = this.filamentShortage(usage);
      if (!filamentsById.has(usage.catalogId)) {
        return `Not in catalog · Need ${supply?.requiredSpools ?? 1} ${supply?.requiredSpools === 1 ? "spool" : "spools"}`;
      }
      return `Missing ${supply.missingSpools} ${supply.missingSpools === 1 ? "spool" : "spools"} · ${supply.ownedSpools} owned`;
    },
    filamentLabel,
    flossLabel,
    isMissingFloss(task) {
      return Boolean(task.flossId && (this.flossSupplyById.get(task.flossId)?.missingSkeins ?? 0) > 0);
    },
    missingFlossStatus(task) {
      const supply = this.flossSupplyById.get(task.flossId);
      if (!supply) return "";
      return `Missing ${supply.missingSkeins} ${supply.missingSkeins === 1 ? "skein" : "skeins"} · ${supply.ownedSkeins} owned`;
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
        id: nextTaskId(task.filaments, `${task.id}-filament`),
        catalogId: "",
        label: "",
        weightGrams: "",
      };
      task.filaments.push(usage);
      this.save();
      this.$nextTick(() => document.getElementById(this.filamentInputId(project, task, usage))?.focus());
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
      task.crosses = Math.max(0, Math.floor(Number(value) || 0));
      task.crossesDone = Math.min(task.crossesDone, task.crosses);
      task.completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      this.save();
    },
    updateCrossesDone(task, value) {
      task.crossesDone = Math.min(task.crosses, Math.max(0, Math.floor(Number(value) || 0)));
      task.completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      this.save();
    },
    removeStitchColor(project, task) {
      project.tasks = project.tasks.filter((item) => item.id !== task.id);
      this.save();
    },
    updateCompleted(project, task, completed) {
      window.clearTimeout(this.completionMoveTimers.get(task.id));
      this.completionMoveTimers.delete(task.id);
      task.completed = completed;
      this.save();
      if (!completed) return;

      const timer = window.setTimeout(() => {
        this.completionMoveTimers.delete(task.id);
        const taskIndex = project.tasks.findIndex((item) => item.id === task.id);
        if (taskIndex === -1 || taskIndex === project.tasks.length - 1) return;
        project.tasks.splice(taskIndex, 1);
        project.tasks.push(task);
        this.save();
      }, 500);
      this.completionMoveTimers.set(task.id, timer);
    },
    addTask(project) {
      const task = { id: nextTaskId(project.tasks, `${project.id}-task`), title: "", completed: false };
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
        this.$nextTick(() => document.getElementById(this.flossInputId(project, task))?.focus());
      } else {
        this.focusTask(project, task);
      }
      return task;
    },
    addProject() {
      const project = {
        id: nextTaskId(this.pageData.projects, this.isPrinting ? "printing-project" : "stitch-project"),
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
                  <fieldset v-if="isPrinting" class="printing-item__fields">
                    <legend class="task-page__visually-hidden">
                      Filaments and weights for {{ task.title || "untitled item" }}
                    </legend>
                    <div
                      v-for="(usage, usageIndex) in task.filaments"
                      :key="usage.id"
                      class="printing-filament"
                      :class="{ 'printing-filament--missing': isMissingFilament(usage) }"
                    >
                      <div class="printing-item__field printing-item__field--filament">
                        <label :for="filamentInputId(project, task, usage)">Filament {{ usageIndex + 1 }}</label>
                        <select
                          :id="filamentInputId(project, task, usage)"
                          name="item-filament"
                          :value="usage.catalogId"
                          :aria-describedby="
                            isMissingFilament(usage) ? filamentStatusId(project, task, usage) : undefined
                          "
                          @change="updateFilament(usage, $event.target.value)"
                        >
                          <option value="">Choose filament</option>
                          <option v-if="isMissingFilament(usage)" :value="usage.catalogId">
                            Missing · {{ missingFilamentLabel(usage) }}
                          </option>
                          <option v-for="filament in filaments" :key="filament.id" :value="filament.id">
                            {{ filamentLabel(filament) }}
                          </option>
                        </select>
                        <span
                          v-if="isMissingFilament(usage)"
                          :id="filamentStatusId(project, task, usage)"
                          class="printing-item__missing"
                        >
                          {{ missingFilamentStatus(usage) }}
                        </span>
                      </div>
                      <div class="printing-item__field printing-item__field--weight">
                        <label :for="weightInputId(project, task, usage)">Weight {{ usageIndex + 1 }}</label>
                        <span class="printing-item__weight-control">
                          <input
                            :id="weightInputId(project, task, usage)"
                            name="item-weight"
                            type="number"
                            inputmode="decimal"
                            min="0"
                            step="0.1"
                            :value="usage.weightGrams"
                            @input="updateWeight(usage, $event.target.value)"
                          />
                          <span aria-hidden="true">g</span>
                        </span>
                      </div>
                      <button
                        class="printing-filament__remove"
                        type="button"
                        :aria-label="`Remove filament ${usageIndex + 1} from ${task.title || 'untitled item'}`"
                        @click="removeFilament(task, usage)"
                      >
                        <JMIcon name="remove" />
                      </button>
                    </div>
                    <JMButton text="Add filament" view="ghost" @click="addFilament(project, task)" />
                  </fieldset>

                  <fieldset
                    v-else-if="isCrossStitch"
                    class="stitch-color__fields"
                    :class="{ 'stitch-color__fields--missing': isMissingFloss(task) }"
                  >
                    <legend class="task-page__visually-hidden">Thread and progress for {{ task.title }}</legend>
                    <div class="stitch-color__field stitch-color__field--thread">
                      <label :for="flossInputId(project, task)">Thread color</label>
                      <select
                        :id="flossInputId(project, task)"
                        name="stitch-floss"
                        :value="task.flossId"
                        :aria-describedby="isMissingFloss(task) ? flossStatusId(project, task) : undefined"
                        @change="updateFloss(task, $event.target.value)"
                      >
                        <option value="">Choose DMC color</option>
                        <option v-for="thread in floss" :key="thread.id" :value="thread.id">
                          {{ flossLabel(thread) }}
                        </option>
                      </select>
                      <span
                        v-if="isMissingFloss(task)"
                        :id="flossStatusId(project, task)"
                        class="stitch-color__missing"
                      >
                        {{ missingFlossStatus(task) }}
                      </span>
                    </div>
                    <div class="stitch-color__field">
                      <label :for="skeinsInputId(project, task)">Skeins needed</label>
                      <input
                        :id="skeinsInputId(project, task)"
                        name="stitch-skeins"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        step="1"
                        :value="task.requiredSkeins"
                        @input="updateSkeins(task, $event.target.value)"
                      />
                    </div>
                    <div class="stitch-color__field">
                      <label :for="crossesDoneInputId(project, task)">Crosses done</label>
                      <input
                        :id="crossesDoneInputId(project, task)"
                        name="stitch-crosses-done"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        :max="task.crosses"
                        step="1"
                        :value="task.crossesDone"
                        @input="updateCrossesDone(task, $event.target.value)"
                      />
                    </div>
                    <div class="stitch-color__field">
                      <label :for="crossesInputId(project, task)">Crosses total</label>
                      <input
                        :id="crossesInputId(project, task)"
                        name="stitch-crosses-total"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        step="1"
                        :value="task.crosses"
                        @input="updateCrosses(task, $event.target.value)"
                      />
                    </div>
                    <p class="stitch-color__progress">
                      {{ task.crossesDone.toLocaleString() }} / {{ task.crosses.toLocaleString() }} crosses<span
                        v-if="task.completed"
                      >
                        · Done</span
                      >
                    </p>
                  </fieldset>
                </template>
              </JMTaskCard>
            </li>
          </ul>
        </article>
      </li>
    </ul>
  </section>
</template>
