import { createApp } from "vue";
import AppBootstrap from "./AppBootstrap.vue";
import "../styles/style.css";

let bootstrapApp;

async function startApplication() {
  const [{ default: App }, { router }] = await Promise.all([import("./App.vue"), import("./app/router.js")]);
  bootstrapApp.unmount();
  createApp(App).use(router).mount("#app");
}

bootstrapApp = createApp(AppBootstrap, { startApplication });
bootstrapApp.mount("#app");
