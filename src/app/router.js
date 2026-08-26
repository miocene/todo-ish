import { createRouter, createWebHistory } from "vue-router";
import { todayIso } from "../shared/date.js";

const ChoresPage = () => import("../pages/ChoresPage.vue");
const HomePage = () => import("../pages/HomePage.vue");
const NotFoundPage = () => import("../pages/NotFoundPage.vue");
const PrintingPage = () => import("../pages/PrintingPage.vue");
const ProjectDetailPage = () => import("../pages/ProjectDetailPage.vue");
const SearchPage = () => import("../pages/SearchPage.vue");
const SettingsPage = () => import("../pages/SettingsPage.vue");
const ShoppingPage = () => import("../pages/ShoppingPage.vue");
const StitchPage = () => import("../pages/StitchPage.vue");
const TodoPage = () => import("../pages/TodoPage.vue");
const WorkPage = () => import("../pages/WorkPage.vue");
const CataloguePage = () => import("../pages/CataloguePage.vue");
const dated = (route) => ({ date: route.query.date || todayIso() });

export const routes = [
  {
    path: "/",
    name: "home",
    component: HomePage,
    props: dated,
    meta: { title: "Home", section: "home" },
  },
  {
    path: "/make/printing",
    name: "printing",
    component: PrintingPage,
    meta: { title: "Printing", section: "make" },
  },
  {
    path: "/make/printing/:id",
    name: "printing-project",
    component: ProjectDetailPage,
    props: (route) => ({ kind: "printing", id: route.params.id }),
    meta: { title: "Printing project", section: "make" },
  },
  {
    path: "/make/stitch",
    name: "cross-stitch",
    component: StitchPage,
    meta: { title: "Stitch", section: "make" },
  },
  {
    path: "/make/stitch/:id",
    name: "stitch-project",
    component: ProjectDetailPage,
    props: (route) => ({ kind: "cross-stitch", id: route.params.id }),
    meta: { title: "Stitch project", section: "make" },
  },
  {
    path: "/work",
    name: "work",
    component: WorkPage,
    props: dated,
    meta: { title: "Work", section: "do" },
  },
  { path: "/todos", name: "todo", component: TodoPage, meta: { title: "To-dos", section: "do" } },
  {
    path: "/chores",
    name: "chores",
    component: ChoresPage,
    meta: { title: "Chores", section: "do" },
  },
  {
    path: "/buy",
    name: "shopping",
    component: ShoppingPage,
    meta: { title: "Buy", section: "shopping" },
  },
  {
    path: "/catalogues/filaments",
    name: "filaments",
    component: CataloguePage,
    props: { kind: "filaments" },
    meta: { title: "Filaments", section: "catalogues" },
  },
  {
    path: "/catalogues/threads",
    name: "threads",
    component: CataloguePage,
    props: { kind: "threads" },
    meta: { title: "DMC floss", section: "catalogues" },
  },
  {
    path: "/settings",
    name: "settings",
    component: SettingsPage,
    meta: { title: "Settings", section: "" },
  },
  {
    path: "/search",
    name: "search",
    component: SearchPage,
    props: (route) => ({ initialQuery: route.query.q || "" }),
    meta: { title: "Search", section: "" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFoundPage,
    meta: { title: "Not found", section: "" },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  linkActiveClass: "",
  linkExactActiveClass: "",
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 };
  },
});
