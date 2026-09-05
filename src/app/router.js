import { createRouter, createWebHistory } from "vue-router";

const WorkPage = () => import("../pages/WorkPage.vue");
const CatalogPage = () => import("../pages/CatalogPage.vue");
const ChoresPage = () => import("../pages/ChoresPage.vue");
const ProfilePage = () => import("../pages/ProfilePage.vue");
const ProjectTasksPage = () => import("../pages/ProjectTasksPage.vue");
const ShoppingPage = () => import("../pages/ShoppingPage.vue");
const TodoListsPage = () => import("../pages/TodoListsPage.vue");

export const routes = [
  {
    path: "/",
    redirect: { name: "work" },
  },
  {
    path: "/work",
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
      pageKey: "crossStitch",
    },
    meta: { title: "Cross stitch" },
  },
  {
    path: "/profile",
    name: "profile",
    component: ProfilePage,
    meta: { title: "Profile" },
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
