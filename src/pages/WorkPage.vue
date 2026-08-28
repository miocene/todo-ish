<script>
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import { getWorkStatus, setWorkStatus, WORK_STATUSES } from "../app/work-status.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_DAY_COUNT = 3;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en", { weekday: "short" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });
const LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const SAMPLE_TASK_TITLES = [
  ["Triage inbox", "Prepare the quarterly planning notes"],
  ["Daily stand-up", "Review pull requests", "Pair on calendar navigation", "Update the team roadmap"],
  ["Document the release process and share it with the team"],
];

function localDate(value = new Date()) {
  if (typeof value === "string") return new Date(`${value}T12:00:00`);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function shiftDays(value, amount) {
  const date = localDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function isoDate(value) {
  const date = localDate(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isIsoDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const date = localDate(value);
  return !Number.isNaN(date.valueOf()) && isoDate(date) === value;
}

function requestedDate(value, fallback = new Date()) {
  return isIsoDate(value) ? localDate(value) : localDate(fallback);
}

function calendarDays(focusDate, todayIso) {
  return Array.from({ length: RANGE_DAY_COUNT }, (_, index) => {
    const date = shiftDays(focusDate, index - 1);
    const iso = isoDate(date);
    const status = getWorkStatus(iso);
    return {
      iso,
      weekday: WEEKDAY_FORMATTER.format(date),
      day: DAY_FORMATTER.format(date),
      month: MONTH_FORMATTER.format(date),
      label: LABEL_FORMATTER.format(date),
      statusValue: status.value,
      tasks: SAMPLE_TASK_TITLES[index].map((title, taskIndex) => ({
        id: `${iso}-${taskIndex}`,
        title,
      })),
      today: iso === todayIso,
    };
  });
}

export default {
  name: "WorkPage",
  components: { JMButton, JMIcon },
  data() {
    return {
      midnightTimer: undefined,
      rangeTransitionFrame: undefined,
      routeWatchReady: false,
      statusOptions: WORK_STATUSES,
      today: localDate(),
      trackMoving: false,
      transitionDirection: "next",
      transitionFromDate: undefined,
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
    todayIso() {
      return isoDate(this.today);
    },
    days() {
      return calendarDays(this.focusDate, this.todayIso);
    },
    isRangeTransitioning() {
      return Boolean(this.transitionFromDate);
    },
    trackDays() {
      if (!this.transitionFromDate) return this.days;
      const outgoingDays = calendarDays(this.transitionFromDate, this.todayIso);
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
      const date = localDate(value);
      const dateIso = isoDate(date);
      const query = { ...this.$route.query };
      if (dateIso === this.todayIso) delete query.date;
      else query.date = dateIso;
      if (query.date === this.$route.query.date && !this.$route.hash) return;
      this.$router.push({ name: "work", query });
    },
    changeRange(amount) {
      this.navigateToRange(shiftDays(this.focusDate, amount * RANGE_DAY_COUNT));
    },
    goToday() {
      this.navigateToRange(this.today);
    },
    setDayStatus(date, value) {
      setWorkStatus(date, value);
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
          this.today = localDate();
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
        :disabled="isRangeTransitioning"
        icon-name="arrow-left"
        view="secondary"
        @click="changeRange(-1)"
      />
      <JMButton :disabled="isRangeTransitioning" text="Today" view="secondary" @click="goToday" />
      <JMButton
        aria-label="Next three days"
        :disabled="isRangeTransitioning"
        icon-name="arrow-right"
        view="secondary"
        @click="changeRange(1)"
      />
    </div>

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
      <div v-for="day in trackDays" :key="day.iso" class="week-day" :class="{ 'week-day--today': day.today }">
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
        <p v-for="task in day.tasks" :key="task.id">{{ task.title }}</p>
      </div>
    </div>
  </section>
</template>
