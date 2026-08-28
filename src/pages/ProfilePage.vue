<script>
import { RouterLink } from "vue-router";
import { activityYears, buildActivityCalendar, collectCompletedActivity, groupActivityByDay } from "../app/activity.js";
import { createPasskey, signOut } from "../app/passkeys.js";
import JMButton from "../components/JMButton/JMButton.vue";
import JMIcon from "../components/JMIcon/JMIcon.vue";
import "./profile-page.css";

export default {
  name: "ProfilePage",
  components: { JMButton, JMIcon, RouterLink },
  data() {
    return {
      activity: collectCompletedActivity(),
      authBusy: false,
      authMessage: "",
      currentYear: new Date().getFullYear(),
    };
  },
  computed: {
    years() {
      return activityYears(this.activity, this.currentYear);
    },
    selectedYear() {
      const requestedYear = Number(this.$route.query.year);
      return this.years.includes(requestedYear) ? requestedYear : this.currentYear;
    },
    activityDays() {
      return groupActivityByDay(this.activity, this.selectedYear);
    },
    calendar() {
      return buildActivityCalendar(this.selectedYear, this.activityDays);
    },
    checkedItemCount() {
      return this.activityDays.reduce((total, day) => total + day.items.length, 0);
    },
  },
  methods: {
    yearRoute(year) {
      return { name: "profile", query: year === this.currentYear ? {} : { year: String(year) } };
    },
    dayDescription(day) {
      const itemLabel = day.count === 1 ? "item" : "items";
      return `${day.count} checked ${itemLabel} on ${day.label}`;
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
      <div>
        <h1 id="profile-title">Profile</h1>
        <p>Your completed tasks, day by day.</p>
      </div>
      <div class="profile-page__auth-actions">
        <JMButton text="Add passkey" view="secondary" :disabled="authBusy" @click="addPasskey" />
        <JMButton text="Sign out" view="ghost" :disabled="authBusy" @click="logout" />
      </div>
    </header>

    <p v-if="authMessage" class="profile-page__auth-message" role="status">{{ authMessage }}</p>

    <nav class="profile-years" aria-label="Activity years">
      <ul class="profile-years__list" role="list">
        <li v-for="year in years" :key="year">
          <RouterLink
            class="profile-years__link"
            :class="{ 'profile-years__link--active': year === selectedYear }"
            :to="yearRoute(year)"
            :aria-current="year === selectedYear ? 'page' : undefined"
          >
            {{ year }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <section class="activity-summary" aria-labelledby="activity-summary-title">
      <h2 id="activity-summary-title">
        {{ checkedItemCount }} checked {{ checkedItemCount === 1 ? "item" : "items" }} in {{ selectedYear }}
      </h2>

      <div class="activity-graph" aria-label="Year activity graph">
        <div
          class="activity-graph__scroll"
          role="region"
          aria-label="Year activity graph, scroll horizontally"
          tabindex="0"
        >
          <div class="activity-graph__canvas" :style="{ '--activity-weeks': calendar.weekCount }">
            <div class="activity-graph__months" aria-hidden="true">
              <span v-for="month in calendar.months" :key="month.label" :style="{ gridColumn: month.column }">
                {{ month.label }}
              </span>
            </div>

            <div class="activity-graph__weekdays" aria-hidden="true">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>

            <div class="activity-graph__days">
              <template v-for="day in calendar.days" :key="day.date">
                <span v-if="day.count === undefined" class="activity-graph__day activity-graph__day--outside" />
                <a
                  v-else-if="day.count > 0"
                  class="activity-graph__day"
                  :data-level="day.level"
                  :href="`#activity-${day.date}`"
                  :aria-label="dayDescription(day)"
                  :title="dayDescription(day)"
                />
                <time
                  v-else
                  class="activity-graph__day"
                  data-level="0"
                  :datetime="day.date"
                  :aria-label="`No checked items on ${day.label}`"
                  :title="`No checked items on ${day.label}`"
                />
              </template>
            </div>
          </div>
        </div>

        <div class="activity-graph__legend" aria-label="Activity intensity from less to more">
          <span>Less</span>
          <i v-for="level in [0, 1, 2, 3, 4]" :key="level" :data-level="level" aria-hidden="true" />
          <span>More</span>
        </div>
      </div>
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
