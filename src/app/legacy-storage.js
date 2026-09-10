const archiveKey = (userId) => `done-ish.legacy-backup.v1:${userId}`;
export function archiveLegacyResource(storage, userId, key) {
  const raw = storage.getItem(key);
  if (raw === null) return false;
  const previous = storage.getItem(archiveKey(userId));
  const archive =
    previous === null ? { format: "done-ish-legacy-storage", version: 1, userId, entries: [] } : JSON.parse(previous);
  if (archive.userId !== userId || !Array.isArray(archive.entries))
    throw new Error("The existing legacy backup needs recovery");
  if (!archive.entries.some((entry) => entry.key === key && entry.raw === raw)) {
    archive.entries.push({ key, raw, archivedAt: new Date().toISOString() });
    storage.setItem(archiveKey(userId), JSON.stringify(archive));
  }
  // Originals stay in place until the owner explicitly clears browser storage.
  return true;
}
export function legacyStorageExport(storage, userId, keys) {
  return {
    format: "done-ish-legacy-recovery",
    version: 1,
    userId,
    createdAt: new Date().toISOString(),
    archive: storage.getItem(archiveKey(userId)),
    originals: keys.map((key) => ({ key, raw: storage.getItem(key) })).filter((entry) => entry.raw !== null),
  };
}
