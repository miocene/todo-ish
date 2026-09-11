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
  onUpdate = () => {},
  canRefresh = () => true,
  merge = () => undefined,
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
    const priority = [
      "conflict",
      "auth",
      "invalid",
      "error",
      "offline",
      "saving",
    ];
    const state =
      priority.find((candidate) =>
        [...states.values()].some((item) => item.state === candidate),
      ) ?? "saved";
    const detail = [...states.values()].find((item) => item.state === state);
    onChange({
      state,
      message: detail?.message ?? "All changes saved.",
      pending: entries.size,
      durable,
    });
  }
  function status(resource, state, message) {
    states.set(resource, { state, message });
    notify();
  }
  function persist(entry) {
    try {
      // Values are immutable snapshots; only the entry envelope changes.
      storage.save({ ...entry });
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
    if (entries.get(entry.resource)?.id === entry.id)
      entries.delete(entry.resource);
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
    const serialized =
      value === undefined ? undefined : canonical(resource, value);
    const initialized =
      !state.initializedResources ||
      state.initializedResources.includes(resource);
    saved.set(resource, {
      revision,
      serialized,
      initialized,
      value: value === undefined ? undefined : copy(value),
    });
    if (
      initialized &&
      serialized !== undefined &&
      matches(resource, entry.value, serialized)
    ) {
      onSaved(resource, copy(entry.value));
      remove(entry);
      return true;
    }
    if (
      serialized === entry.base ||
      (entry.attempted !== undefined && serialized === entry.attempted)
    ) {
      entry.revision = revision;
      entry.base = serialized;
      entry.baseValue = copy(value);
      delete entry.attempted;
      persist(entry);
      states.delete(resource);
      return true;
    }
    if (entry.baseValue !== undefined && value !== undefined) {
      try {
        const merged = merge(resource, entry.baseValue, entry.value, value);
        if (merged !== undefined) {
          canonical(resource, merged);
          entry.value = copy(merged);
          entry.revision = revision;
          entry.base = serialized;
          entry.baseValue = copy(value);
          delete entry.attempted;
          persist(entry);
          states.delete(resource);
          onUpdate(resource, copy(merged));
          return true;
        }
      } catch {
        // Keep drafts recoverable if either version cannot be merged safely.
      }
    }
    status(
      resource,
      "conflict",
      "The saved version differs from your local edits. Your local edits have been kept.",
    );
    return false;
  }
  async function flush(resource) {
    if (running.has(resource) || !entries.has(resource)) return;
    if (
      ["conflict", "auth", "invalid", "error"].includes(
        states.get(resource)?.state,
      )
    )
      return;
    running.add(resource);
    try {
      while (entries.has(resource)) {
        const entry = entries.get(resource);
        const snapshot = entry.value;
        let value;
        try {
          value = canonical(resource, snapshot);
        } catch (error) {
          status(
            resource,
            "invalid",
            `Finish editing before saving: ${error.message}`,
          );
          return;
        }
        if (
          saved.get(resource)?.initialized !== false &&
          value === saved.get(resource)?.serialized
        ) {
          remove(entry);
          return;
        }
        try {
          if (entry.attempted !== undefined) {
            if (!reconcile(entry, await readRemote())) return;
            if (!entries.has(resource)) continue;
            if (!matches(resource, entry.value, value)) continue;
          }
          entry.attempted = value;
          persist(entry);
          status(resource, "saving", "Saving changes…");
          const result = await send(resource, snapshot, entry.revision);
          saved.set(resource, {
            revision: result.revision,
            serialized: value,
            initialized: true,
            value: snapshot,
          });
          entry.revision = result.revision;
          entry.base = value;
          entry.baseValue = snapshot;
          delete entry.attempted;
          delete entry.retryDelay;
          onSaved(resource, snapshot, result);
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
            status(
              resource,
              "auth",
              "Sign in again to save. Your local edits have been kept.",
            );
          } else if (error.name === "AppDataValidationError") {
            status(resource, "invalid", error.message);
          } else if (
            error.status >= 400 &&
            error.status < 500 &&
            ![408, 429].includes(error.status)
          ) {
            if (!matches(resource, entry.value, value)) continue;
            status(
              resource,
              "error",
              error.message ||
                "The server rejected these changes. Your local edits have been kept.",
            );
          } else {
            entry.retryDelay = Math.min((entry.retryDelay ?? 500) * 2, 30_000);
            status(
              resource,
              "offline",
              "Changes are pending. The app will retry when the server is available.",
            );
            schedule(resource, entry.retryDelay);
          }
          return;
        }
      }
    } finally {
      running.delete(resource);
    }
  }
  function restoreResource(resource, state, drafts) {
    const remote = saved.get(resource);
    const remaining = [];
    for (const draft of drafts) {
      // An acknowledged copy is not a conflicting edit, even if another tab
      // left its pending record behind before receiving the save response.
      if (
        remote?.initialized &&
        remote.serialized !== undefined &&
        matches(resource, draft.value, remote.serialized)
      ) {
        remove(draft);
      } else remaining.push(draft);
    }
    multipleDrafts.delete(resource);
    if (!remaining.length) return;

    // Collapse equivalent payloads only; never pick between different edits.
    const first = remaining[0];
    let serialized;
    try {
      serialized = canonical(resource, first.value);
    } catch {
      // Invalid drafts must remain available for recovery.
    }
    const equivalent =
      serialized !== undefined &&
      remaining.every((draft) => matches(resource, draft.value, serialized));
    if (remaining.length > 1 && !equivalent) {
      multipleDrafts.add(resource);
      entries.set(resource, first);
      status(
        resource,
        "conflict",
        `Different local drafts exist for ${resource}. Download local edits before choosing a saved version.`,
      );
      return;
    }
    const entry =
      remaining.find(
        (draft) =>
          draft.base === remote?.serialized ||
          (draft.attempted !== undefined &&
            draft.attempted === remote?.serialized),
      ) ?? first;
    entries.set(resource, entry);
    for (const duplicate of remaining) {
      if (duplicate !== entry) remove(duplicate);
    }
    if (reconcile(entry, state) && entries.has(resource)) schedule(resource);
  }

  return {
    hydrate(state, resources) {
      for (const resource of resources) {
        const value = remoteValue(state, resource);
        saved.set(resource, {
          revision: state.revisions?.[resource] ?? 0,
          initialized:
            !state.initializedResources ||
            state.initializedResources.includes(resource),
          serialized:
            value === undefined ? undefined : canonical(resource, value),
          value: value === undefined ? undefined : copy(value),
        });
      }
      let restored = [];
      try {
        restored = storage.load();
      } catch {
        durable = false;
      }
      for (const resource of resources) {
        restoreResource(
          resource,
          state,
          restored.filter((entry) => entry.resource === resource),
        );
      }
      notify();
    },
    refresh(state, resources) {
      for (const resource of resources) {
        if (
          running.has(resource) ||
          multipleDrafts.has(resource) ||
          !canRefresh(resource)
        )
          continue;
        const value = remoteValue(state, resource);
        if (value === undefined) continue;
        const revision = state.revisions?.[resource] ?? 0;
        if (revision === saved.get(resource)?.revision) continue;
        const entry = entries.get(resource);
        if (entry) {
          if (reconcile(entry, state) && entries.has(resource))
            schedule(resource);
        } else {
          saved.set(resource, {
            revision,
            serialized: canonical(resource, value),
            initialized: true,
            value: copy(value),
          });
          onUpdate(resource, copy(value));
        }
      }
      notify();
    },
    write(resource, value) {
      const current = entries.get(resource);
      const remote = saved.get(resource);
      if (
        !current &&
        remote?.initialized &&
        remote.serialized !== undefined &&
        matches(resource, value, remote.serialized)
      )
        return remote.value;
      const entry = current ?? {
        id: makeId(),
        resource,
        revision: saved.get(resource)?.revision ?? 0,
        base: saved.get(resource)?.serialized,
        baseValue: saved.get(resource)?.value,
      };
      entry.value = copy(value);
      entries.set(resource, entry);
      persist(entry);
      if (!["conflict", "auth"].includes(states.get(resource)?.state)) {
        status(resource, "saving", "Saving changes…");
        schedule(resource);
      }
      return entry.value;
    },
    revision(resource) {
      return saved.get(resource)?.revision ?? 0;
    },
    savedValue(resource) {
      const value = saved.get(resource)?.value;
      return value === undefined ? undefined : copy(value);
    },
    value(resource) {
      return entries.has(resource)
        ? copy(entries.get(resource).value)
        : undefined;
    },
    async retry() {
      try {
        const state = await readRemote();
        for (const entry of entries.values()) {
          if (running.has(entry.resource)) continue;
          if (multipleDrafts.has(entry.resource)) {
            const resource = entry.resource;
            const value = remoteValue(state, resource);
            saved.set(resource, {
              revision: state.revisions?.[resource] ?? 0,
              initialized:
                !state.initializedResources ||
                state.initializedResources.includes(resource),
              serialized:
                value === undefined ? undefined : canonical(resource, value),
              value: value === undefined ? undefined : copy(value),
            });
            restoreResource(
              resource,
              state,
              this.pending().filter((draft) => draft.resource === resource),
            );
          } else if (reconcile(entry, state) && entries.has(entry.resource))
            schedule(entry.resource, 0);
        }
      } catch (error) {
        for (const resource of entries.keys())
          status(
            resource,
            error.status === 401 ? "auth" : "offline",
            error.message,
          );
      }
    },
    pending() {
      let persisted = [];
      try {
        persisted = storage.load();
      } catch {
        durable = false;
      }
      return [
        ...new Map(
          [...persisted, ...entries.values()].map((entry) => [
            entry.id,
            copy(entry),
          ]),
        ).values(),
      ];
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
