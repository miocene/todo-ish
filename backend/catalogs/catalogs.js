const rows = (items) => (Array.isArray(items) ? items : []);

export function normalizeFilamentCatalog(items) {
  return rows(items).map((item) => ({
    id: item.id,
    family: item.family,
    color: item.color,
    productCode: item.productCode || null,
    swatch: item.swatch,
  }));
}

export function normalizeFlossCatalog(items) {
  return rows(items).map((item) => ({
    id: item.id || `dmc${item.number.toLowerCase()}`,
    number: item.number,
    code: `DMC ${item.number}`,
    colorName: item.colorName,
    color: item.color,
    link: item.link || null,
  }));
}

export function createCatalogLookup({ filaments = [], floss = [] } = {}) {
  const normalizedFilaments = normalizeFilamentCatalog(filaments);
  const normalizedFloss = normalizeFlossCatalog(floss);

  return {
    filaments: normalizedFilaments,
    floss: normalizedFloss,
    filamentsById: new Map(normalizedFilaments.map((item) => [item.id, item])),
    flossById: new Map(normalizedFloss.map((item) => [item.id, item])),
  };
}

export function bambuFilamentLabel(catalogs, id) {
  const item = catalogs?.filamentsById?.get(id);
  if (!item) return id || "No filament";
  return item.color === "Catalog listing" ? item.family : `${item.family} · ${item.color}`;
}

export function dmcFlossLabel(catalogs, id) {
  const item = catalogs?.flossById?.get(id);
  return item ? `${item.code} · ${item.colorName}` : id;
}

export function dmcFlossCode(catalogs, id) {
  return catalogs?.flossById?.get(id)?.number || id;
}

export const bambuMaterial = (family) =>
  family?.startsWith("Support for ") ? "Support" : family?.split(" ", 1)[0] || "";
