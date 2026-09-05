import { reactive, readonly } from "vue";
import { toIsoDate } from "../shared/date.js";

export function createDayClock({
  now = () => new Date(),
  timers = globalThis,
  events = globalThis.window,
  visibility = globalThis.document,
} = {}) {
  const state = reactive({ today: toIsoDate(now()) });
  let timeout;
  let started = false;
  function refresh() {
    const date = now();
    state.today = toIsoDate(date);
    timers.clearTimeout(timeout);
    if (!started) return;
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    timeout = timers.setTimeout(refresh, midnight.getTime() - date.getTime() + 100);
  }
  return {
    state: readonly(state),
    refresh,
    start() {
      if (started) return;
      started = true;
      events?.addEventListener("focus", refresh);
      visibility?.addEventListener("visibilitychange", refresh);
      refresh();
    },
    stop() {
      started = false;
      timers.clearTimeout(timeout);
      events?.removeEventListener("focus", refresh);
      visibility?.removeEventListener("visibilitychange", refresh);
    },
  };
}

export const appClock = createDayClock();
