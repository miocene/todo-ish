<script>
import JMButton from "../components/JMButton/JMButton.vue";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en", { weekday: "short" });
const DAY_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "short" });
const LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

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

export default {
  name: "WorkPage",
  components: { JMButton },
  data() {
    return {
      midnightTimer: undefined,
      today: localDate(),
      transitionName: "range-next",
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
      return Array.from({ length: 3 }, (_, index) => {
        const date = shiftDays(this.focusDate, index - 1);
        const iso = isoDate(date);
        return {
          iso,
          weekday: WEEKDAY_FORMATTER.format(date),
          day: DAY_FORMATTER.format(date),
          month: MONTH_FORMATTER.format(date),
          label: LABEL_FORMATTER.format(date),
          today: iso === this.todayIso,
        };
      });
    },
    rangeLabel() {
      return `${this.days[0].label} to ${this.days[2].label}`;
    },
    rangeKey() {
      return isoDate(this.focusDate);
    },
  },
  mounted() {
    this.scheduleTodayRefresh();
  },
  beforeUnmount() {
    window.clearTimeout(this.midnightTimer);
  },
  methods: {
    handleDateQueryChange(value, previousValue) {
      const date = requestedDate(value, this.today);
      if (previousValue !== undefined) {
        const previousDate = requestedDate(previousValue, this.today);
        if (date < previousDate) this.transitionName = "range-previous";
        if (date > previousDate) this.transitionName = "range-next";
      }
      this.normalizeDateQuery(value, date);
    },
    normalizeDateQuery(value, date = requestedDate(value, this.today)) {
      if (value === undefined || (isIsoDate(value) && isoDate(date) !== this.todayIso)) return;
      const query = { ...this.$route.query };
      delete query.date;
      this.$router.replace({ name: "work", query, hash: this.$route.hash });
    },
    navigateToRange(value) {
      const date = localDate(value);
      const dateIso = isoDate(date);
      const query = { ...this.$route.query };
      if (dateIso === this.todayIso) delete query.date;
      else query.date = dateIso;
      if (query.date === this.$route.query.date && !this.$route.hash) return;
      this.$router.push({ name: "work", query });
    },
    changeRange(amount) {
      this.navigateToRange(shiftDays(this.focusDate, amount * 3));
    },
    goToday() {
      this.navigateToRange(this.today);
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
  <section class="calendar-experiment" aria-labelledby="work-page-title">
    <h1 id="work-page-title" class="calendar-experiment__title">Work</h1>
    <p class="calendar-experiment__status" aria-live="polite" aria-atomic="true">{{ rangeLabel }}</p>

    <div class="calendar-toolbar">
      <JMButton text="Today" view="secondary" @click="goToday" />
    </div>

    <div class="week-control week-control--previous">
      <JMButton aria-label="Previous three days" icon-name="arrow-left" view="secondary" @click="changeRange(-1)" />
    </div>

    <div class="week-stage">
      <Transition :name="transitionName">
        <div :key="rangeKey" class="week-grid" role="group" :aria-label="rangeLabel">
          <div v-for="day in days" :key="day.iso" class="week-day" :class="{ 'week-day--today': day.today }">
            <time class="week-day__heading" :datetime="day.iso">
              <span class="week-day__weekday">{{ day.weekday }}</span>
              <span class="week-day__date">
                <strong>{{ day.day }}</strong>
                <small>{{ day.month }}</small>
              </span>
            </time>
          </div>
        </div>
      </Transition>
    </div>

    <div class="week-control week-control--next">
      <JMButton aria-label="Next three days" icon-name="arrow-right" view="secondary" @click="changeRange(1)" />
    </div>
  </section>
</template>

<style>
.calendar-experiment {
  --calendar-accent: #1967d2;
  --calendar-border: #dadce0;
  --calendar-muted: #70757a;
  --calendar-surface: #fff;

  display: grid;
  grid-template-columns: clamp(48px, 6vw, 80px) minmax(0, 1fr) clamp(48px, 6vw, 80px);
  grid-template-rows: auto minmax(0, 1fr);
  block-size: 100%;
  min-inline-size: 0;
  overflow: hidden;
  color: #202124;
  background: #f8f9fa;
  font-family: Arial, sans-serif;
}

.calendar-experiment__title,
.calendar-experiment__status {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.calendar-toolbar {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  justify-content: center;
  padding: 12px;
  background: var(--calendar-surface);
  border: 1px solid var(--calendar-border);
  border-block-start: 0;
}

.week-stage {
  position: relative;
  grid-column: 2;
  grid-row: 2;
  min-inline-size: 0;
  overflow: hidden;
  background: var(--calendar-surface);
  border-inline: 1px solid var(--calendar-border);
}

.week-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  background: var(--calendar-surface);
}

.week-day {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  color: inherit;
  background: var(--calendar-surface);
  border-inline-end: 1px solid var(--calendar-border);
}

.week-day:last-child {
  border-inline-end: 0;
}

.week-day__heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: clamp(12px, 2.5vh, 24px);
  min-block-size: clamp(112px, 16vh, 148px);
  padding: clamp(18px, 4vh, 40px) 6px;
  color: inherit;
  border-block-end: 1px solid var(--calendar-border);
}

.week-day__weekday {
  overflow: hidden;
  color: var(--calendar-muted);
  font-size: clamp(10px, 1.1vw, 13px);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-overflow: ellipsis;
  text-transform: uppercase;
}

.week-day__date {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  inline-size: clamp(42px, 5vw, 56px);
  block-size: clamp(42px, 5vw, 56px);
  border-radius: 50%;
}

.week-day__date strong {
  font-size: clamp(18px, 2.2vw, 26px);
  font-weight: 400;
  line-height: 1;
}

.week-day__date small {
  margin-block-start: 3px;
  font-size: clamp(8px, 0.9vw, 11px);
  line-height: 1;
  text-transform: uppercase;
}

.week-day--today .week-day__weekday {
  color: var(--calendar-accent);
  font-weight: 700;
}

.week-day--today .week-day__date {
  color: #fff;
  background: var(--calendar-accent);
}

.week-control {
  position: relative;
  z-index: 2;
  align-self: center;
  justify-self: center;
}

.week-control--previous {
  grid-column: 1;
  grid-row: 2;
}

.week-control--next {
  grid-column: 3;
  grid-row: 2;
}

.range-next-enter-active,
.range-next-leave-active,
.range-previous-enter-active,
.range-previous-leave-active {
  transition:
    opacity 280ms ease,
    transform 340ms cubic-bezier(0.2, 0, 0, 1);
}

.range-next-enter-from,
.range-previous-leave-to {
  opacity: 0.4;
  transform: translateX(100%);
}

.range-next-leave-to,
.range-previous-enter-from {
  opacity: 0.4;
  transform: translateX(-100%);
}

@media (width <= 640px) {
  .calendar-experiment {
    grid-template-columns: 42px minmax(0, 1fr) 42px;
  }

  .week-day__heading {
    padding-inline: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .range-next-enter-active,
  .range-next-leave-active,
  .range-previous-enter-active,
  .range-previous-leave-active {
    transition: none;
  }
}
</style>
