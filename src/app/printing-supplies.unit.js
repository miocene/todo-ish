import assert from "node:assert/strict";
import test from "node:test";
import { filamentSupplyStatus } from "./printing-supplies.js";

test("filament requirements aggregate unfinished usages into whole spools", () => {
  const projects = [
    {
      tasks: [
        {
          completed: false,
          filaments: [
            {
              catalogId: "bambu-pla-basic-filament-10101",
              label: "PLA Basic · Black",
              weightGrams: 1002,
            },
            {
              catalogId: "bambu-pla-basic-filament-10101",
              label: "PLA Basic · Black",
              weightGrams: 8,
            },
          ],
        },
        {
          completed: true,
          filaments: [
            { catalogId: "bambu-pla-basic-filament-10101", weightGrams: 5000 },
          ],
        },
      ],
    },
  ];
  const supply = filamentSupplyStatus(projects, {
    "bambu-pla-basic-filament-10101": 1,
  }).get("bambu-pla-basic-filament-10101");

  assert.equal(supply.requiredGrams, 1010);
  assert.equal(supply.requiredSpools, 2);
  assert.equal(supply.missingSpools, 1);
});
