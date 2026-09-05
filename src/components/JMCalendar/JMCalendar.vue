<script>
import JMButton from "../JMButton/JMButton.vue";
import JMDayType from "../JMDayType/JMDayType.vue";
import { parseIsoDate, shiftIsoDate, toIsoDate, todayIso } from "../../shared/date.js";
import "./jm-calendar.css";

export default {
  name: "JMCalendar",
  components: { JMButton, JMDayType },
  props: {
    activity: { type: Object, default: () => ({}) },
    date: { type: String, required: true },
    dayTypeForDate: { type: Function, default: () => "work" },
    maxDate: { type: String, default: "" },
    minDate: { type: String, default: "" },
    routeName: { type: String, default: "work" },
    showDayType: Boolean,
    viewTransition: Boolean,
  },
  emits: ["range-change", "update:day-type", "view-transition"],
  data() {
    return {
      mediaQueries: [],
      rangeDate: this.date,
      today: todayIso(),
      visibleDayCount: 7,
    };
  },
  computed: {
    canGoNext() {
      return !this.maxDate || this.days.at(-1).value < this.maxDate;
    },
    canGoPrevious() {
      return !this.minDate || this.days[0].value > this.minDate;
    },
    days() {
      const center = parseIsoDate(this.rangeDate);
      const centerIndex = Math.floor(this.visibleDayCount / 2);
      return Array.from({ length: this.visibleDayCount }, (_, index) => {
        const date = new Date(center);
        date.setDate(center.getDate() + index - centerIndex);
        const value = toIsoDate(date);
        const activity = this.activity[value] ?? { count: 0, level: 0 };
        return {
          activityCount: activity.count ?? 0,
          activityLevel: activity.level ?? 0,
          dayType: this.dayTypeForDate(value),
          disabled: !this.canNavigate(value),
          value,
          day: date.toLocaleDateString("en", { weekday: "short" }).toUpperCase(),
          number: date.getDate(),
          label: date.toLocaleDateString("en", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          today: value === this.today,
        };
      });
    },
  },
  watch: {
    date(value) {
      if (!this.days.some((day) => day.value === value)) this.rangeDate = value;
    },
    rangeDate: {
      immediate: true,
      handler(value) {
        this.$emit("range-change", value);
      },
    },
  },
  mounted() {
    this.mediaQueries = [window.matchMedia("(width <= 460px)"), window.matchMedia("(width <= 720px)")];
    for (const query of this.mediaQueries) query.addEventListener("change", this.updateVisibleDayCount);
    this.updateVisibleDayCount();
  },
  beforeUnmount() {
    for (const query of this.mediaQueries) query.removeEventListener("change", this.updateVisibleDayCount);
  },
  methods: {
    activityDescription(day) {
      if (day.activityCount === 0) return "No completed tasks";
      return `${day.activityCount} completed ${day.activityCount === 1 ? "task" : "tasks"}`;
    },
    canNavigate(date) {
      return (!this.minDate || date >= this.minDate) && (!this.maxDate || date <= this.maxDate);
    },
    shift(amount) {
      if (amount < 0 ? !this.canGoPrevious : !this.canGoNext) return;
      this.rangeDate = shiftIsoDate(this.rangeDate, amount * this.visibleDayCount);
    },
    showDate(date) {
      this.rangeDate = date;
    },
    updateVisibleDayCount() {
      const count = this.mediaQueries[0]?.matches ? 3 : this.mediaQueries[1]?.matches ? 5 : 7;
      if (count === this.visibleDayCount) return;
      this.visibleDayCount = count;
    },
    updateDayType(date, value) {
      this.$emit("update:day-type", { date, value });
    },
    async navigate(date) {
      if (date === this.date || !this.canNavigate(date)) return;

      const changeDate = async () => {
        await this.$router.push({ name: this.routeName, query: { ...this.$route.query, date } });
        await this.$nextTick();
      };
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!this.viewTransition || !document.startViewTransition || reduceMotion) {
        await changeDate();
        return;
      }

      this.$emit("view-transition", true);
      await this.$nextTick();
      const direction = date > this.date ? "next" : "previous";
      const transition = document.startViewTransition({ update: changeDate, types: [direction] });
      try {
        await transition.finished;
      } finally {
        this.$emit("view-transition", false);
      }
    },
  },
};
</script>

<template>
  <nav class="jm-calendar" aria-label="Work dates">
    <JMButton
      icon-name="chevron-left"
      view="ghost"
      :aria-label="`Previous ${visibleDayCount} days`"
      :disabled="!canGoPrevious"
      @click="shift(-1)"
    />
    <div class="jm-calendar__days">
      <JMDayType
        v-for="day in days"
        :key="day.value"
        class="jm-calendar__day"
        :class="{
          'jm-calendar__day--selected': day.value === date,
          'jm-calendar__day--today': day.today,
        }"
        :aria-current="day.value === date ? 'date' : undefined"
        :aria-label="`${day.label}. ${activityDescription(day)}`"
        :activity-level="day.activityLevel"
        :date-label="day.label"
        :description="activityDescription(day)"
        :disabled="day.disabled"
        :editable="day.value === date && showDayType"
        :input-id="`calendar-day-type-${day.value}`"
        :model-value="day.dayType"
        @activate="navigate(day.value)"
        @update:model-value="updateDayType(day.value, $event)"
      >
        <strong class="jm-calendar__date">{{ day.number }}</strong>
        <small class="jm-calendar__weekday">{{ day.day }}</small>
      </JMDayType>
    </div>
    <JMButton
      icon-name="chevron-right"
      view="ghost"
      :aria-label="`Next ${visibleDayCount} days`"
      :disabled="!canGoNext"
      @click="shift(1)"
    />
  </nav>
</template>
