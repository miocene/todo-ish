<script>
import { createTaskEditor } from "../app/task-editor.js";
import { randomCardColor } from "../app/card-colors.js";
import { loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { completedTasksLast, setTaskCompletion, serializableTasks } from "../app/task-list.js";
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
      editor: createTaskEditor({
        save: () => this.save(),
      }),
      todos,
      listName: "",
    };
  },
  beforeUnmount() {
    this.editor.clear();
  },
  mounted() {
    if (!this.todos.lists.some((list) => list.id === "general")) {
      this.todos.lists.unshift({ id: "general", title: "General", color: randomCardColor(), tasks: [] });
      this.save();
    }
  },
  methods: {
    openNewList() {
      this.listName = "";
      this.$refs.newListModal.open();
    },
    addList() {
      const title = this.listName.trim();
      if (!title || title.length > 500) return;
      const list = { id: `list-${crypto.randomUUID()}`, title, color: randomCardColor(), tasks: [] };
      this.todos.lists.push(list);
      this.save();
      this.$refs.newListModal.close();
    },
    listActions(list) {
      return [
        { id: "add", label: `Add task to ${list.title}`, icon: "plus" },
        ...(list.id === "general" ? [] : [{ id: "remove", label: `Delete ${list.title} list`, icon: "remove" }]),
      ];
    },
    listAction(list, action) {
      if (action === "add") this.addTask(list);
      else if (action === "remove") this.removeList(list);
    },
    removeList(list) {
      if (list.id === "general") return;
      const history = new Map((this.todos.history ?? []).map((task) => [task.id, task]));
      for (const task of list.tasks) {
        this.editor.moves.cancel(task.id);
        this.editor.drafts.delete(task.id);
        if (task.completedAt) history.set(task.id, { ...task });
      }
      if (history.size) this.todos.history = [...history.values()];
      this.todos.lists = this.todos.lists.filter((item) => item.id !== list.id);
      this.save();
      this.$nextTick(() => this.$refs.newListButton.$el.focus());
    },
    taskInputId(task) {
      return `todo-title-${task.id}`;
    },
    removeTask(list, task) {
      const index = list.tasks.indexOf(task);
      if (index === -1) return;
      this.editor.moves.cancel(task.id);
      this.editor.drafts.delete(task.id);
      if (task.completedAt) {
        const history = new Map((this.todos.history ?? []).map((item) => [item.id, item]));
        history.set(task.id, { ...task });
        this.todos.history = [...history.values()];
      }
      list.tasks.splice(index, 1);
      this.save();
      const next = list.tasks[index] ?? list.tasks[index - 1];
      if (next) this.focusTask(next);
      else
        this.$nextTick(() => document.getElementById(`todo-list-${list.id}`)?.querySelector("header button")?.focus());
    },
    save() {
      savePageTasks("todos", {
        ...this.todos,
        lists: this.todos.lists.map((list) => ({
          ...list,
          tasks: serializableTasks(list.tasks, this.editor.drafts),
        })),
      });
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateCompleted(list, task, completed) {
      setTaskCompletion(task, completed);
      this.save();
      this.scheduleCompletedTaskMove(list, task, completed);
    },
    scheduleCompletedTaskMove(list, task, completed) {
      this.editor.scheduleMove(task, completed, list.tasks);
    },
    addTask(list) {
      const task = {
        id: `todo-${crypto.randomUUID()}`,
        title: "",
        completed: false,
      };
      this.editor.add(list.tasks, task);
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(list, task) {
      this.editor.finish(list.tasks, task);
    },
    handleEnter(list, task, event) {
      this.editor.enter(list.tasks, task, event, { create: () => this.addTask(list), focus: this.focusTask });
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
    <JMButton ref="newListButton" text="New list" view="secondary" @click="openNewList" />
  </header>

  <JMCard
    v-for="list in todos.lists"
    :id="`todo-list-${list.id}`"
    :key="list.id"
    class="todo-list-card"
    :title="list.title"
    :color="list.color"
    empty-text="No tasks yet"
    :actions="listActions(list)"
    inline-actions
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

  <JMModal ref="newListModal" class="todo-list-modal" aria-label="New list">
    <form class="todo-list-form" @submit.prevent="addList">
      <h2>New list</h2>
      <JMInput v-model="listName" label="List name" required maxlength="500" autofocus />
      <div class="todo-list-form__actions">
        <JMButton text="Cancel" view="ghost" @click="$refs.newListModal.close()" />
        <JMButton text="Create list" type="submit" :disabled="!listName.trim()" />
      </div>
    </form>
  </JMModal>
</template>
