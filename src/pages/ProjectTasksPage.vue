<script>
import { filamentLabel, filaments, filamentsById } from "../app/filament-catalog.js";
import { loadFilamentInventory, loadPageTasks, nextTaskId, savePageTasks } from "../app/page-tasks.js";
import { filamentSupplyStatus, syncFilamentShoppingList } from "../app/printing-supplies.js";
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
      pageData: loadProjectTasks(this.pageKey),
    };
  },
  beforeUnmount() {
    this.clearCompletionMoveTimers();
  },
  mounted() {
    if (this.isPrinting) syncFilamentShoppingList(this.pageData.projects, this.filamentInventory);
  },
  computed: {
    isPrinting() {
      return this.pageKey === "printing";
    },
    supplyById() {
      return this.isPrinting ? filamentSupplyStatus(this.pageData.projects, this.filamentInventory) : new Map();
    },
  },
  watch: {
    pageKey(value) {
      this.clearCompletionMoveTimers();
      this.draftTaskIds.clear();
      this.filamentInventory = loadFilamentInventory();
      this.pageData = loadProjectTasks(value);
      if (value === "printing") syncFilamentShoppingList(this.pageData.projects, this.filamentInventory);
    },
  },
  methods: {
    clearCompletionMoveTimers() {
      for (const timer of this.completionMoveTimers.values()) window.clearTimeout(timer);
      this.completionMoveTimers.clear();
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
    save() {
      savePageTasks(this.pageKey, {
        ...this.pageData,
        projects: this.pageData.projects.map((project) => ({
          ...project,
          tasks: serializableTasks(project.tasks, this.draftTaskIds),
        })),
      });
      if (this.isPrinting) syncFilamentShoppingList(this.pageData.projects, this.filamentInventory);
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
      const task = {
        id: nextTaskId(project.tasks, `${project.id}-task`),
        title: "",
        completed: false,
      };
      if (this.isPrinting) {
        task.filaments = [
          {
            id: `${task.id}-filament-1`,
            catalogId: "",
            label: "",
            weightGrams: "",
          },
        ];
      }
      project.tasks.push(task);
      this.draftTaskIds.add(task.id);
      this.save();
      this.focusTask(project, task);
      return task;
    },
    addProject() {
      const project = {
        id: nextTaskId(this.pageData.projects, "printing-project"),
        title: "New 3D project",
        color: "#526d9c",
        description: "",
        tasks: [],
      };
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
      <JMButton v-if="isPrinting" text="Add project" view="secondary" @click="addProject" />
    </header>

    <ul class="project-grid" role="list">
      <li v-for="project in pageData.projects" :key="project.id">
        <article
          class="project-card"
          :class="{ 'project-card--printing': isPrinting }"
          :style="isPrinting ? { '--project-color': project.color } : undefined"
          :aria-labelledby="projectTitleId(project)"
        >
          <header class="project-card__header">
            <div v-if="isPrinting" class="project-card__identity">
              <h2 :id="projectTitleId(project)" class="task-page__visually-hidden">
                {{ project.title || "Untitled 3D project" }}
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
            <JMButton :text="isPrinting ? 'Add item' : 'Add task'" view="ghost" @click="addTask(project)" />
          </header>

          <ul class="task-page__tasks" role="list">
            <li v-for="task in project.tasks" :key="task.id">
              <JMTaskCard
                :task-id="task.id"
                :title="task.title"
                :title-input-id="taskInputId(project, task)"
                :title-label="isPrinting ? 'Item name' : 'Task title'"
                :completed="task.completed"
                @enter="handleEnter(project, task, $event)"
                @title-blur="handleTitleBlur(project, task)"
                @update:completed="updateCompleted(project, task, $event)"
                @update:title="updateTitle(task, $event)"
              >
                <template v-if="isPrinting" #details>
                  <fieldset class="printing-item__fields">
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
                </template>
              </JMTaskCard>
            </li>
          </ul>
        </article>
      </li>
    </ul>
  </section>
</template>
