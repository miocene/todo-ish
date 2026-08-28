<script>
import JMButton from "../JMButton/JMButton.vue";
import { parseIsoDate, shiftIsoDate, toIsoDate } from "../../shared/date.js";
import "./jm-calendar.css";

export default {
  name: "JMCalendar",
  components: { JMButton },
  props: {
    date: { type: String, required: true },
    routeName: { type: String, default: "home" },
    viewTransition: Boolean,
  },
  emits: ["view-transition"],
  data() {
    return { rangeDate: this.date };
  },
  computed: {
    days() {
      const selected = parseIsoDate(this.rangeDate);
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(selected);
        date.setDate(selected.getDate() + index - 3);
        return {
          value: toIsoDate(date),
          day: date.toLocaleDateString("en", { weekday: "short" }).toUpperCase(),
          number: date.getDate(),
          label: date.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" }),
        };
      });
    },
  },
  watch: {
    date(value) {
      if (!this.days.some((day) => day.value === value)) this.rangeDate = value;
    },
  },
  methods: {
    shift(amount) {
      this.navigate(shiftIsoDate(this.date, amount));
    },
    async navigate(date) {
      const changeDate = async () => {
        await this.$router.push({ name: this.routeName, query: { date } });
        await this.$nextTick();
      };
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!this.viewTransition || !document.startViewTransition || reduceMotion) {
        await changeDate();
        return;
      }

      this.$emit("view-transition", true);
      await this.$nextTick();
      const transition = document.startViewTransition(changeDate);
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
  <nav class="calendar" aria-label="Calendar">
    <JMButton icon="chevron-left" view="ghost" aria-label="Previous day" @click="shift(-1)" />
    <div class="calendar__days">
      <button
        v-for="day in days"
        :key="day.value"
        class="calendar__day"
        :class="{ 'calendar__day--selected': day.value === date }"
        type="button"
        :aria-label="day.label"
        :aria-pressed="day.value === date"
        @click="navigate(day.value)"
      >
        <small>{{ day.day }}</small
        ><strong>{{ day.number }}</strong>
      </button>
    </div>
    <JMButton icon="chevron-right" view="ghost" aria-label="Next day" @click="shift(1)" />
  </nav>
</template>
