<script>
import { appClock } from "../app/clock.js";
import { RouterLink } from "vue-router";
import { activityYears, collectCompletedActivity, groupActivityByDay } from "../app/activity.js";
import { createPasskey, signOut } from "../app/passkeys.js";
import JMActivityGraph from "../components/JMActivityGraph/JMActivityGraph.vue";
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import JMTabs from "../components/JMTabs/JMTabs.vue";

export default {
  name: "ProfilePage",
  components: { JMActivityGraph, JMButton, JMIcon, JMTabs, RouterLink },
  data() {
    return {
      activity: collectCompletedActivity(),
      authBusy: false,
      authMessage: "",
    };
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
    yearRoute(year) {
      return { name: "profile", query: year === this.currentYear ? {} : { year: String(year) } };
    },
    async addPasskey() {
      this.authBusy = true;
      this.authMessage = "";
      try {
        await createPasskey();
        this.authMessage = "Passkey added.";
      } catch (error) {
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          this.authMessage = error?.message || "The passkey could not be added.";
        }
      } finally {
        this.authBusy = false;
      }
    },
    async logout() {
      this.authBusy = true;
      this.authMessage = "";
      try {
        await signOut();
        window.location.assign("/");
      } catch (error) {
        this.authMessage = error?.message || "Could not sign out.";
        this.authBusy = false;
      }
    },
  },
};
</script>

<template>
  <section class="profile-page" aria-labelledby="profile-title">
    <header class="profile-page__header">
      <h1 id="profile-title">Profile</h1>
      <div class="profile-page__auth-actions">
        <JMButton text="Add passkey" view="secondary" :disabled="authBusy" @click="addPasskey" />
        <JMButton text="Sign out" view="ghost" :disabled="authBusy" @click="logout" />
      </div>
    </header>

    <p v-if="authMessage" class="profile-page__auth-message" role="status">{{ authMessage }}</p>

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
              <span>{{ item.context }}</span>
            </div>
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>
