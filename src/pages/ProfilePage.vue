<script>
import "./profile-page.css";
import { subscribeAppData, downloadSavedData, downloadLegacyData, legacyBackupState } from "../app/app-data.js";
import { appClock } from "../app/clock.js";
import { RouterLink } from "vue-router";
import { activityYears, collectCompletedActivity, groupActivityByDay } from "../app/activity.js";
import JMActivityGraph from "../components/JMActivityGraph/JMActivityGraph.vue";
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import JMTabs from "../components/JMTabs/JMTabs.vue";

export default {
  name: "ProfilePage",
  components: { JMButton, JMActivityGraph, JMIcon, JMTabs, RouterLink },
  data() {
    return {
      activity: collectCompletedActivity(),
      legacyBackupState,
      exporting: false,
      exportError: "",
    };
  },
  mounted() {
    this.subscriptions = ["work-tasks", "chores", "todos", "shopping", "printing", "cross-stitch"].map((resource) =>
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
      return this.years.map((year) => ({ value: year, text: String(year), to: this.yearRoute(year) }));
    },
    selectedYear() {
      const requestedYear = Number(this.$route.query.year);
      return this.years.includes(requestedYear) ? requestedYear : this.currentYear;
    },
    activityDays() {
      return groupActivityByDay(this.activity, this.selectedYear);
    },
    checkedItemCount() {
      return this.activityDays.reduce((total, day) => total + day.items.length, 0);
    },
  },
  methods: {
    downloadLegacyData,
    async exportData() {
      this.exporting = true;
      this.exportError = "";
      try {
        await downloadSavedData();
      } catch (error) {
        this.exportError = error.message;
      } finally {
        this.exporting = false;
      }
    },
    yearRoute(year) {
      return { name: "profile", query: year === this.currentYear ? {} : { year: String(year) } };
    },
  },
};
</script>

<template>
  <section class="profile-page" aria-labelledby="profile-title">
    <header class="profile-page__header">
      <h1 id="profile-title">Activity</h1>
    </header>

    <section aria-label="Data backup">
      <JMButton
        :text="exporting ? 'Preparing download…' : 'Download saved data'"
        view="secondary"
        :disabled="exporting"
        @click="exportData"
      />
      <JMButton
        v-if="legacyBackupState.available"
        text="Download old browser data"
        view="secondary"
        @click="downloadLegacyData"
      />
      <p v-if="exportError" role="alert">{{ exportError }}</p>
      <p v-if="legacyBackupState.error" role="status">{{ legacyBackupState.error }}</p>
    </section>

    <JMTabs :tabs="yearTabs" :active="selectedYear" aria-label="Activity years" />

    <section class="activity-summary" aria-labelledby="activity-summary-title">
      <h2 id="activity-summary-title">
        {{ checkedItemCount }} checked {{ checkedItemCount === 1 ? "item" : "items" }} in {{ selectedYear }}
      </h2>

      <JMActivityGraph :year="selectedYear" :days="activityDays" />
    </section>

    <section class="activity-list" aria-labelledby="activity-list-title">
      <h2 id="activity-list-title">Checked activity</h2>

      <p v-if="activityDays.length === 0" class="activity-list__empty">No checked items in {{ selectedYear }}.</p>

      <article v-for="day in activityDays" v-else :id="`activity-${day.date}`" :key="day.date" class="activity-day">
        <h3>
          <time :datetime="day.date">{{ day.label }}</time>
        </h3>
        <ul role="list">
          <li v-for="item in day.items" :key="item.id">
            <span class="activity-day__check" aria-hidden="true"><JMIcon name="check" /></span>
            <div>
              <p>{{ item.title }}</p>
              <RouterLink :to="item.route">{{ item.source }}</RouterLink>
              <span aria-hidden="true"> · </span>
              <span v-if="item.context">{{ item.context }}</span>
            </div>
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
