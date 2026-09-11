<script>
import { APP_DATA_LIMITS } from "../../backend/api/src/app-data-contract.mjs";
import { subscribeAppData } from "../app/app-data.js";
import { createTaskEditor } from "../app/task-editor.js";
import { randomCardColor } from "../app/card-colors.js";
import {
  filamentCatalog,
  filamentLabel,
  filamentsById,
} from "../app/filament-catalog.js";
import { flossCatalog, flossById, flossLabel } from "../app/floss-catalog.js";
import {
  loadFilamentInventory,
  loadFlossInventory,
  loadPageTasks,
  savePageTasks,
} from "../app/page-tasks.js";
import {
  filamentSupplyStatus,
  syncFilamentShoppingList,
} from "../app/printing-supplies.js";
import {
  flossSupplyStatus,
  syncFlossShoppingList,
} from "../app/stitching-supplies.js";
import {
  completedTasksLast,
  nextEntityId,
  setTaskCompletion,
} from "../app/task-list.js";
import JMModal from "../components/JMModal/JMModal.vue";
import JMInput from "../components/JMInput/JMInput.vue";
import JMButton from "../components/JMButton/JMButton.vue";
import JMCard from "../components/JMCard/JMCard.vue";
import JMCatalogLoader from "../components/JMCatalogLoader/JMCatalogLoader.vue";
import JMPrintingTaskDetails from "../components/JMProjectTaskDetails/JMPrintingTaskDetails.vue";
import JMStitchTaskDetails from "../components/JMProjectTaskDetails/JMStitchTaskDetails.vue";
import JMTaskItem from "../components/JMTaskItem/JMTaskItem.vue";

function projectCompleted(project) {
  return (
    project.tasks.length > 0 && project.tasks.every((task) => task.completed)
  );
}

function loadProjectTasks(pageKey) {
  const pageData = loadPageTasks(pageKey);
  for (const project of pageData.projects)
    project.tasks = completedTasksLast(project.tasks);
  pageData.projects = [
    ...pageData.projects.filter((project) => !projectCompleted(project)),
    ...pageData.projects.filter(projectCompleted),
  ];
  return { ...pageData, history: pageData.history ?? [] };
}

