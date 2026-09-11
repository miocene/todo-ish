<script>
import "./profile-page.css";
import { subscribeAppData } from "../app/app-data.js";
import { appClock } from "../app/clock.js";
import { RouterLink } from "vue-router";
import {
  activityYears,
  collectCompletedActivity,
  groupActivityByDay,
} from "../app/activity.js";
import JMActivityGraph from "../components/JMActivityGraph/JMActivityGraph.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import JMTabs from "../components/JMTabs/JMTabs.vue";

export default {
  name: "ProfilePage",
  components: { JMActivityGraph, JMIcon, JMTabs, RouterLink },
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
        to: this.yearRoute(year),
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
  methods: {
    yearRoute(year) {
      return {
        name: "profile",
        query: year === this.currentYear ? {} : { year: String(year) },
      };
    },
  },
};
</script>

<template>
  <section class="profile-page" aria-labelledby="profile-title">
    <header class="profile-page__header">
      <h1 id="profile-title">Activity</h1>
    </header>

    <JMTabs
      :tabs="yearTabs"
      :active="selectedYear"
      aria-label="Activity years"
    />

    <JMActivityGraph :year="selectedYear" :days="activityDays" />

    <p v-if="activityDays.length === 0" class="empty">
      No activity in {{ selectedYear }}.
    </p>

    <article
      v-for="day in activityDays"
      v-else
      :key="day.date"
      class="activity-day"
    >
      <h3>
        <time :datetime="day.date">{{ day.label }}</time>
        <span v-if="day.stitches"> · {{ day.stitches }} stitches</span>
      </h3>
      <ul role="list">
        <li v-for="item in day.items" :key="item.id">
          <span class="check" aria-hidden="true"
            ><JMIcon :name="item.icon"
          /></span>
          <div>
            <p>{{ item.title }}</p>
            <RouterLink :to="item.route">{{ item.source }}</RouterLink>
            <span v-if="item.context" aria-hidden="true"> · </span>
            <span v-if="item.context">{{ item.context }}</span>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>
