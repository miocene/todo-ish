<script>
import { createTaskEditor } from "../app/task-editor.js";
import { filamentCatalog } from "../app/filament-catalog.js";
import { flossCatalog } from "../app/floss-catalog.js";
import JMCatalogLoader from "../components/JMCatalogLoader/JMCatalogLoader.vue";
import { savePageTasks } from "../app/page-tasks.js";
import { completedTasksLast, nextEntityId, setTaskCompletion, serializableTasks } from "../app/task-list.js";
import { syncSupplyShoppingLists } from "../app/shopping-supplies.js";
import JMCard from "../components/JMCard/JMCard.vue";
import JMTaskItem from "../components/JMTaskItem/JMTaskItem.vue";

export default {
  name: "ShoppingPage",
  components: { JMCatalogLoader, JMCard, JMTaskItem },
  data() {
    const shopping = syncSupplyShoppingLists();
    shopping.tasks = completedTasksLast(shopping.tasks);
    return {
      filamentCatalog,
      flossCatalog,
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      shopping,
    };
  },
  watch: {
    "filamentCatalog.state.status": "refreshSupplies",
    "flossCatalog.state.status": "refreshSupplies",
  },
  beforeUnmount() {
    this.editor.clear();
  },
  methods: {
    refreshSupplies(status) {
      if (status !== "ready") return;
      const managed = new Map(
        syncSupplyShoppingLists()
          .tasks.filter((task) => task.source)
          .map((task) => [task.id, task]),
      );
      this.shopping.tasks = this.shopping.tasks.flatMap((task) => {
        if (!task.source) return [task];
        const refreshed = managed.get(task.id);
        managed.delete(task.id);
        return refreshed ? [refreshed] : [];
      });
      this.shopping.tasks.push(...managed.values());
    },
    taskInputId(task) {
      return `shopping-title-${task.id}`;
    },
    save() {
      savePageTasks("shopping", {
        ...this.shopping,
        tasks: serializableTasks(this.shopping.tasks, this.editor.drafts),
      });
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(task, completed) {
      this.editor.moves.cancel(task.id);
      setTaskCompletion(task, completed);
      this.save();
      if (completed && task.filamentId) {
        void this.$router.push({ name: "catalog", query: { q: task.filamentId } });
        return;
      }
      if (completed && task.flossId) {
        void this.$router.push({ name: "catalog", query: { catalog: "floss", q: task.flossId } });
        return;
      }

      this.editor.scheduleMove(task, completed, this.shopping.tasks);
    },
    removeTask(task) {
      this.editor.moves.cancel(task.id);
      this.editor.drafts.delete(task.id);
      this.shopping.tasks = this.shopping.tasks.filter((item) => item.id !== task.id);
      this.save();
    },
    addTask() {
      const task = {
        id: nextEntityId(this.shopping.tasks, "shopping"),
        title: "",
        completed: false,
      };
      this.editor.add(this.shopping.tasks, task);
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(task) {
      this.editor.finish(this.shopping.tasks, task);
    },
    handleEnter(task, event) {
      this.editor.enter(this.shopping.tasks, task, event, { create: this.addTask, focus: this.focusTask });
    },
    focusTask(task) {
      if (task) this.editor.focus(this.taskInputId(task));
    },
  },
};
</script>

<template>
  <JMCatalogLoader :catalog="filamentCatalog" />
  <JMCatalogLoader :catalog="flossCatalog" />

  <JMCard
    class="shopping-card"
    title="Shopping cart"
    empty-text="The shopping list is empty."
    :actions="[{ id: 'add', label: 'Add item', icon: 'plus' }]"
    @action="addTask"
  >
    <template v-if="shopping.tasks.length" #list>
      <JMTaskItem
        v-for="task in shopping.tasks"
        :key="task.id"
        :task-id="task.id"
        :title="task.title"
        :title-href="task.productLink || ''"
        :title-input-id="taskInputId(task)"
        :completed="task.completed"
        removable
        :remove-label="`Remove ${task.title || 'untitled item'} from shopping list`"
        @enter="handleEnter(task, $event)"
        @remove="removeTask(task)"
        @title-blur="handleTitleBlur(task)"
        @update:completed="updateCompleted(task, $event)"
        @update:title="updateTitle(task, $event)"
      />
    </template>
  </JMCard>
</template>
