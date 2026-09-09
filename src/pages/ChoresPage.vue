<script>
import { loadCardColors } from "../app/card-colors.js";
import { appClock } from "../app/clock.js";
import { loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import { nextEntityId, setTaskCompletion, createCompletionMoveScheduler, moveItemToEnd } from "../app/task-list.js";
import { calendarDate } from "../app/work-calendar.js";
import JMModal from "../components/JMModal/JMModal.vue";
import JMInput from "../components/JMInput/JMInput.vue";
import JMButton from "../components/JMButton/JMButton.vue";
import JMCard from "../components/JMCard/JMCard.vue";
import JMChoreSchedule from "../components/JMChoreSchedule/JMChoreSchedule.vue";
import {
  defaultChoreSchedule,
  nextChoreDate,
  choreScheduleLabel,
  advanceCompletedChore,
} from "../app/chore-schedule.js";
import JMTaskItem from "../components/JMTaskItem/JMTaskItem.vue";

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export default {
  name: "ChoresPage",
  components: { JMModal, JMInput, JMButton, JMCard, JMChoreSchedule, JMTaskItem },
  data() {
    return {
      cardColors: loadCardColors(["chores-today", "chores-all"]),
      chores: loadPageTasks("chores"),
      draft: null,
      moves: createCompletionMoveScheduler(),
    };
  },
  mounted() {
    this.advanceChores();
  },
  watch: {
    todayIso() {
      this.advanceChores();
    },
  },
  beforeUnmount() {
    this.moves.clear();
  },
  computed: {
    todayIso() {
      return appClock.state.today;
    },
    dueChores() {
      const tasksById = new Map(this.chores.tasks.map((task) => [task.id, task]));
      return this.chores.occurrenceOrder
        .map((taskId) => tasksById.get(taskId))
        .filter((task) => task?.title.trim() && task.nextDue <= this.todayIso);
    },
  },
  methods: {
    scheduleLabel: choreScheduleLabel,
    advanceChores() {
      let changed = false;
      for (const task of this.chores.tasks) changed = advanceCompletedChore(task, this.todayIso) || changed;
      if (changed) this.save();
    },
    dueLabel(task) {
      if (task.nextDue === this.todayIso) return "Today";
      return DUE_DATE_FORMATTER.format(calendarDate(task.nextDue));
    },
    save() {
      savePageTasks("chores", this.chores);
    },
    updateCompleted(task, completed) {
      setTaskCompletion(task, completed);
      this.save();
      this.moves.schedule(task.id, completed, () => {
        if (moveItemToEnd(this.chores.occurrenceOrder, task.id)) this.save();
      });
    },
    addTask() {
      this.openEditor();
    },
    openEditor(task) {
      this.draft = {
        id: task?.id ?? null,
        title: task?.title ?? "",
        schedule: task
          ? { ...task.schedule, weekdays: [...task.schedule.weekdays], monthDays: [...task.schedule.monthDays] }
          : defaultChoreSchedule(this.todayIso),
      };
      this.$nextTick(() => this.$refs.choreModal.open());
    },
    saveDraft() {
      const { id, schedule } = this.draft;
      const title = this.draft.title.trim();
      if (!title) return;
      let task = this.chores.tasks.find((item) => item.id === id);
      if (id && !task) return;
      if (task) {
        if (JSON.stringify(task.schedule) !== JSON.stringify(schedule)) {
          this.moves.cancel(task.id);
          const nextDue = nextChoreDate(schedule, this.todayIso);
          if (nextDue !== task.nextDue) setTaskCompletion(task, false);
          task.nextDue = nextDue;
        }
      } else {
        task = {
          id: nextEntityId(this.chores.tasks, "chore"),
          nextDue: nextChoreDate(schedule, this.todayIso),
          completed: false,
        };
        this.chores.tasks.push(task);
        this.chores.occurrenceOrder.push(task.id);
      }
      Object.assign(task, { title, schedule, details: choreScheduleLabel(schedule) });
      this.save();
      this.$refs.choreModal.close();
    },
    removeTask(task) {
      const index = this.chores.tasks.indexOf(task);
      if (index === -1) return;
      this.moves.cancel(task.id);
      this.chores.tasks.splice(index, 1);
      this.chores.occurrenceOrder = this.chores.occurrenceOrder.filter((id) => id !== task.id);
      this.save();
      const next = this.chores.tasks[index] ?? this.chores.tasks[index - 1];
      this.$nextTick(() => {
        const button = next
          ? document.getElementById(`chore-edit-${next.id}`)
          : this.$refs.allCard.$el.querySelector("header button");
        button?.focus();
      });
    },
  },
};
</script>

<template>
  <header class="page-header">
    <h1>Chores</h1>
  </header>

  <JMCard
    class="chores-upcoming"
    title="Today and overdue"
    empty-text="No chores due"
    :color="cardColors['chores-today']"
  >
    <template v-if="dueChores.length" #list>
      <JMTaskItem
        v-for="task in dueChores"
        :key="`occurrence-${task.id}`"
        :task-id="`occurrence-${task.id}`"
        :title="task.title"
        :completed="task.completed"
        :editable="false"
        @update:completed="updateCompleted(task, $event)"
      >
        <template #details>
          <time :datetime="task.nextDue">{{ dueLabel(task) }}</time>
          <span aria-hidden="true"> · </span>
          <span>{{ scheduleLabel(task.schedule) }}</span>
        </template>
      </JMTaskItem>
    </template>
  </JMCard>

  <JMCard
    ref="allCard"
    class="chores-all"
    title="All chores"
    empty-text="Add your first chore"
    :color="cardColors['chores-all']"
    :actions="[{ id: 'add', label: 'Add chore', icon: 'plus' }]"
    collapsible
    @action="addTask"
  >
    <template v-if="chores.tasks.length" #list>
      <JMTaskItem
        v-for="task in chores.tasks"
        :key="task.id"
        :task-id="task.id"
        :title="task.title"
        :completable="false"
        :editable="false"
        removable
        :remove-label="`Delete ${task.title || 'untitled chore'}`"
        @remove="removeTask(task)"
      >
        <template #details>
          <span>{{ scheduleLabel(task.schedule) }}</span>
        </template>
        <template #actions>
          <JMButton
            :id="`chore-edit-${task.id}`"
            size="s"
            view="ghost"
            icon-name="edit"
            :aria-label="`Edit ${task.title || 'untitled chore'}`"
            @click="openEditor(task)"
          />
        </template>
      </JMTaskItem>
    </template>
  </JMCard>
  <JMModal
    ref="choreModal"
    class="chore-modal"
    :aria-label="draft?.id ? 'Edit chore' : 'Add chore'"
    @close="draft = null"
  >
    <form v-if="draft" class="chore-form" @submit.prevent="saveDraft">
      <h2>{{ draft.id ? "Edit chore" : "Add chore" }}</h2>
      <JMInput v-model="draft.title" label="Title" placeholder="Chore title" required autofocus />
      <JMChoreSchedule v-model="draft.schedule" :title="draft.title" />
      <div class="chore-form__actions">
        <JMButton text="Cancel" view="ghost" @click="$refs.choreModal.close()" />
        <JMButton type="submit" :text="draft.id ? 'Save' : 'Add chore'" :disabled="!draft.title.trim()" />
      </div>
    </form>
  </JMModal>
</template>

<style scoped>
.chore-modal {
  inline-size: min(28rem, calc(100% - var(--space-9)));
  max-block-size: calc(100dvh - var(--space-9));
  padding: var(--space-5);
  border: 0;
  border-radius: var(--radius-card);
  color: var(--color-text-default);
  background: var(--color-bg-surface);
}

.chore-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.chore-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>
