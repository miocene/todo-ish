import { createRouter, createWebHistory } from "vue-router";

const CalendarPage = () => import("../pages/CalendarPage.vue");

export const routes = [
  {
    path: "/",
    name: "calendar",
    component: CalendarPage,
    meta: { title: "Calendar" },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: { name: "calendar" },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
