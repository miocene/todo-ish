import { syncFilamentShoppingList } from "./printing-supplies.js";
import { syncFlossShoppingList } from "./stitching-supplies.js";

export function syncSupplyShoppingLists() {
  syncFilamentShoppingList();
  return syncFlossShoppingList();
}
