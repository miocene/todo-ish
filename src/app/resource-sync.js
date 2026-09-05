const copy = (value) => JSON.parse(JSON.stringify(value));

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A resource writer with durable drafts and optimistic revision checks. No browser or Vue dependencies. */
export function createResourceSync({
  storage,
  normalize,
  send,
  readRemote,
  remoteValue,
  onChange = () => {},
  onSaved = () => {},
  clock = globalThis,
  makeId = () => globalThis.crypto.randomUUID(),
  delay = 0,
}) {
  const entries = new Map();
  const saved = new Map();
  const states = new Map();
  const running = new Set();
  const timers = new Map();
  const multipleDrafts = new Set();
  let durable = true;
  const canonical = (resource, value) => stableJson(normalize(resource, value));

  function notify() {
    const priority = ["conflict", "auth", "invalid", "error", "offline", "saving"];
    const state =
      priority.find((candidate) => [...states.values()].some((item) => item.state === candidate)) ?? "saved";
    const detail = [...states.values()].find((item) => item.state === state);
    onChange({ state, message: detail?.message ?? "All changes saved.", pending: entries.size, durable });
  }
  function status(resource, state, message) {
    states.set(resource, { state, message });
    notify();
  }
  function persist(entry) {
    try {
      storage.save(copy(entry));
    } catch {
      durable = false;
    }
  }
  function remove(entry) {
    try {
      storage.remove(entry.id);
    } catch {
      durable = false;
    }
    if (entries.get(entry.resource) === entry) entries.delete(entry.resource);
    states.delete(entry.resource);
    notify();
  }
  function matches(resource, value, serialized) {
    try {
      return canonical(resource, value) === serialized;
    } catch {
      return false;
    }
  }
  function schedule(resource, milliseconds = delay) {
    clock.clearTimeout(timers.get(resource));
    timers.set(
      resource,
      clock.setTimeout(() => {
        timers.delete(resource);
        void flush(resource);
      }, milliseconds),
    );
  }
  function reconcile(entry, state) {
    const resource = entry.resource;
    const value = remoteValue(state, resource);
    const revision = state.revisions?.[resource] ?? 0;
    const serialized = value === undefined ? undefined : canonical(resource, value);
    const initialized = !state.initializedResources || state.initializedResources.includes(resource);
    saved.set(resource, { revision, serialized, initialized });
    if (initialized && serialized !== undefined && matches(resource, entry.value, serialized)) {
      onSaved(resource, copy(entry.value));
      remove(entry);
      return true;
    }
    if (serialized === entry.base || (entry.attempted !== undefined && serialized === entry.attempted)) {
      entry.revision = revision;
      entry.base = serialized;
      delete entry.attempted;
      persist(entry);
      states.delete(resource);
      return true;
    }
    status(resource, "conflict", "The saved version differs from your local edits. Your local edits have been kept.");
    return false;
  }
  async function flush(resource) {
    if (running.has(resource) || !entries.has(resource)) return;
    if (["conflict", "auth", "invalid", "error"].includes(states.get(resource)?.state)) return;
    running.add(resource);
    try {
      while (entries.has(resource)) {
        const entry = entries.get(resource);
        const snapshot = copy(entry.value);
        let value;
        try {
          value = canonical(resource, snapshot);
        } catch (error) {
          status(resource, "invalid", `Finish editing before saving: ${error.message}`);
          return;
        }
        if (saved.get(resource)?.initialized !== false && value === saved.get(resource)?.serialized) {
          remove(entry);
          return;
        }
        try {
          if (entry.attempted !== undefined) {
            if (!reconcile(entry, await readRemote())) return;
            if (!entries.has(resource)) continue;
          }
          entry.attempted = value;
          persist(entry);
          status(resource, "saving", "Saving changes…");
          const result = await send(resource, snapshot, entry.revision);
          saved.set(resource, { revision: result.revision, serialized: value, initialized: true });
          entry.revision = result.revision;
          entry.base = value;
          delete entry.attempted;
          delete entry.retryDelay;
          onSaved(resource, snapshot);
          if (matches(resource, entry.value, value)) remove(entry);
          else persist(entry);
        } catch (caughtError) {
          let error = caughtError;
          if (error.status === 409) {
            try {
              if (reconcile(entry, await readRemote())) continue;
              return;
            } catch (readError) {
              error = readError;
            }
          }
          if (error.status === 401) {
            status(resource, "auth", "Sign in again to save. Your local edits have been kept.");
          } else if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
            if (!matches(resource, entry.value, value)) continue;
            status(
              resource,
              "error",
              error.message || "The server rejected these changes. Your local edits have been kept.",
            );
          } else {
            entry.retryDelay = Math.min((entry.retryDelay ?? 500) * 2, 30_000);
            status(resource, "offline", "Changes are pending. The app will retry when the server is available.");
            schedule(resource, entry.retryDelay);
          }
          return;
        }
      }
    } finally {
      running.delete(resource);
    }
  }
  return {
    hydrate(state, resources) {
      for (const resource of resources) {
        const value = remoteValue(state, resource);
        saved.set(resource, {
          revision: state.revisions?.[resource] ?? 0,
          initialized: !state.initializedResources || state.initializedResources.includes(resource),
          serialized: value === undefined ? undefined : canonical(resource, value),
        });
      }
      let restored = [];
      try {
        restored = storage.load();
      } catch {
        durable = false;
      }
      for (const entry of restored) {
        if (!resources.includes(entry.resource)) continue;
        if (restored.filter((item) => item.resource === entry.resource).length > 1) {
          multipleDrafts.add(entry.resource);
          if (!entries.has(entry.resource)) entries.set(entry.resource, entry);
          status(
            entry.resource,
            "conflict",
            "Several local drafts exist for this data. Download them before choosing a saved version.",
          );
          continue;
        }
        entries.set(entry.resource, entry);
        if (reconcile(entry, state) && entries.has(entry.resource)) schedule(entry.resource);
      }
      notify();
    },
    write(resource, value) {
      const current = entries.get(resource);
      const entry = current ?? {
        id: makeId(),
        resource,
        revision: saved.get(resource)?.revision ?? 0,
        base: saved.get(resource)?.serialized,
      };
      entry.value = copy(value);
      entries.set(resource, entry);
      persist(entry);
      if (!["conflict", "auth"].includes(states.get(resource)?.state)) {
        status(resource, "saving", "Saving changes…");
        schedule(resource);
      }
    },
    value(resource) {
      return entries.has(resource) ? copy(entries.get(resource).value) : undefined;
    },
    async retry() {
      try {
        const state = await readRemote();
        for (const entry of entries.values()) {
          if (multipleDrafts.has(entry.resource)) continue;
          if (reconcile(entry, state) && entries.has(entry.resource)) schedule(entry.resource, 0);
        }
      } catch (error) {
        for (const resource of entries.keys())
          status(resource, error.status === 401 ? "auth" : "offline", error.message);
      }
    },
    pending() {
      let persisted = [];
      try {
        persisted = storage.load();
      } catch {
        durable = false;
      }
      return [...new Map([...persisted, ...entries.values()].map((entry) => [entry.id, copy(entry)])).values()];
    },
    discard() {
      for (const entry of this.pending()) storage.remove(entry.id);
      entries.clear();
      multipleDrafts.clear();
      states.clear();
      for (const timer of timers.values()) clock.clearTimeout(timer);
      timers.clear();
      notify();
    },
  };
}
