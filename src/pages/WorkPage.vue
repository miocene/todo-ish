<script>
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import {
  calendarDate,
  canMoveWorkRange,
  getCalendarDays,
  getWorkRangeBounds,
  isIsoDate,
  isoDate,
  moveWorkRange,
  requestedDate,
} from "../app/work-calendar.js";
import { setWorkStatus, WORK_STATUSES } from "../app/work-status.js";
import { getAllWorkTasks } from "../app/work-tasks.mock.js";

const BACKLOG_DROP_TARGET = "backlog";

export default {
  name: "WorkPage",
  components: { JMButton, JMIcon },
  data() {
    const workTasks = getAllWorkTasks();
    return {
      backlogDropTarget: BACKLOG_DROP_TARGET,
      draggedTaskId: undefined,
      dragTarget: undefined,
      midnightTimer: undefined,
      rangeTransitionFrame: undefined,
      routeWatchReady: false,
      statusOptions: WORK_STATUSES,
      taskAssignments: Object.fromEntries(workTasks.map((task) => [task.id, task.date ?? null])),
      taskMoveStatus: "",
      today: calendarDate(),
      trackMoving: false,
      transitionDirection: "next",
      transitionFromDate: undefined,
      workTasks,
    };
  },
  watch: {
    "$route.query.date": {
      immediate: true,
      handler: "handleDateQueryChange",
    },
  },
  computed: {
    focusDate() {
      return requestedDate(this.$route.query.date, this.today);
    },
    rangeBounds() {
      return getWorkRangeBounds(this.today);
    },
    canGoPrevious() {
      return canMoveWorkRange(this.focusDate, -1, this.rangeBounds);
    },
    canGoNext() {
      return canMoveWorkRange(this.focusDate, 1, this.rangeBounds);
    },
    todayIso() {
      return isoDate(this.today);
    },
    days() {
      return this.getDaysWithTasks(this.focusDate);
    },
    backlogTasks() {
      return this.workTasks.filter((task) => this.taskAssignments[task.id] === null);
    },
    isRangeTransitioning() {
      return Boolean(this.transitionFromDate);
    },
    trackDays() {
      if (!this.transitionFromDate) return this.days;
      const outgoingDays = this.getDaysWithTasks(this.transitionFromDate);
      return this.transitionDirection === "next" ? [...outgoingDays, ...this.days] : [...this.days, ...outgoingDays];
    },
    rangeLabel() {
      return `${this.days[0].label} to ${this.days.at(-1).label}`;
    },
  },
  mounted() {
    this.scheduleTodayRefresh();
  },
  beforeUnmount() {
    window.cancelAnimationFrame(this.rangeTransitionFrame);
    window.clearTimeout(this.midnightTimer);
  },
  methods: {
    handleDateQueryChange(value, previousValue) {
      const date = requestedDate(value, this.today);
      if (this.routeWatchReady) {
        const previousDate = requestedDate(previousValue, this.today);
        if (isoDate(date) !== isoDate(previousDate)) this.startRangeTransition(previousDate, date);
      }
      this.routeWatchReady = true;
      this.normalizeDateQuery(value, date);
    },
    normalizeDateQuery(value, date = requestedDate(value, this.today)) {
      if (value === undefined || (isIsoDate(value) && isoDate(date) !== this.todayIso)) return;
      const query = { ...this.$route.query };
      delete query.date;
      this.$router.replace({ name: "work", query, hash: this.$route.hash });
    },
    navigateToRange(value) {
      if (this.isRangeTransitioning) return;
      const date = calendarDate(value);
      const dateIso = isoDate(date);
      const query = { ...this.$route.query };
      if (dateIso === this.todayIso) delete query.date;
      else query.date = dateIso;
      if (query.date === this.$route.query.date && !this.$route.hash) return;
      this.$router.push({ name: "work", query });
    },
    changeRange(amount) {
      if (!canMoveWorkRange(this.focusDate, amount, this.rangeBounds)) return;
      this.navigateToRange(moveWorkRange(this.focusDate, amount, this.rangeBounds));
    },
    goToday() {
      this.navigateToRange(this.today);
    },
    setDayStatus(date, value) {
      setWorkStatus(date, value);
    },
    getDaysWithTasks(focusDate) {
      return getCalendarDays(focusDate, this.todayIso).map((day) => ({
        ...day,
        tasks: this.workTasks.filter((task) => this.taskAssignments[task.id] === day.iso),
      }));
    },
    canDragTask(date) {
      return date === null || date >= this.todayIso;
    },
    toggleTaskAssignment(task) {
      this.moveTask(task, this.taskAssignments[task.id] === null ? this.todayIso : null);
    },
    moveTask(task, date) {
      if (this.taskAssignments[task.id] === date) return;
      this.taskAssignments[task.id] = date;
      const destination = date === null ? "backlog" : date === this.todayIso ? "today" : date;
      this.taskMoveStatus = `${task.title} moved to ${destination}.`;
    },
    startTaskDrag(task, event) {
      if (!this.canDragTask(this.taskAssignments[task.id])) {
        event.preventDefault();
        return;
      }
      this.draggedTaskId = task.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    },
    canDropTask(target) {
      if (!this.draggedTaskId) return false;
      const date = target === BACKLOG_DROP_TARGET ? null : target;
      return (date === null || date >= this.todayIso) && this.taskAssignments[this.draggedTaskId] !== date;
    },
    handleTaskDragOver(target, event) {
      if (!this.canDropTask(target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      this.dragTarget = target;
    },
    dropTask(target, event) {
      if (!this.canDropTask(target)) return;
      event.preventDefault();
      const task = this.workTasks.find((item) => item.id === this.draggedTaskId);
      if (task) this.moveTask(task, target === BACKLOG_DROP_TARGET ? null : target);
      this.endTaskDrag();
    },
    endTaskDrag() {
      this.draggedTaskId = undefined;
      this.dragTarget = undefined;
    },
    startRangeTransition(previousDate, date) {
      window.cancelAnimationFrame(this.rangeTransitionFrame);
      this.trackMoving = false;
      this.transitionDirection = date > previousDate ? "next" : "previous";

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.transitionFromDate = undefined;
        return;
      }

      this.transitionFromDate = previousDate;
      this.$nextTick(() => {
        this.rangeTransitionFrame = window.requestAnimationFrame(() => {
          this.rangeTransitionFrame = window.requestAnimationFrame(() => {
            this.trackMoving = true;
          });
        });
      });
    },
    finishRangeTransition(event) {
      if (event.target !== this.$refs.weekGrid || event.propertyName !== "transform") return;
      window.cancelAnimationFrame(this.rangeTransitionFrame);
      this.trackMoving = false;
      this.transitionFromDate = undefined;
    },
    scheduleTodayRefresh() {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      this.midnightTimer = window.setTimeout(
        () => {
          this.today = calendarDate();
          this.normalizeDateQuery(this.$route.query.date);
          this.scheduleTodayRefresh();
        },
        nextMidnight.getTime() - now.getTime() + 100,
      );
    },
  },
};
</script>

<template>
  <section class="calendar" aria-labelledby="work-page-title">
    <div class="calendar__header">
      <h1 id="work-page-title">Work</h1>
      <p class="calendar__status" aria-live="polite" aria-atomic="true">{{ rangeLabel }}</p>

      <JMButton
        aria-label="Previous three days"
        :disabled="isRangeTransitioning || !canGoPrevious"
        icon-name="arrow-left"
        view="secondary"
        @click="changeRange(-1)"
      />
      <JMButton :disabled="isRangeTransitioning" text="Today" view="secondary" @click="goToday" />
      <JMButton
        aria-label="Next three days"
        :disabled="isRangeTransitioning || !canGoNext"
        icon-name="arrow-right"
        view="secondary"
        @click="changeRange(1)"
      />
    </div>

    <p class="calendar__status" aria-live="polite" aria-atomic="true">{{ taskMoveStatus }}</p>

    <div class="calendar-board">
      <div class="calendar-board__days">
        <div
          ref="weekGrid"
          class="week-grid"
          :class="{
            'week-grid--moving': trackMoving,
            'week-grid--next': isRangeTransitioning && transitionDirection === 'next',
            'week-grid--previous': isRangeTransitioning && transitionDirection === 'previous',
          }"
          role="group"
          :aria-label="rangeLabel"
          :aria-busy="isRangeTransitioning"
          @transitioncancel="finishRangeTransition"
          @transitionend="finishRangeTransition"
        >
          <div
            v-for="day in trackDays"
            :key="day.iso"
            class="week-day"
            :class="{
              'week-day--today': day.today,
              'week-day--drop-target': dragTarget === day.iso,
            }"
            @dragover="handleTaskDragOver(day.iso, $event)"
            @drop="dropTask(day.iso, $event)"
          >
            <time class="week-day__heading" :datetime="day.iso">
              <span class="week-day__weekday">{{ day.weekday }}</span>
              <span class="week-day__date">
                <strong>{{ day.day }}</strong>
                <small>{{ day.month }}</small>
              </span>
            </time>
            <label class="calendar__status-select">
              <select
                :value="day.statusValue"
                :aria-label="`Status for ${day.label}`"
                @change="setDayStatus(day.iso, $event.target.value)"
              >
                <component :is="'button'" type="button">
                  <component :is="'selectedcontent'" />
                  <JMIcon name="chevron-down" />
                </component>
                <option v-for="status in statusOptions" :key="status.value" :value="status.value">
                  <JMIcon :name="status.icon" />
                  {{ status.label }}
                  <JMIcon v-if="status.value === day.statusValue" class="calendar__status-check" name="check" />
                </option>
              </select>
            </label>
            <JMIcon v-if="!day.tasks" name="spinner" label="Loading tasks" />
            <p v-else v-for="task in day.tasks" :key="task.id" class="task-item">
              <span
                v-if="canDragTask(day.iso)"
                class="task-item__drag-handle"
                draggable="true"
                aria-hidden="true"
                @dragend="endTaskDrag"
                @dragstart="startTaskDrag(task, $event)"
              >
                <JMIcon name="grip" />
              </span>
              <span v-else class="task-item__drag-handle-placeholder" />
              <span class="task-item__title">{{ task.title }}</span>
              <button
                class="task-item__pin"
                type="button"
                :aria-label="`Move ${task.title} to backlog`"
                @click="toggleTaskAssignment(task)"
              >
                <JMIcon name="pinned" />
              </button>
            </p>
          </div>
        </div>
      </div>

      <section
        class="backlog"
        :class="{ 'backlog--drop-target': dragTarget === backlogDropTarget }"
        aria-labelledby="backlog-title"
        @dragover="handleTaskDragOver(backlogDropTarget, $event)"
        @drop="dropTask(backlogDropTarget, $event)"
      >
        <header class="backlog__heading">
          <span class="week-day__weekday">Tasks</span>
          <h2 id="backlog-title">Backlog</h2>
        </header>
        <p v-if="backlogTasks.length === 0" class="backlog__empty">No backlog tasks</p>
        <p v-for="task in backlogTasks" :key="task.id" class="task-item">
          <span
            class="task-item__drag-handle"
            draggable="true"
            aria-hidden="true"
            @dragend="endTaskDrag"
            @dragstart="startTaskDrag(task, $event)"
          >
            <JMIcon name="grip" />
          </span>
          <span class="task-item__title">{{ task.title }}</span>
          <button
            class="task-item__pin"
            type="button"
            :aria-label="`Mark ${task.title} ready for today`"
            @click="toggleTaskAssignment(task)"
          >
            <JMIcon name="pin" />
          </button>
        </p>
      </section>
    </div>
  </section>
</template>
