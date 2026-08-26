import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./app/router.js";
import "../variables.css";
import "../normalisation.css";
import "../styles.css";

createApp(App).use(router).mount("#app");
