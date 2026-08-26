export function stockOwned(stock, catalogId) {
  return Number(stock.find((item) => item.catalogId === catalogId)?.owned) || 0;
}

export function setStockLevel(stock, catalogId, value) {
  const owned = Math.max(0, Number(value) || 0);
  const index = stock.findIndex((item) => item.catalogId === catalogId);

  if (owned === 0) {
    if (index >= 0) stock.splice(index, 1);
    return;
  }

  if (index >= 0) stock[index].owned = owned;
  else stock.push({ catalogId, owned });
}