export default {
  name: "ProjectTasksPage",
  components: {
    JMModal,
    JMInput,
    JMCatalogLoader,
    JMButton,
    JMCard,
    JMPrintingTaskDetails,
    JMStitchTaskDetails,
    JMTaskItem,
  },
  props: {
    pageKey: {
      type: String,
      required: true,
      validator: (value) => ["printing", "crossStitch"].includes(value),
    },
    title: { type: String, required: true },
  },
  data() {
    const pageData = loadProjectTasks(this.pageKey);
    return {
      limits: APP_DATA_LIMITS,
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      projectDraft: null,
      projectOriginal: null,
      editMessage: "",
      removedDraftTasks: [],
      filamentInventory: loadFilamentInventory(),
      flossInventory: loadFlossInventory(),
      pageData,
      completedProjects: new Set(
        pageData.projects.filter(projectCompleted).map((project) => project.id),
      ),
    };
  },
  computed: {
    editingProject() {
      return this.pageData.projects.some(
        (project) => project.id === this.projectDraft?.id,
      );
    },
    draftSupplyById() {
      const projects = this.pageData.projects.filter(
        (project) => project.id !== this.projectDraft?.id,
      );
      if (this.projectDraft) projects.push(this.projectDraft);
      return this.isPrinting
        ? filamentSupplyStatus(projects, this.filamentInventory)
        : flossSupplyStatus(projects, this.flossInventory);
    },
    projectIssue() {
      if (!this.projectDraft) return "";
      if (
        !this.editingProject &&
        this.pageData.projects.length >= APP_DATA_LIMITS.projects
      )
        return "You can have up to 500 projects. Remove a project before adding another.";
      if (this.projectDraft.tasks.length > APP_DATA_LIMITS.tasks)
        return "A project can contain up to 2,000 items.";
      for (const task of this.projectDraft.tasks) {
        if (
          this.isPrinting &&
          task.filaments.length > APP_DATA_LIMITS.filaments
        )
          return "An item can use up to 100 filaments.";
        if (
          this.isCrossStitch &&
          (!Number.isInteger(task.requiredSkeins) ||
            task.requiredSkeins < 0 ||
            task.requiredSkeins > APP_DATA_LIMITS.skeins)
        )
          return "Skeins needed must be a whole number between 0 and 10,000.";
      }
      return "";
    },
    canCreateProject() {
      return Boolean(
        !this.projectIssue &&
        this.projectDraft?.title.trim() &&
        this.projectDraft.title.trim().length <= APP_DATA_LIMITS.title &&
        this.projectDraft.tasks.length &&
        this.projectDraft.tasks.every((task) =>
          this.isPrinting
            ? task.title.trim() &&
              task.filaments.every(
                (usage) =>
                  usage.weightGrams === "" ||
                  (Number.isFinite(Number(usage.weightGrams)) &&
                    Number(usage.weightGrams) >= 0 &&
                    Number(usage.weightGrams) <= APP_DATA_LIMITS.quantity),
              )
            : Boolean(task.flossId) &&
              Number(task.crosses) > 0 &&
              Number(task.crosses) <= APP_DATA_LIMITS.quantity,
        ),
      );
    },
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
        { id: "edit", label: "Edit", icon: "edit" },
        { id: "remove", label: "Remove", icon: "remove" },
        {
          id: "add",
          label: this.isCrossStitch ? "Add color" : "Add item",
          icon: "plus",
        },
      ];
    },
    supplyById() {
      return this.isPrinting
        ? filamentSupplyStatus(this.pageData.projects, this.filamentInventory)
        : new Map();
    },
    flossSupplyById() {
      return this.isCrossStitch
        ? flossSupplyStatus(this.pageData.projects, this.flossInventory)
        : new Map();
    },
  },
  watch: {
    pageKey(value) {
      this.$refs.projectModal?.close();
      this.projectDraft = null;
      this.clearCompletionMoveTimers();
      this.filamentInventory = loadFilamentInventory();
      this.flossInventory = loadFlossInventory();
      this.pageData = loadProjectTasks(value);
      this.completedProjects = new Set(
        this.pageData.projects
          .filter(projectCompleted)
          .map((project) => project.id),
      );
      this.syncShoppingList();
    },
  },
  mounted() {
    const receive = () => {
      this.editor.clear();
      this.pageData = loadProjectTasks(this.pageKey);
      this.completedProjects = new Set(
        this.pageData.projects
          .filter(projectCompleted)
          .map((project) => project.id),
      );
      this.syncShoppingList();
    };
    this.subscriptions = ["printing", "cross-stitch"].map((resource) =>
      subscribeAppData(resource, () => {
        if (resource === (this.isPrinting ? "printing" : "cross-stitch"))
          receive();
      }),
    );
    this.subscriptions.push(
      subscribeAppData("filament-inventory", (value) => {
        this.filamentInventory = value;
        this.syncShoppingList();
      }),
      subscribeAppData("floss-inventory", (value) => {
        this.flossInventory = value;
        this.syncShoppingList();
      }),
    );
    this.syncShoppingList();
  },
  beforeUnmount() {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.clearCompletionMoveTimers();
  },
  methods: {
    updateProjectPosition(project) {
      this.editor.moves.schedule(`project:${project.id}`, () => {
        const index = this.pageData.projects.findIndex(
          (item) => item.id === project.id,
        );
        if (index < 0) return;
        const current = this.pageData.projects[index];
        const completed = projectCompleted(current);
        if (this.completedProjects.has(current.id) === completed) return;
        if (completed) this.completedProjects.add(current.id);
        else this.completedProjects.delete(current.id);
        this.pageData.projects.splice(index, 1);
        const boundary = this.pageData.projects.findIndex(projectCompleted);
        this.pageData.projects.splice(
          boundary < 0 ? this.pageData.projects.length : boundary,
          0,
          current,
        );
        this.save();
      });
    },
    clearCompletionMoveTimers() {
      this.editor.clear();
    },
    syncShoppingList() {
      if (this.isPrinting)
        syncFilamentShoppingList(
          this.pageData.projects,
          this.filamentInventory,
        );
      if (this.isCrossStitch)
        syncFlossShoppingList(this.pageData.projects, this.flossInventory);
    },
    projectCrossesDone(project) {
      return Math.min(
        this.projectTotalCrosses(project),
        project.tasks.reduce(
          (total, task) => total + (Number(task.crossesDone) || 0),
          0,
        ),
      );
    },
    projectTotalCrosses(project) {
      return project.tasks.reduce(
        (total, task) => total + (Number(task.crosses) || 0),
        0,
      );
    },
    projectProgress(project) {
      if (this.isCrossStitch) {
        const value = this.projectCrossesDone(project);
        const max = this.projectTotalCrosses(project);
        return { value, max };
      }
      const tasks = project.tasks.filter((task) => task.title.trim());
      const value = tasks.filter((task) => task.completed).length;
      return { value, max: tasks.length };
    },
    handleProjectAction(project, action) {
      if (action === "edit" || action === "add")
        this.openProject(project, action === "add");
      if (action === "remove") {
        this.retainHistory(project, project.tasks);
        for (const task of project.tasks) {
          this.editor.moves.cancel(task.id);
          this.editor.drafts.delete(task.id);
        }
        this.pageData.projects = this.pageData.projects.filter(
          (item) => item.id !== project.id,
        );
        this.save();
        this.$nextTick(() => this.$refs.addProject.$el.focus());
      }
    },
    save() {
      savePageTasks(this.pageKey, this.pageData);
      this.syncShoppingList();
    },
    updateFilament(usage, catalogId) {
      const filament = filamentsById.get(catalogId);
      usage.catalogId = catalogId;
      usage.label = filament ? filamentLabel(filament) : "";
    },
    updateWeight(usage, value) {
      usage.weightGrams = value === "" ? "" : Number(value);
    },
    addFilament(task) {
      if (task.filaments.length >= APP_DATA_LIMITS.filaments) {
        this.editMessage = "An item can use up to 100 filaments.";
        return;
      }
      const usage = {
        id: nextEntityId(task.filaments, `${task.id}-filament`),
        catalogId: "",
        label: "",
        weightGrams: "",
      };
      task.filaments.push(usage);
      this.editor.focus(`printing-filament-${task.id}-${usage.id}`);
    },
    removeFilament(task, usage) {
      const usageIndex = task.filaments.findIndex(
        (filament) => filament.id === usage.id,
      );
      if (usageIndex === -1) return;
      task.filaments.splice(usageIndex, 1);
    },
    updateFloss(task, flossId) {
      const thread = flossById.get(flossId);
      task.flossId = flossId;
      task.title = thread ? flossLabel(thread) : "Choose a thread color";
    },
    updateSkeins(task, value) {
      task.requiredSkeins = Math.max(0, Math.floor(Number(value) || 0));
    },
    updateCrosses(task, value) {
      const wasCompleted = task.completed;
      task.crosses = Math.max(0, Math.floor(Number(value) || 0));
      task.crossesDone = Math.min(task.crossesDone, task.crosses);
      const completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      if (completed !== wasCompleted) setTaskCompletion(task, completed);
    },
    updateCrossesDone(task, value) {
      const wasCompleted = task.completed;
      task.crossesDone = Math.min(
        task.crosses,
        Math.max(0, Math.floor(Number(value) || 0)),
      );
      const completed = task.crosses > 0 && task.crossesDone >= task.crosses;
      if (completed !== wasCompleted) setTaskCompletion(task, completed);
    },
    retainHistory(project, tasks) {
      const history = new Map(
        this.pageData.history.map((item) => [item.id, item]),
      );
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
    removeTask(project, task) {
      this.retainHistory(project, [task]);
      this.editor.moves.cancel(task.id);
      project.tasks = project.tasks.filter((item) => item.id !== task.id);
      this.save();
      this.updateProjectPosition(project);
    },
    updateCompleted(project, task, completed) {
      if (this.isCrossStitch) task.crossesDone = completed ? task.crosses : 0;
      setTaskCompletion(task, completed);
      this.save();
      this.editor.scheduleMove(task, completed, project.tasks);
      this.updateProjectPosition(project);
    },
    makeTask() {
      const task = {
        id: `project-task-${crypto.randomUUID()}`,
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
      } else if (this.isCrossStitch) {
        Object.assign(task, {
          title: "Choose a thread color",
          flossId: "",
          requiredSkeins: 1,
          crosses: 0,
          crossesDone: 0,
        });
      }
      return task;
    },
    openProject(project, addItem = false) {
      if (addItem && project.tasks.length >= APP_DATA_LIMITS.tasks) {
        this.editMessage = "A project can contain up to 2,000 items.";
        return;
      }
      // Settle our own delayed moves before taking the conflict-detection snapshot.
      for (const task of project.tasks) this.editor.moves.cancel(task.id);
      const ordered = completedTasksLast(project.tasks);
      if (ordered.some((task, index) => task !== project.tasks[index])) {
        project.tasks = ordered;
        this.save();
      }
      this.projectOriginal = JSON.stringify(project);
      this.editMessage = "";
      this.projectDraft = JSON.parse(JSON.stringify(project));
      this.removedDraftTasks = [];
      if (addItem) this.projectDraft.tasks.push(this.makeTask());
      this.$nextTick(() => {
        this.$refs.projectModal.open();
        if (addItem) this.focusDraftTask(this.projectDraft.tasks.at(-1));
      });
    },
    focusDraftTask(task) {
      this.editor.focus(
        this.isPrinting
          ? `project-draft-${task.id}`
          : `stitch-floss-${task.id}`,
      );
    },
    removeDraftTask(task) {
      this.removedDraftTasks.push(task);
      this.projectDraft.tasks = this.projectDraft.tasks.filter(
        (item) => item.id !== task.id,
      );
    },
    addProject() {
      if (this.pageData.projects.length >= APP_DATA_LIMITS.projects) {
        this.editMessage =
          "You can have up to 500 projects. Remove a project before adding another.";
        return;
      }
      this.projectOriginal = null;
      this.editMessage = "";
      this.removedDraftTasks = [];
      this.projectDraft = {
        id: `project-${crypto.randomUUID()}`,
        title: "",
        color: randomCardColor(),
        description: "",
        tasks: [this.makeTask()],
      };
      this.$nextTick(() => this.$refs.projectModal.open());
    },
    addDraftTask() {
      if (this.projectDraft.tasks.length >= APP_DATA_LIMITS.tasks) {
        this.editMessage = "A project can contain up to 2,000 items.";
        return;
      }
      const task = this.makeTask();
      this.projectDraft.tasks.push(task);
      this.focusDraftTask(task);
    },
    createProject() {
      if (!this.canCreateProject) return;
      const project = this.projectDraft;
      const current = this.pageData.projects.find(
        (item) => item.id === project.id,
      );
      if (
        this.projectOriginal !== null &&
        JSON.stringify(current) !== this.projectOriginal
      ) {
        this.editMessage =
          "This project changed while you were editing. Cancel and reopen it to review the saved version.";
        return;
      }
      project.title = project.title.trim();
      for (const task of project.tasks) {
        if (this.isPrinting) task.title = task.title.trim();
        else {
          task.title = flossById.has(task.flossId)
            ? flossLabel(flossById.get(task.flossId))
            : task.title;
          task.crosses = Math.floor(Number(task.crosses));
        }
      }
      if (this.isCrossStitch)
        project.totalCrosses = this.projectTotalCrosses(project);
      const index = this.pageData.projects.findIndex(
        (item) => item.id === project.id,
      );
      if (index >= 0) {
        for (const task of this.pageData.projects[index].tasks)
          this.editor.moves.cancel(task.id);
        this.retainHistory(
          this.pageData.projects[index],
          this.removedDraftTasks,
        );
        project.tasks = completedTasksLast(project.tasks);
        this.pageData.projects.splice(index, 1, project);
      } else {
        const boundary = this.pageData.projects.findIndex(projectCompleted);
        this.pageData.projects.splice(
          boundary < 0 ? this.pageData.projects.length : boundary,
          0,
          project,
        );
      }
      this.updateProjectPosition(project);
      this.save();
      this.$refs.projectModal.close();
      this.projectDraft = null;
    },
  },
};
</script>

