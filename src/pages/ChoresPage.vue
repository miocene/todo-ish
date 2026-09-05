<script>
import { createTaskEditor } from "../app/task-editor.js";
import { appClock } from "../app/clock.js";
import { loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { nextEntityId, setTaskCompletion, serializableChores } from "../app/task-list.js";
import { calendarDate, isoDate } from "../app/work-calendar.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMTaskCard from "../components/JMTaskCard/JMTaskCard.vue";

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export default {
  name: "ChoresPage",
  components: { JMButton, JMTaskCard },
  data() {
    return {
      chores: loadPageTasks("chores"),
      editor: createTaskEditor({
        save: () => this.save(),
      }),
    };
  },
  beforeUnmount() {
    this.editor.clear();
  },
  computed: {
    todayIso() {
      return appClock.state.today;
    },
    upcomingChores() {
      const tasksById = new Map(this.chores.tasks.map((task) => [task.id, task]));
      return this.chores.occurrenceOrder.map((taskId) => tasksById.get(taskId)).filter((task) => task?.title.trim());
    },
  },
  methods: {
    taskInputId(task) {
      return `chore-title-${task.id}`;
    },
    ruleInputId(task) {
      return `chore-rule-${task.id}`;
    },
    dueLabel(task) {
      if (task.nextDue === this.todayIso) return "Today";
      const tomorrow = calendarDate();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (task.nextDue === isoDate(tomorrow)) return "Tomorrow";
      return DUE_DATE_FORMATTER.format(calendarDate(task.nextDue));
    },
    save() {
      savePageTasks("chores", serializableChores(this.chores, this.editor.drafts));
    },
    updateTitle(task, title) {
      task.title = title;
      this.save();
    },
    updateRule(task, details) {
      task.details = details;
      this.save();
    },
    updateCompleted(task, completed) {
      setTaskCompletion(task, completed);
      this.save();
      this.editor.scheduleMove(task, completed, this.chores.occurrenceOrder, task.id);
    },
    addTask() {
      const task = {
        id: nextEntityId(this.chores.tasks, "chore"),
        title: "",
        details: "Repeats weekly",
        nextDue: this.todayIso,
        completed: false,
      };
      this.chores.occurrenceOrder.push(task.id);
      this.editor.add(this.chores.tasks, task);
      this.focusTask(task);
      return task;
    },
    handleTitleBlur(task) {
      this.editor.finish(this.chores.tasks, task, () => {
        const index = this.chores.occurrenceOrder.indexOf(task.id);
        if (index !== -1) this.chores.occurrenceOrder.splice(index, 1);
      });
    },
    handleEnter(task, event) {
      this.editor.enter(this.chores.tasks, task, event, { create: this.addTask, focus: this.focusTask });
    },
    focusTask(task) {
      if (task) this.editor.focus(this.taskInputId(task));
    },
  },
};
</script>

<template>
  <section class="task-page" aria-labelledby="chores-title">
    <header class="task-page__header">
      <div>
        <h1 id="chores-title">Chores</h1>
        <p>Recurring jobs around the house.</p>
      </div>
    </header>

    <section class="task-page__section chores-upcoming" aria-labelledby="upcoming-chores-title">
      <h2 id="upcoming-chores-title">Today and upcoming</h2>
      <ul class="task-page__tasks" role="list">
        <li v-for="task in upcomingChores" :key="`occurrence-${task.id}`">
          <JMTaskCard
            :task-id="`occurrence-${task.id}`"
            :title="task.title"
            :completed="task.completed"
            :editable="false"
            @update:completed="updateCompleted(task, $event)"
          >
            <template #details>
              <time :datetime="task.nextDue">{{ dueLabel(task) }}</time>
              <span aria-hidden="true"> · </span>
              <span>{{ task.details }}</span>
            </template>
          </JMTaskCard>
        </li>
      </ul>
    </section>

    <section class="task-page__section chores-all" aria-labelledby="all-chores-title">
      <header class="task-page__section-header">
        <h2 id="all-chores-title">All chores</h2>
        <JMButton text="Add chore" view="secondary" @click="addTask" />
      </header>
      <ul class="task-page__tasks" role="list">
        <li v-for="task in chores.tasks" :key="task.id">
          <JMTaskCard
            :task-id="task.id"
            :title="task.title"
            :title-input-id="taskInputId(task)"
            :completable="false"
            @enter="handleEnter(task, $event)"
            @title-blur="handleTitleBlur(task)"
            @update:title="updateTitle(task, $event)"
          >
            <template #details>
              <label class="task-item__visually-hidden" :for="ruleInputId(task)">
                Repeating rule for {{ task.title || "untitled chore" }}
              </label>
              <input
                :id="ruleInputId(task)"
                class="chore-rule"
                name="chore-repeat-rule"
                :value="task.details"
                @input="updateRule(task, $event.target.value)"
              />
            </template>
          </JMTaskCard>
        </li>
      </ul>
    </section>
  </section>
</template>
