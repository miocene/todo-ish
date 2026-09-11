<script>
import { APP_DATA_LIMITS } from "../../backend/api/src/app-data-contract.mjs";
import { subscribeAppData } from "../app/app-data.js";
import { createTaskEditor, createTitleEditor } from "../app/task-editor.js";
import { randomCardColor } from "../app/card-colors.js";
import { loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { completedTasksLast, setTaskCompletion } from "../app/task-list.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskItem from "../components/JMTaskItem/JMTaskItem.vue";
import JMCard from "../components/JMCard/JMCard.vue";
import JMModal from "../components/JMModal/JMModal.vue";
import JMInput from "../components/JMInput/JMInput.vue";

export default {
  name: "TodoListsPage",
  components: { JMButton, JMTaskItem, JMCard, JMModal, JMInput },
  data() {
    const todos = loadPageTasks("todos");
    for (const list of todos.lists) list.tasks = completedTasksLast(list.tasks);
    return {
      limits: APP_DATA_LIMITS,
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      todos: { ...todos, history: todos.history ?? [] },
      titles: createTitleEditor(todos.lists.flatMap((list) => list.tasks)),
      limitMessage: "",
      listName: "",
    };
  },
  beforeUnmount() {
    this.unsubscribeTodos();
    this.editor.clear();
  },
  mounted() {
    this.unsubscribeTodos = subscribeAppData("todos", () => {
      this.editor.clear();
      const todos = loadPageTasks("todos");
      this.todos = { ...todos, history: todos.history ?? [] };
      this.titles = createTitleEditor(
        todos.lists.flatMap((list) => list.tasks),
      );
    });
    if (this.ensureGeneral()) this.save();
  },
  methods: {
    ensureGeneral() {
      if (this.todos.lists.some((list) => list.id === "general")) return false;
      if (this.todos.lists.length >= APP_DATA_LIMITS.lists) {
        this.limitMessage =
          "Delete a list to make room for General. You can have up to 100 lists.";
        return false;
      }
      this.todos.lists.unshift({
        id: "general",
        title: "General",
        color: randomCardColor(),
        tasks: [],
      });
      return true;
    },
    openNewList() {
      if (this.todos.lists.length >= APP_DATA_LIMITS.lists) {
        this.limitMessage =
          "You can have up to 100 lists. Delete a list before adding another.";
        return;
      }
      this.limitMessage = "";
      this.listName = "";
      this.$refs.newListModal.open();
    },
    addList() {
      const title = this.listName.trim();
      const list = {
        id: `list-${crypto.randomUUID()}`,
        title,
        color: randomCardColor(),
        tasks: [],
      };
      this.todos.lists.push(list);
      this.save();
      this.focusListActions(list);
    },
    listActions(list) {
      return [
        {
          id: "add",
          buttonId: `todo-add-${list.id}`,
          label: `Add task to ${list.title}`,
          icon: "plus",
        },
        ...(list.id === "general"
          ? []
          : [
              {
                id: "remove",
                label: `Delete ${list.title} list`,
                icon: "remove",
              },
            ]),
      ];
    },
    listAction(list, action) {
      if (action === "add") this.addTask(list);
      else if (action === "remove") this.removeList(list);
    },
    removeList(list) {
      if (list.id === "general") return;
      this.retainRemovedTasks(list.tasks);
      this.todos.lists = this.todos.lists.filter((item) => item.id !== list.id);
      this.limitMessage = "";
      this.ensureGeneral();
      this.save();
      this.$nextTick(() => this.$refs.newListButton.$el.focus());
    },
    taskInputId(task) {
      return `todo-title-${task.id}`;
    },
    removeTask(list, task) {
      const index = list.tasks.indexOf(task);
      if (index === -1) return;
      this.retainRemovedTasks([task]);
      list.tasks.splice(index, 1);
      this.save();
      const next = list.tasks[index] ?? list.tasks[index - 1];
      if (next) this.focusTask(next);
      else this.focusListActions(list);
    },
    focusListActions(list) {
      this.$nextTick(() => {
        const card = document.getElementById(`todo-list-${list.id}`);
        const action =
          card?.querySelector("button[popovertarget]") ||
          document.getElementById(`todo-add-${list.id}`);
        action?.focus();
      });
    },
    retainRemovedTasks(tasks) {
      const history = new Map(
        this.todos.history.map((item) => [item.id, item]),
      );
      for (const task of tasks) {
        this.editor.moves.cancel(task.id);
        this.editor.drafts.delete(task.id);
        const title = this.titles.title(task);
        if (task.completedAt && title) history.set(task.id, { ...task, title });
        else history.delete(task.id);
        this.titles.forget(task.id);
      }
      this.todos.history = [...history.values()];
    },
    save() {
      savePageTasks("todos", {
        ...this.todos,
        lists: this.todos.lists.map((list) => ({
          ...list,
          tasks: this.titles.serialize(list.tasks, this.editor.drafts),
        })),
      });
    },
    updateTitle(task, title) {
      if (this.titles.update(task, title)) this.save();
    },
    updateCompleted(list, task, completed) {
      if (!task.title.trim() || task.completed === completed) return;
      setTaskCompletion(task, completed);
      if (!completed)
        this.todos.history = this.todos.history.filter(
          (item) => item.id !== task.id,
        );
      this.save();
      this.editor.scheduleMove(task, completed, list.tasks);
    },
    addTask(list) {
      if (list.tasks.length >= APP_DATA_LIMITS.tasks) {
        this.limitMessage =
          "A list can contain up to 2,000 tasks. Delete a task before adding another.";
        return;
      }
      this.limitMessage = "";
      const task = {
        id: `todo-${crypto.randomUUID()}`,
        title: "",
        completed: false,
      };
      const completedIndex = list.tasks.findIndex((item) => item.completed);
      this.editor.add(list.tasks, task, {
        index: completedIndex < 0 ? list.tasks.length : completedIndex,
      });
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(list, task) {
      this.titles.restore(task);
      this.editor.finish(list.tasks, task);
    },
    handleEnter(list, task, event) {
      this.editor.enter(
        list.tasks.filter((item) => !item.completed || item.id === task.id),
        task,
        event,
        { create: () => this.addTask(list), focus: this.focusTask },
      );
    },
    focusTask(task) {
      if (task) this.editor.focus(this.taskInputId(task));
    },
  },
};
</script>

<template>
  <header class="page-header">
    <h1>Todo lists</h1>
    <JMButton
      ref="newListButton"
      text="New list"
      view="secondary"
      @click="openNewList"
    />
  </header>

  <p v-if="limitMessage" role="status">{{ limitMessage }}</p>

  <JMCard
    v-for="list in todos.lists"
    :id="`todo-list-${list.id}`"
    :key="list.id"
    class="todo-list-card"
    :title="list.title"
    :color="list.color"
    empty-text="No tasks yet"
    :actions="listActions(list)"
    collapsible
    @action="listAction(list, $event)"
  >
    <template v-if="list.tasks.length" #list>
      <JMTaskItem
        v-for="task in list.tasks"
        :key="task.id"
        :task-id="task.id"
        :title="task.title"
        :title-input-id="taskInputId(task)"
        :completed="task.completed"
        :completion-disabled="!task.title.trim()"
        :title-maxlength="limits.title"
        removable
        :remove-label="`Delete ${task.title || 'untitled task'}`"
        @remove="removeTask(list, task)"
        @enter="handleEnter(list, task, $event)"
        @title-blur="handleTitleBlur(list, task)"
        @update:completed="updateCompleted(list, task, $event)"
        @update:title="updateTitle(task, $event)"
      />
    </template>
  </JMCard>

  <JMModal
    ref="newListModal"
    class="todo-list-modal"
    title="New list"
    submit-text="Create list"
    :submit-disabled="!listName.trim()"
    @submit="addList"
  >
    <JMInput
      v-model="listName"
      label="List name"
      required
      :maxlength="limits.title"
      autofocus
    />
  </JMModal>
</template>
