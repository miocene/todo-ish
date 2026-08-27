import { createRouter, createWebHistory } from "vue-router";

const WorkPage = () => import("../pages/WorkPage.vue");
const PlaceholderPage = () => import("../pages/PlaceholderPage.vue");

const placeholderRoutes = [
  { path: "/chores", name: "chores", title: "Chores" },
  { path: "/todos", name: "todos", title: "Todo lists" },
  { path: "/shopping", name: "shopping", title: "Shopping cart" },
  { path: "/printing", name: "printing", title: "3D printing" },
  { path: "/cross-stitch", name: "cross-stitch", title: "Cross stitch" },
  { path: "/catalog", name: "catalog", title: "Catalog" },
  { path: "/profile", name: "profile", title: "Profile" },
].map(({ path, name, title }) => ({
  path,
  name,
  component: PlaceholderPage,
  props: { title },
  meta: { title },
}));

export const routes = [
  {
    path: "/",
    name: "work",
    component: WorkPage,
    meta: { title: "Work" },
  },
  ...placeholderRoutes,
  {
    path: "/:pathMatch(.*)*",
    redirect: { name: "work" },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
