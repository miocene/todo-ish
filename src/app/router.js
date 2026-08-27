import { createRouter, createWebHistory } from "vue-router";

const WorkPage = () => import("../pages/WorkPage.vue");

export const routes = [
  {
    path: "/",
    name: "work",
    component: WorkPage,
    meta: { title: "Work" },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: { name: "work" },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
