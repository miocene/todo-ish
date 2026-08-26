import BAMBU_FILAMENT_SNAPSHOT from "./bambu-filaments.snapshot.json" with { type: "json" };
import DMC_FLOSS_SNAPSHOT from "./dmc-floss.snapshot.json" with { type: "json" };

export const bambuFilamentCatalog = BAMBU_FILAMENT_SNAPSHOT.entries;
export const dmcFlossCatalog = DMC_FLOSS_SNAPSHOT.entries.map((item) => ({
  ...item,
  id: `dmc${item.number.toLowerCase()}`,
  code: `DMC ${item.number}`,
}));
export const bambuMaterial = (family) => (family.startsWith("Support for ") ? "Support" : family.split(" ", 1)[0]);
