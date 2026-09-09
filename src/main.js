import { createApp } from "vue";
import AppBootstrap from "./AppBootstrap.vue";
import "../styles/style.css";
import "../styles/popover.css";

async function loadApplication() {
  const [{ default: App }, { router }] = await Promise.all([import("./App.vue"), import("./app/router.js")]);
  app.use(router);
  return App;
}

const app = createApp(AppBootstrap, { loadApplication });
app.mount("#app");
