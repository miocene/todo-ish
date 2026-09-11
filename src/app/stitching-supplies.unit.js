import assert from "node:assert/strict";
import test from "node:test";
import { flossSupplyStatus } from "./stitching-supplies.js";

test("floss requirements aggregate skeins and compare them with inventory", () => {
  const projects = [
    {
      tasks: [
        {
          completed: false,
          flossId: "dmc3347",
          requiredSkeins: 2,
          title: "DMC 3347",
        },
        {
          completed: false,
          flossId: "dmc3347",
          requiredSkeins: 1,
          title: "DMC 3347",
        },
        {
          completed: true,
          flossId: "dmc3347",
          requiredSkeins: 10,
          title: "DMC 3347",
        },
      ],
    },
  ];
  const supply = flossSupplyStatus(projects, { dmc3347: 1 }).get("dmc3347");

  assert.equal(supply.requiredSkeins, 3);
  assert.equal(supply.ownedSkeins, 1);
  assert.equal(supply.missingSkeins, 2);
});
