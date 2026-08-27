<script>
import JMButton from "../components/JMButton/JMButton.vue";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function requestedDate() {
  const value = new URLSearchParams(window.location.hash.slice(1)).get("date");
  return isIsoDate(value) ? localDate(value) : localDate();
}

export default {
  name: "WorkPage",
  components: { JMButton },
  data() {
    const today = localDate();
    return {
      focusDate: requestedDate(),
      today,
      transitionName: "range-next",
      transitionsReady: false,
    };
  },
  computed: {
    days() {
      return Array.from({ length: 3 }, (_, index) => {
        const date = shiftDays(this.focusDate, index - 1);
        return {
          date,
          iso: isoDate(date),
          weekday: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
          day: new Intl.DateTimeFormat("en", { day: "numeric" }).format(date),
          month: new Intl.DateTimeFormat("en", { month: "short" }).format(date),
          label: new Intl.DateTimeFormat("en", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(date),
          today: isoDate(date) === isoDate(this.today),
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
    window.addEventListener("hashchange", this.syncRangeFromUrl);
    window.addEventListener("popstate", this.syncRangeFromUrl);
    this.syncRangeFromUrl();
    this.$nextTick(() => {
      this.transitionsReady = true;
    });
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncRangeFromUrl);
    window.removeEventListener("popstate", this.syncRangeFromUrl);
  },
  methods: {
    writeDateHash(date, replace) {
      const url = new URL(window.location.href);
      url.hash = `date=${isoDate(date)}`;
      if (url.href === window.location.href) return;
      window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
    },
    navigateToRange(value, { replace = false } = {}) {
      const date = localDate(value);
      if (date < this.focusDate) this.transitionName = "range-previous";
      if (date > this.focusDate) this.transitionName = "range-next";
      this.focusDate = date;
      this.writeDateHash(date, replace);
    },
    syncRangeFromUrl() {
      this.navigateToRange(requestedDate(), { replace: true });
    },
    changeRange(amount) {
      this.navigateToRange(shiftDays(this.focusDate, amount * 3));
    },
    goToday() {
      this.navigateToRange(this.today);
    },
  },
};
</script>

<template>
  <section class="calendar-experiment" aria-label="Three-day calendar">
    <div class="calendar-toolbar">
      <JMButton text="Today" view="secondary" @click="goToday" />
    </div>

    <div class="week-control week-control--previous">
      <JMButton aria-label="Previous three days" icon-name="arrow-left" view="secondary" @click="changeRange(-1)" />
    </div>

    <div class="week-stage" aria-live="polite">
      <Transition :name="transitionName" :css="transitionsReady">
        <div :key="rangeKey" class="week-grid" role="group" :aria-label="rangeLabel">
          <section
            v-for="day in days"
            :key="day.iso"
            class="week-day"
            :class="{ 'week-day--today': day.today }"
            :aria-label="day.label"
          >
            <time class="week-day__heading" :datetime="day.iso">
              <span class="week-day__weekday">{{ day.weekday }}</span>
              <span class="week-day__date">
                <strong>{{ day.day }}</strong>
                <small>{{ day.month }}</small>
              </span>
            </time>
          </section>
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
