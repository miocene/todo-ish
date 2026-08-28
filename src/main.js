import { createApp } from "vue";
import { initializeAppData } from "./app/app-data.js";
import { initializeFilamentCatalog } from "./app/filament-catalog.js";
import { initializeFlossCatalog } from "./app/floss-catalog.js";
import "../styles/style.css";

async function start() {
  try {
    await Promise.all([initializeAppData(), initializeFilamentCatalog(), initializeFlossCatalog()]);
    const [{ default: App }, { router }] = await Promise.all([import("./App.vue"), import("./app/router.js")]);
    createApp(App).use(router).mount("#app");
  } catch (error) {
    console.error("Done-ish could not load app data", error);
    const app = document.getElementById("app");
    const message = document.createElement("p");
    const retry = document.createElement("button");
    app.setAttribute("role", "alert");
    app.className = "app-startup-error";
    message.textContent = "Done-ish could not connect to the home server.";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => window.location.reload());
    app.replaceChildren(message, retry);
  }
}

void start();
