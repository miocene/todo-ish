<script>
import { APP_DATA_LIMITS } from "../../backend/api/src/app-data-contract.mjs";
import { createTaskEditor, createTitleEditor } from "../app/task-editor.js";
import { subscribeAppData } from "../app/app-data.js";
import { filamentCatalog } from "../app/filament-catalog.js";
import { flossCatalog } from "../app/floss-catalog.js";
import JMCatalogLoader from "../components/JMCatalogLoader/JMCatalogLoader.vue";
import {
  loadFilamentInventory,
  loadFlossInventory,
  saveFilamentInventory,
  saveFlossInventory,
  savePageTasks,
} from "../app/page-tasks.js";
import { completedTasksLast, setTaskCompletion } from "../app/task-list.js";
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
      limits: APP_DATA_LIMITS,
      filamentCatalog,
      flossCatalog,
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      shopping: { ...shopping, history: shopping.history ?? [] },
      titles: createTitleEditor(shopping.tasks.filter((task) => !task.source)),
      notice: "",
    };
  },
  watch: {
    "filamentCatalog.state.status": "refreshSupplies",
    "flossCatalog.state.status": "refreshSupplies",
  },
  mounted() {
    this.subscriptions = [
      subscribeAppData("printing", () => this.refreshSupplies()),
      subscribeAppData("cross-stitch", () => this.refreshSupplies()),
      subscribeAppData("shopping", this.receiveShopping),
      subscribeAppData("filament-inventory", () => this.refreshSupplies()),
      subscribeAppData("floss-inventory", () => this.refreshSupplies()),
    ];
  },
  beforeUnmount() {
    this.editor.clear();
    for (const unsubscribe of this.subscriptions) unsubscribe();
  },
  methods: {
    receiveShopping() {
      this.editor.moves.clear();
      const shopping = syncSupplyShoppingLists();
      const current = new Map(this.shopping.tasks.map((task) => [task.id, task]));
      const tasks = shopping.tasks.map((item) => {
        const task = current.get(item.id);
        if (!item.source) this.titles.remember(item);
        if (!task) return item;
        const editingBlank = document.activeElement?.id === this.taskInputId(task) && !task.title.trim();
        Object.assign(
          task,
          { completed: false, completedAt: undefined },
          item,
          editingBlank ? { title: task.title } : {},
        );
        return task;
      });
      const ids = new Set(tasks.map((task) => task.id));
      tasks.push(...this.shopping.tasks.filter((task) => this.editor.drafts.has(task.id) && !ids.has(task.id)));
      this.shopping.tasks.splice(0, this.shopping.tasks.length, ...tasks);
      this.shopping.history = shopping.history ?? [];
    },
    refreshSupplies(status = "ready") {
      if (status !== "ready") return;
      const managed = new Map(
        syncSupplyShoppingLists()
          .tasks.filter((task) => task.source)
          .map((task) => [task.id, task]),
      );
      const tasks = this.shopping.tasks.flatMap((task) => {
        if (!task.source) return [task];
        const refreshed = managed.get(task.id);
        managed.delete(task.id);
        if (!refreshed) return [];
        Object.assign(task, refreshed);
        return [task];
      });
      tasks.push(...managed.values());
      this.shopping.tasks.splice(0, this.shopping.tasks.length, ...tasks);
    },
    taskInputId(task) {
      return `shopping-title-${task.id}`;
    },
    save() {
      savePageTasks("shopping", {
        ...this.shopping,
        tasks: this.titles.serialize(this.shopping.tasks, this.editor.drafts),
      });
    },
    updateTitle(task, title) {
      if (!task.source && this.titles.update(task, title)) this.save();
    },
    updateCompleted(task, completed) {
      if (task.completed === completed || !task.title.trim()) return;
      let inventory;
      let saveInventory;
      if (task.source) {
        const filament = task.source === "filament-shortage";
        inventory = filament ? loadFilamentInventory() : loadFlossInventory();
        saveInventory = filament ? saveFilamentInventory : saveFlossInventory;
        const id = task.filamentId ?? task.flossId;
        const owned = inventory[id] ?? 0;
        const quantity = task.quantity;
        const next = completed ? owned + quantity : Math.max(0, owned - quantity);
        if (next > APP_DATA_LIMITS.quantity) {
          const checkbox = document.getElementById(`task-item-complete-${task.id}`);
          if (checkbox) checkbox.checked = task.completed;
          this.notice = "This purchase exceeds the inventory limit. Update the quantity in Catalog first.";
          return;
        }
        inventory[id] = next;
        this.notice =
          !completed && owned < quantity
            ? "Inventory is now zero. Some of this purchase had already been removed from inventory."
            : "";
      }
      setTaskCompletion(task, completed);
      this.shopping.history = this.shopping.history.filter((item) => item.id !== task.id);
      // Both writes are durable absolute snapshots; retrying never increments stock again.
      this.save();
      if (inventory) {
        saveInventory(inventory);
        this.refreshSupplies();
      }
      this.editor.scheduleMove(task, completed, this.shopping.tasks);
    },
    removeTask(task) {
      if (task.source && !task.completed) return;
      const index = this.shopping.tasks.indexOf(task);
      if (index < 0) return;
      this.editor.moves.cancel(task.id);
      this.editor.drafts.delete(task.id);
      const history = new Map(this.shopping.history.map((item) => [item.id, item]));
      if (task.completedAt) history.set(task.id, { ...task, title: this.titles.title(task) });
      else history.delete(task.id);
      this.shopping.history = [...history.values()];
      this.titles.forget(task.id);
      this.shopping.tasks.splice(index, 1);
      this.save();
      const next = this.shopping.tasks[index] ?? this.shopping.tasks[index - 1];
      if (next) this.focusTask(next);
      else this.$nextTick(() => document.getElementById("shopping-add")?.focus());
    },
    addTask() {
      if (this.shopping.tasks.filter((task) => !task.source).length >= APP_DATA_LIMITS.tasks) {
        this.notice = "The shopping list can contain up to 2,000 manual items. Remove an item before adding another.";
        return;
      }
      this.notice = "";
      const task = {
        id: `shopping-${crypto.randomUUID()}`,
        title: "",
        completed: false,
      };
      const index = this.shopping.tasks.findIndex((item) => item.completed);
      this.editor.add(this.shopping.tasks, task, { index: index < 0 ? this.shopping.tasks.length : index });
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(task) {
      this.titles.restore(task);
      this.editor.finish(this.shopping.tasks, task);
    },
    handleEnter(task, event) {
      this.editor.enter(
        this.shopping.tasks.filter((item) => !item.source && (!item.completed || item.id === task.id)),
        task,
        event,
        { create: this.addTask, focus: this.focusTask },
      );
    },
    focusTask(task) {
      if (!task) return;
      if (task.source || task.productLink) this.editor.focus(`task-item-complete-${task.id}`);
      else this.editor.focus(this.taskInputId(task));
    },
  },
};
</script>

<template>
  <JMCatalogLoader :catalog="filamentCatalog" />
  <JMCatalogLoader :catalog="flossCatalog" />

  <p v-if="notice" role="status">{{ notice }}</p>
  <JMCard
    class="shopping-card"
    title="Shopping cart"
    empty-text="The shopping list is empty."
    :actions="[{ id: 'add', buttonId: 'shopping-add', label: 'Add item', icon: 'plus' }]"
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
        :removable="!task.source || task.completed"
        :editable="!task.source"
        :completion-disabled="!task.title.trim()"
        :title-maxlength="limits.title"
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
