/** Read each account-scoped record independently so one damaged draft cannot hide the others. */
export function createPendingStorage({ storage, prefix, legacyPrefix, resources, onCorrupt = () => {} }) {
  const written = new Map();
  const blobPrefix = (id) => `${prefix()}blob:${id}:`;
  const ownRef = (id, ref) => typeof ref === "string" && ref.startsWith(blobPrefix(id));
  function refs(entry) {
    if (!entry) return [];
    return [entry.baseRef, entry.attemptedRef].filter((ref) => ownRef(entry.id, ref));
  }
  function readHead(store, key) {
    try {
      return JSON.parse(store.getItem(key));
    } catch {
      return null;
    }
  }
  return {
    load() {
      const entries = new Map();
      const corrupt = [];
      const blobs = new Map();
      const used = new Set();
      const store = storage();
      const current = prefix();
      const legacy = legacyPrefix();
      for (let index = 0; index < store.length; index++) {
        const key = store.key(index);
        if (!key?.startsWith(current) && !(legacy && key?.startsWith(legacy))) continue;
        const raw = store.getItem(key);
        if (key.startsWith(`${current}blob:`)) {
          blobs.set(key, raw);
          continue;
        }
        try {
          let entry = JSON.parse(raw);
          if (
            !entry ||
            typeof entry.id !== "string" ||
            !resources.includes(entry.resource) ||
            entry.value === undefined
          )
            throw new Error("Invalid pending record");
          const usedByEntry = [];
          if (entry.storageVersion !== undefined && entry.storageVersion !== 3)
            throw new Error("Unknown pending format");
          if (entry.storageVersion === 3) {
            const { baseRef, attemptedRef, ...head } = entry;
            delete head.storageVersion;
            const read = (ref) => {
              if (!ownRef(entry.id, ref)) throw new Error("Invalid account-scoped reference");
              const source = store.getItem(ref);
              if (source === null) throw new Error("Missing pending snapshot");
              const value = JSON.parse(source);
              usedByEntry.push(ref);
              return value;
            };
            const baseline = baseRef ? read(baseRef) : {};
            if (
              !baseline ||
              typeof baseline !== "object" ||
              Array.isArray(baseline) ||
              Object.keys(baseline).some((key) => !["base", "baseValue"].includes(key)) ||
              (baseline.base !== undefined && typeof baseline.base !== "string")
            )
              throw new Error("Invalid pending baseline");
            entry = { ...head, ...baseline, ...(attemptedRef && { attempted: read(attemptedRef) }) };
            if (entry.attempted !== undefined && typeof entry.attempted !== "string")
              throw new Error("Invalid attempted snapshot");
          }
          for (const ref of usedByEntry) used.add(ref);
          if (!entries.has(entry.id) || key.startsWith(current)) entries.set(entry.id, entry);
        } catch {
          corrupt.push({ storageKey: key, raw });
        }
      }
      // Orphaned snapshots may be the only recovery copy after a damaged head.
      for (const [key, raw] of blobs) if (!used.has(key)) corrupt.push({ storageKey: key, raw });
      onCorrupt(corrupt);
      return [...entries.values()];
    },
    save(entry) {
      const store = storage();
      const key = `${prefix()}${entry.id}`;
      const previous = written.get(key);
      const previousHead = previous?.head ?? readHead(store, key);
      const added = [];
      const blob = (value) => {
        const ref = `${blobPrefix(entry.id)}${globalThis.crypto.randomUUID()}`;
        store.setItem(ref, JSON.stringify(value));
        added.push(ref);
        return ref;
      };
      const { base, baseValue, attempted, ...head } = entry;
      head.storageVersion = 3;
      try {
        if (base !== undefined || baseValue !== undefined)
          head.baseRef =
            previous?.base === base && previous?.revision === entry.revision && previous?.head.baseRef
              ? previous?.head.baseRef
              : blob({ ...(base !== undefined && { base }), ...(baseValue !== undefined && { baseValue }) });
        if (attempted !== undefined)
          head.attemptedRef =
            previous?.attempted === attempted && previous?.head.attemptedRef
              ? previous?.head.attemptedRef
              : blob(attempted);
        // Publish the new head last. A quota failure leaves the old durable draft intact.
        store.setItem(key, JSON.stringify(head));
      } catch (error) {
        for (const ref of added) store.removeItem(ref);
        throw error;
      }
      written.set(key, { base, revision: entry.revision, attempted, head });
      const retained = new Set(refs(head));
      for (const ref of refs(previousHead)) if (!retained.has(ref)) store.removeItem(ref);
    },
    remove(id) {
      const store = storage();
      const key = `${prefix()}${id}`;
      const head = readHead(store, key);
      store.removeItem(key);
      for (const ref of refs(head)) store.removeItem(ref);
      written.delete(key);
      const legacy = legacyPrefix();
      if (legacy) store.removeItem(`${legacy}${id}`);
    },
  };
}
