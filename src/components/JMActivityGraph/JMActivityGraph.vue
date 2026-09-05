<script>
import { buildActivityCalendar } from "../../app/activity.js";
import "./jm-activity-graph.css";

export default {
  name: "JMActivityGraph",
  props: {
    year: { type: Number, required: true },
    days: { type: Array, required: true },
  },
  computed: {
    calendar() {
      return buildActivityCalendar(this.year, this.days);
    },
  },
};
</script>

<template>
  <div class="jm-activity-graph">
    <div
      class="jm-activity-graph__scroll"
      role="region"
      aria-label="Year activity graph, scroll horizontally"
      tabindex="0"
    >
      <div class="jm-activity-graph__months" aria-hidden="true">
        <span v-for="month in calendar.months" :key="month.label" :style="{ gridColumn: month.column }">
          {{ month.label }}
        </span>
      </div>

      <div class="jm-activity-graph__weekdays" aria-hidden="true">
        <span>Mon</span>
        <span>Wed</span>
        <span>Fri</span>
      </div>

      <div class="jm-activity-graph__days">
        <template v-for="day in calendar.days" :key="day.date">
          <span v-if="day.count === undefined" class="jm-activity-graph__cell jm-activity-graph__cell--outside" />
          <a
            v-else-if="day.count > 0"
            class="jm-activity-graph__cell"
            :data-level="day.level"
            :href="`#activity-${day.date}`"
            :aria-label="day.description"
            :title="day.description"
          />
          <time
            v-else
            class="jm-activity-graph__cell"
            data-level="0"
            :datetime="day.date"
            :aria-label="day.description"
            :title="day.description"
          />
        </template>
      </div>
    </div>

    <div class="jm-activity-graph__legend">
      <span>Less</span>
      <span
        v-for="level in [0, 1, 2, 3, 4]"
        :key="level"
        class="jm-activity-graph__cell"
        :data-level="level"
        aria-hidden="true"
      />
      <span>More</span>
    </div>
  </div>
</template>