<template>
  <header class="page-header">
    <h1>{{ title }}</h1>
    <JMButton
      ref="addProject"
      text="Add project"
      view="secondary"
      @click="addProject"
    />
  </header>

  <p v-if="editMessage && !projectDraft" role="status">{{ editMessage }}</p>

  <JMCatalogLoader :catalog="catalog" />

  <JMModal
    ref="projectModal"
    :aria-label="editingProject ? 'Edit project' : 'New project'"
    @close="projectDraft = null"
  >
    <form v-if="projectDraft" novalidate @submit.prevent="createProject">
      <h2>{{ editingProject ? "Edit project" : "New project" }}</h2>
      <p v-if="projectIssue || editMessage" role="alert">
        {{ projectIssue || editMessage }}
      </p>
      <JMInput
        v-model="projectDraft.title"
        label="Project name"
        required
        :maxlength="limits.title"
        autofocus
      />
      <fieldset v-for="(task, index) in projectDraft.tasks" :key="task.id">
        <legend>{{ isPrinting ? "Item" : "Color" }} {{ index + 1 }}</legend>
        <JMInput
          v-if="isPrinting"
          :id="`project-draft-${task.id}`"
          v-model="task.title"
          label="Item name"
          required
          :maxlength="limits.title"
        />
        <JMPrintingTaskDetails
          v-if="isPrinting"
          :task="task"
          :supply-by-id="draftSupplyById"
          @remove="removeFilament(task, $event)"
          @update:filament="updateFilament"
          @update:weight="updateWeight"
        />
        <JMButton
          v-if="isPrinting"
          icon-name="plus"
          view="ghost"
          aria-label="Add filament"
          @click="addFilament(task)"
        />
        <JMStitchTaskDetails
          v-else
          :task="task"
          :supply-by-id="draftSupplyById"
          @update:crosses="updateCrosses(task, $event)"
          @update:crosses-done="updateCrossesDone(task, $event)"
          @update:floss="updateFloss(task, $event)"
          @update:skeins="updateSkeins(task, $event)"
        />
        <JMButton
          icon-name="remove"
          view="ghost"
          size="s"
          :aria-label="`Remove ${isPrinting ? 'item' : 'color'} ${index + 1}`"
          @click="removeDraftTask(task)"
        />
      </fieldset>
      <p v-if="!projectDraft.tasks.length">
        Add at least one {{ isPrinting ? "item" : "color" }} to create a
        project.
      </p>
      <JMButton
        :text="isPrinting ? 'Add item' : 'Add color'"
        icon-name="plus"
        view="ghost"
        @click="addDraftTask"
      />
      <JMButton
        text="Cancel"
        view="ghost"
        @click="$refs.projectModal.close()"
      />
      <JMButton
        :text="editingProject ? 'Save project' : 'Create project'"
        type="submit"
        :disabled="!canCreateProject"
      />
    </form>
  </JMModal>

  <ul class="project-list" role="list">
    <JMCard
      v-for="project in pageData.projects"
      :key="`${pageKey}-${project.id}`"
      tag="li"
      class="project-card"
      :class="{
        'project-card--printing': isPrinting,
        'project-card--stitching': isCrossStitch,
      }"
      :title="
        project.title ||
        (isPrinting ? 'Untitled 3D project' : 'Untitled cross stitch project')
      "
      :color="project.color"
      :progress="projectProgress(project)"
      :actions="cardActions"
      collapsible
      :collapsed="completedProjects.has(project.id)"
      @action="handleProjectAction(project, $event)"
    >
      <template v-for="task in project.tasks" :key="task.id">
        <JMTaskItem
          :task-id="task.id"
          :title="task.title"
          :completed="task.completed"
          :editable="false"
          removable
          :completion-disabled="isCrossStitch && task.crosses <= 0"
          :remove-label="`Remove ${task.title || 'item'} from ${project.title}`"
          @remove="removeTask(project, task)"
          @update:completed="updateCompleted(project, task, $event)"
        >
          <template #details>
            <JMPrintingTaskDetails
              v-if="isPrinting"
              readonly
              :task="task"
              :supply-by-id="supplyById"
            />
            <JMStitchTaskDetails
              v-else
              readonly
              :task="task"
              :supply-by-id="flossSupplyById"
            />
          </template>
        </JMTaskItem>
      </template>
    </JMCard>
  </ul>
</template>
