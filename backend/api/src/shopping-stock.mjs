import { AppDataValidationError } from "./app-data-validation.mjs";
import { APP_DATA_LIMITS } from "./app-data-contract.mjs";

// A purchase ID is its durable operation ID. Reversed IDs are never reused.
// Called inside the shopping transaction, after inventory and shopping revision locks.
export async function adjustShoppingStock(client, data, userId, patch) {
  const query = (text, values = []) => client.query({ text, values });
  const previous = (
    await query(
      "SELECT id, source, catalog_id, quantity FROM manual_shopping_items WHERE source IS NOT NULL AND (NOT archived OR $1 OR id = ANY($2::text[]))",
      [data.history !== undefined && !patch, patch?.remove ?? []],
    )
  ).rows;
  const next = new Map(
    [...data.tasks, ...(data.history ?? [])]
      .filter((item) => item.source)
      .map((item) => [item.id, item]),
  );
  const receipts = new Map(
    (
      await query(
        "SELECT id, source, catalog_id, quantity, reversed FROM supply_purchase_receipts WHERE id = ANY($1::text[])",
        [[...next.keys()]],
      )
    ).rows.map((row) => [row.id, row]),
  );
  const changes = [];
  for (const item of next.values()) {
    const catalogId = item.filamentId ?? item.flossId;
    const receipt = receipts.get(item.id);
    if (receipt) {
      if (
        receipt.reversed ||
        receipt.source !== item.source ||
        receipt.catalog_id !== catalogId ||
        receipt.quantity !== item.quantity
      )
        throw new AppDataValidationError(
          "A purchase cannot be changed or reused after reversal. Create a new purchase.",
        );
      continue;
    }
    await query(
      "INSERT INTO supply_purchase_receipts (user_id, id, source, catalog_id, quantity) VALUES ($1,$2,$3,$4,$5)",
      [userId, item.id, item.source, catalogId, item.quantity],
    );
    changes.push({
      id: item.id,
      source: item.source,
      catalogId,
      quantity: item.quantity,
    });
  }
  for (const item of previous) {
    if (next.has(item.id)) continue;
    const result = await query(
      "UPDATE supply_purchase_receipts SET reversed = true WHERE id = $1 AND NOT reversed RETURNING id",
      [item.id],
    );
    if (result.rows.length)
      changes.push({
        id: item.id,
        source: item.source,
        catalogId: item.catalog_id,
        quantity: -item.quantity,
      });
  }
  for (const change of changes.sort((a, b) => a.quantity - b.quantity)) {
    const filament = change.source === "filament-shortage";
    const table = filament ? "filament_inventory" : "floss_inventory";
    const column = filament ? "spool_count" : "skein_count";
    const owned =
      (
        await query(
          `SELECT ${column} AS count FROM ${table} WHERE catalog_id = $1`,
          [change.catalogId],
        )
      ).rows[0]?.count ?? 0;
    const count = Math.max(0, owned + change.quantity);
    if (count > APP_DATA_LIMITS.quantity)
      throw new AppDataValidationError(
        "This purchase exceeds the inventory limit.",
      );
    await query(
      `INSERT INTO ${table} (catalog_id, ${column}) VALUES ($1,$2) ON CONFLICT (catalog_id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = now()`,
      [change.catalogId, count],
    );
    if (change.quantity < 0)
      await query(
        "UPDATE supply_purchase_receipts SET reversed_quantity = $2 WHERE id = $1",
        [change.id, owned - count],
      );
  }
  for (const source of new Set(changes.map((item) => item.source))) {
    await query(
      "UPDATE app_data_revisions SET revision = revision + 1, updated_at = now() WHERE scope = '' AND resource = $1",
      [
        source === "filament-shortage"
          ? "filament-inventory"
          : "floss-inventory",
      ],
    );
  }
}
