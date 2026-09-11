<script>
import { APP_DATA_LIMITS } from "../../backend/api/src/app-data-contract.mjs";
import { appClock } from "../app/clock.js";
import { subscribeAppData } from "../app/app-data.js";
import { loadPageTasks, savePageTasks } from "../app/page-tasks.js";
import {
  setTaskCompletion,
  createCompletionMoveScheduler,
  moveItemForCompletion,
} from "../app/task-list.js";
import { calendarDate, shiftIsoDate, toIsoDate } from "../app/date.js";
import JMModal from "../components/JMModal/JMModal.vue";
import JMInput from "../components/JMInput/JMInput.vue";
import JMButton from "../components/JMButton/JMButton.vue";
import JMCard from "../components/JMCard/JMCard.vue";
import JMChoreSchedule from "../components/JMChoreSchedule/JMChoreSchedule.vue";
import {
  defaultChoreSchedule,
  nextChoreDate,
  choreScheduleLabel,
  choreDescription,
  sameChoreSchedule,
  retainChoreCompletion,
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
  components: {
    JMModal,
    JMInput,
    JMButton,
    JMCard,
    JMChoreSchedule,
    JMTaskItem,
  },
  data() {
    const chores = loadPageTasks("chores");
    return {
      limits: APP_DATA_LIMITS,
      chores: { ...chores, history: chores.history ?? [] },
      draft: null,
      intervalValid: true,
      editMessage: "",
      moves: createCompletionMoveScheduler(),
    };
  },
  mounted() {
    this.advanceChores();
    this.unsubscribeChores = subscribeAppData("chores", () => {
      this.moves.clear();
      const chores = loadPageTasks("chores");
      this.chores = { ...chores, history: chores.history ?? [] };
      this.advanceChores();
    });
  },
  watch: {
    todayIso() {
      this.advanceChores();
    },
  },
  beforeUnmount() {
    this.moves.clear();
    this.unsubscribeChores();
  },
  computed: {
    occurrencePreview() {
      if (!this.draft || !this.intervalValid) return null;
      const task = this.chores.tasks.find((item) => item.id === this.draft.id);
      const schedule = this.draft.schedule;
      if (task?.completed) {
        const completedDate = task.completedAt
          ? toIsoDate(new Date(task.completedAt))
          : this.todayIso;
        const after =
          completedDate > task.nextDue ? completedDate : task.nextDue;
        return {
          date: nextChoreDate(schedule, shiftIsoDate(after, 1)),
          label: "Next occurrence",
        };
      }
      if (
        task &&
        (task.nextDue <= this.todayIso ||
          sameChoreSchedule(task.schedule, schedule))
      ) {
        return {
          date: task.nextDue,
          label:
            task.nextDue < this.todayIso
              ? "Outstanding overdue occurrence"
              : "Next occurrence",
        };
      }
      return {
        date: nextChoreDate(schedule, this.todayIso),
        label: "Next occurrence",
      };
    },
    todayIso() {
      return appClock.state.today;
    },
    dueChores() {
      const tasksById = new Map(
        this.chores.tasks.map((task) => [task.id, task]),
      );
      return this.chores.occurrenceOrder
        .map((taskId) => tasksById.get(taskId))
        .filter((task) => task?.title.trim() && task.nextDue <= this.todayIso);
    },
  },
  methods: {
    description: choreDescription,
    previewDate(date) {
      return DUE_DATE_FORMATTER.format(calendarDate(date));
    },
    advanceChores() {
      let changed = false;
      for (const task of this.chores.tasks) {
        const previous = { ...task };
        if (advanceCompletedChore(task, this.todayIso)) {
          retainChoreCompletion(this.chores, previous);
          changed = true;
        }
      }
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
      this.moves.schedule(task.id, () => {
        if (
          moveItemForCompletion(this.chores.occurrenceOrder, task.id, completed)
        )
          this.save();
      });
    },
    addTask() {
      if (this.chores.tasks.length >= APP_DATA_LIMITS.tasks) {
        this.editMessage =
          "You can have up to 2,000 chores. Delete a chore before adding another.";
        return;
      }
      this.openEditor();
    },
    openEditor(task) {
      this.intervalValid = true;
      this.editMessage = "";
      this.draft = {
        id: task?.id ?? null,
        title: task?.title ?? "",
        legacyRule: task && !task.schedule ? task.details : "",
        schedule: task?.schedule
          ? {
              ...task.schedule,
              weekdays: [...task.schedule.weekdays],
              monthDays: [...task.schedule.monthDays],
            }
          : defaultChoreSchedule(this.todayIso),
      };
      this.$nextTick(() => this.$refs.choreModal.open());
    },
    saveDraft() {
      const { id, schedule } = this.draft;
      const title = this.draft.title.trim();
      let task = this.chores.tasks.find((item) => item.id === id);
      if (task) {
        const scheduleChanged = !sameChoreSchedule(task.schedule, schedule);
        if (task.title === title && !scheduleChanged) {
          return;
        }
        if (
          scheduleChanged &&
          !task.completed &&
          task.nextDue > this.todayIso
        ) {
          this.moves.cancel(task.id);
          const nextDue = nextChoreDate(schedule, this.todayIso);
          if (nextDue !== task.nextDue) setTaskCompletion(task, false);
          task.nextDue = nextDue;
        }
      } else {
        task = {
          id: `chore-${crypto.randomUUID()}`,
          nextDue: nextChoreDate(schedule, this.todayIso),
          completed: false,
        };
        this.chores.tasks.push(task);
        this.chores.occurrenceOrder.push(task.id);
      }
      Object.assign(task, {
        title,
        schedule,
        details: choreScheduleLabel(schedule),
      });
      this.save();
    },
    removeTask(task) {
      const index = this.chores.tasks.indexOf(task);
      if (index === -1) return;
      this.moves.cancel(task.id);
      retainChoreCompletion(this.chores, task);
      this.chores.tasks.splice(index, 1);
      this.chores.occurrenceOrder = this.chores.occurrenceOrder.filter(
        (id) => id !== task.id,
      );
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

  <p v-if="editMessage && !draft" role="status">{{ editMessage }}</p>

  <JMCard
    class="chores-due"
    title="Today and overdue"
    empty-text="No chores due"
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
          <span>{{ description(task) }}</span>
        </template>
      </JMTaskItem>
    </template>
  </JMCard>

  <JMCard
    ref="allCard"
    class="chores-all"
    title="All chores"
    empty-text="Add your first chore"
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
          <span>{{ description(task) }}</span>
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
    :title="draft?.id ? 'Edit chore' : 'Add chore'"
    :submit-text="draft?.id ? 'Save' : 'Add chore'"
    :submit-disabled="!draft?.title.trim() || !intervalValid"
    @submit="saveDraft"
    @close="draft = null"
  >
    <template v-if="draft">
      <JMInput
        v-model="draft.title"
        label="Title"
        placeholder="Chore title"
        required
        :maxlength="limits.title"
        autofocus
      />
      <p v-if="draft.legacyRule">
        Previous rule: {{ draft.legacyRule }}. Choose a schedule to confirm how
        this chore repeats.
      </p>
      <JMChoreSchedule
        v-model="draft.schedule"
        v-model:valid="intervalValid"
        :title="draft.title"
      />
      <p v-if="occurrencePreview" class="chore-preview" role="status">
        {{ occurrencePreview.label }}:
        <time :datetime="occurrencePreview.date">{{
          previewDate(occurrencePreview.date)
        }}</time
        >.
      </p>
    </template>
  </JMModal>
</template>
