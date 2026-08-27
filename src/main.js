import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./app/router.js";
import "../styles/style.css";

createApp(App).use(router).mount("#app");
