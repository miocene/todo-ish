const filamentQuery = `
WITH latest AS (
  SELECT id, imported_at, entry_count
  FROM filament_catalog_snapshots
  ORDER BY imported_at DESC, id DESC
  LIMIT 1
),
filtered AS (
  SELECT
    latest.imported_at,
    latest.entry_count,
    entries.catalog_id,
    entries.family,
    entries.color_name,
    entries.product_code,
    entries.swatch
  FROM latest
  JOIN filament_catalog_entries AS entries ON entries.snapshot_id = latest.id
  WHERE (
    $1::text = ''
    OR entries.catalog_id ILIKE '%' || $1 || '%'
    OR entries.family ILIKE '%' || $1 || '%'
    OR entries.color_name ILIKE '%' || $1 || '%'
    OR COALESCE(entries.product_code, '') ILIKE '%' || $1 || '%'
  )
  AND ($2::text = '' OR entries.family = $2)
),
paged AS (
  SELECT catalog_id, family, color_name, product_code, swatch
  FROM filtered
  ORDER BY family, color_name, catalog_id
  LIMIT $3 OFFSET $4
)
SELECT
  (SELECT imported_at FROM latest) AS "importedAt",
  (SELECT entry_count FROM latest) AS "entryCount",
  (SELECT count(*)::integer FROM filtered) AS total,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', catalog_id,
          'family', family,
          'color', color_name,
          'productCode', product_code,
          'swatch', swatch
        )
        ORDER BY family, color_name, catalog_id
      )
      FROM paged
    ),
    '[]'::jsonb
  ) AS items;
`;

const flossQuery = `
WITH latest AS (
  SELECT id, imported_at, entry_count
  FROM floss_catalog_snapshots
  ORDER BY imported_at DESC, id DESC
  LIMIT 1
),
filtered AS (
  SELECT
    latest.imported_at,
    latest.entry_count,
    entries.catalog_id,
    entries.number,
    entries.color_name,
    entries.color_hex,
    entries.purchase_url
  FROM latest
  JOIN floss_catalog_entries AS entries ON entries.snapshot_id = latest.id
  WHERE (
    $1::text = ''
    OR entries.catalog_id ILIKE '%' || $1 || '%'
    OR entries.number ILIKE '%' || $1 || '%'
    OR entries.color_name ILIKE '%' || $1 || '%'
  )
),
paged AS (
  SELECT catalog_id, number, color_name, color_hex, purchase_url
  FROM filtered
  ORDER BY number, catalog_id
  LIMIT $2 OFFSET $3
)
SELECT
  (SELECT imported_at FROM latest) AS "importedAt",
  (SELECT entry_count FROM latest) AS "entryCount",
  (SELECT count(*)::integer FROM filtered) AS total,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', catalog_id,
          'number', number,
          'colorName', color_name,
          'color', color_hex,
          'link', purchase_url
        )
        ORDER BY number, catalog_id
      )
      FROM paged
    ),
    '[]'::jsonb
  ) AS items;
`;

function catalogResponse(catalog, row, pagination) {
  return {
    catalog,
    snapshot: row.importedAt
      ? {
          importedAt: row.importedAt,
          entryCount: row.entryCount,
        }
      : null,
    total: row.total,
    limit: pagination.limit,
    offset: pagination.offset,
    items: row.items,
  };
}

export function createCatalogRepository(pool) {
  return {
    async health() {
      await pool.query("SELECT 1");
      return { status: "ok" };
    },

    async summary() {
      const [filament, floss] = await Promise.all([
        pool.query({
          text: `SELECT imported_at AS "importedAt", entry_count AS "entryCount"
                 FROM filament_catalog_snapshots
                 ORDER BY imported_at DESC, id DESC
                 LIMIT 1`,
        }),
        pool.query({
          text: `SELECT imported_at AS "importedAt", entry_count AS "entryCount"
                 FROM floss_catalog_snapshots
                 ORDER BY imported_at DESC, id DESC
                 LIMIT 1`,
        }),
      ]);

      return {
        catalogs: [
          { catalog: "filament", ...(filament.rows[0] || { importedAt: null, entryCount: 0 }) },
          { catalog: "floss", ...(floss.rows[0] || { importedAt: null, entryCount: 0 }) },
        ],
      };
    },

    async filaments({ family, limit, offset, query }) {
      const result = await pool.query({
        name: "catalog-filaments-v1",
        text: filamentQuery,
        values: [query, family, limit, offset],
      });
      return catalogResponse("filament", result.rows[0], { limit, offset });
    },

    async floss({ limit, offset, query }) {
      const result = await pool.query({
        name: "catalog-floss-v1",
        text: flossQuery,
        values: [query, limit, offset],
      });
      return catalogResponse("floss", result.rows[0], { limit, offset });
    },
  };
}
