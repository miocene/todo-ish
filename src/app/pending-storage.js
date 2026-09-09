/** Read each account-scoped record independently so one damaged draft cannot hide the others. */
export function createPendingStorage({ storage, prefix, legacyPrefix, resources, onCorrupt = () => {} }) {
  return {
    load() {
      const entries = new Map();
      const corrupt = [];
      const store = storage();
      const current = prefix();
      const legacy = legacyPrefix();
      for (let index = 0; index < store.length; index++) {
        const key = store.key(index);
        if (!key?.startsWith(current) && !(legacy && key?.startsWith(legacy))) continue;
        const raw = store.getItem(key);
        try {
          const entry = JSON.parse(raw);
          if (
            !entry ||
            typeof entry.id !== "string" ||
            !resources.includes(entry.resource) ||
            entry.value === undefined
          )
            throw new Error("Invalid pending record");
          if (!entries.has(entry.id) || key.startsWith(current)) entries.set(entry.id, entry);
        } catch {
          corrupt.push({ storageKey: key, raw });
        }
      }
      onCorrupt(corrupt);
      return [...entries.values()];
    },
    save(entry) {
      storage().setItem(`${prefix()}${entry.id}`, JSON.stringify(entry));
    },
    remove(id) {
      const store = storage();
      store.removeItem(`${prefix()}${id}`);
      const legacy = legacyPrefix();
      if (legacy) store.removeItem(`${legacy}${id}`);
    },
  };
}
