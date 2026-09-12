<script>
import { subscribeAppData } from "../app/app-data.js";
import { appClock } from "../app/clock.js";
import {
  activityYears,
  collectCompletedActivity,
  groupActivityByDay,
} from "../app/activity.js";
import JMActivityGraph from "../components/JMActivityGraph/JMActivityGraph.vue";
import JMCard from "../components/JMCard/JMCard.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import JMTabs from "../components/JMTabs/JMTabs.vue";

export default {
  name: "ProfilePage",
  components: { JMActivityGraph, JMCard, JMIcon, JMTabs },
  data() {
    return {
      activity: collectCompletedActivity(),
    };
  },
  mounted() {
    this.subscriptions = [
      "work-tasks",
      "chores",
      "todos",
      "shopping",
      "printing",
      "cross-stitch",
    ].map((resource) =>
      subscribeAppData(resource, () => {
        this.activity = collectCompletedActivity();
      }),
    );
  },
  beforeUnmount() {
    for (const unsubscribe of this.subscriptions) unsubscribe();
  },
  computed: {
    currentYear() {
      return Number(appClock.state.today.slice(0, 4));
    },
    years() {
      return activityYears(this.activity, this.currentYear);
    },
    yearTabs() {
      return this.years.map((year) => ({
        value: year,
        text: String(year),
        to: {
          name: "profile",
          query: year === this.currentYear ? {} : { year: String(year) },
        },
      }));
    },
    selectedYear() {
      const requestedYear = Number(this.$route.query.year);
      return this.years.includes(requestedYear)
        ? requestedYear
        : this.currentYear;
    },
    activityDays() {
      return groupActivityByDay(this.activity, this.selectedYear);
    },
  },
};
</script>

<template>
  <header class="page-header">
    <h1>Activity</h1>
  </header>

  <JMTabs :tabs="yearTabs" :active="selectedYear" aria-label="Activity years" />

  <JMActivityGraph :year="selectedYear" :days="activityDays" />

  <p v-if="activityDays.length === 0" class="empty">
    No activity in {{ selectedYear }}.
  </p>

  <JMCard
    v-for="day in activityDays"
    v-else
    :key="day.date"
    class="activity-day"
    tag="article"
    :title="day.label"
  >
    <template #title>
      <time :datetime="day.date">{{ day.label }}</time>
      <span v-if="day.stitches"> · {{ day.stitches }} stitches</span>
    </template>
    <template #list>
      <li v-for="item in day.items" :key="item.id">
        <span class="check" aria-hidden="true"
          ><JMIcon :name="item.icon"
        /></span>
        <p>{{ item.title }}</p>
      </li>
    </template>
  </JMCard>
</template>
