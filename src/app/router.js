import { createRouter, createWebHistory } from "vue-router";

const WorkPage = () => import("../pages/WorkPage.vue");
const CatalogPage = () => import("../pages/CatalogPage.vue");
const ChoresPage = () => import("../pages/ChoresPage.vue");
const PlaceholderPage = () => import("../pages/PlaceholderPage.vue");
const ProjectTasksPage = () => import("../pages/ProjectTasksPage.vue");
const ShoppingPage = () => import("../pages/ShoppingPage.vue");
const TodoListsPage = () => import("../pages/TodoListsPage.vue");

const placeholderRoutes = [{ path: "/profile", name: "profile", title: "Profile" }].map(({ path, name, title }) => ({
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
  {
    path: "/chores",
    name: "chores",
    component: ChoresPage,
    meta: { title: "Chores" },
  },
  {
    path: "/todos",
    name: "todos",
    component: TodoListsPage,
    meta: { title: "Todo lists" },
  },
  {
    path: "/shopping",
    name: "shopping",
    component: ShoppingPage,
    meta: { title: "Shopping cart" },
  },
  {
    path: "/catalog",
    name: "catalog",
    component: CatalogPage,
    meta: { title: "Catalog" },
  },
  {
    path: "/printing",
    name: "printing",
    component: ProjectTasksPage,
    props: {
      title: "3D printing",
      description: "Active prints and the next steps for each project.",
      pageKey: "printing",
    },
    meta: { title: "3D printing" },
  },
  {
    path: "/cross-stitch",
    name: "cross-stitch",
    component: ProjectTasksPage,
    props: {
      title: "Cross stitch",
      description: "Patterns in progress and the details left to stitch.",
      pageKey: "crossStitch",
    },
    meta: { title: "Cross stitch" },
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
