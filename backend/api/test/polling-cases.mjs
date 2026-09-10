import assert from "node:assert/strict";
import { createAppDataRepository } from "../src/app-data-repository.mjs";
export async function measurePolling(pool, first, second) {
  let queries = 0;
  const repository = createAppDataRepository({
    connect: async () => {
      const client = await pool.connect();
      return {
        query: (...args) => {
          queries++;
          return client.query(...args);
        },
        release: () => client.release(),
      };
    },
  });
  for (const user of [first, second]) {
    const current = await repository.read(user);
    await repository.replace(
      "work-tasks",
      Array.from({ length: 5000 }, (_, i) => ({
        id: String(i),
        title: "Historical task " + i,
        date: "2026-09-01",
        checkedAt: "2026-09-01T12:00:00.000Z",
        archived: true,
      })),
      current.revisions["work-tasks"],
      user,
    );
  }
  const measure = async (method) => {
    queries = 0;
    let bytes = 0;
    const started = performance.now();
    for (let i = 0; i < 5; i++)
      for (const user of [first, second]) bytes += Buffer.byteLength(JSON.stringify(await repository[method](user)));
    return { bytes: Math.round(bytes / 10), queries: queries / 10, milliseconds: (performance.now() - started) / 10 };
  };
  const full = await measure("read");
  const revision = await measure("revisions");
  assert.ok(revision.bytes < full.bytes / 100);
  assert.ok(revision.queries < full.queries);
  const client = await pool.connect();
  let plan;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id',$1,true)", [first]);
    plan = (
      await client.query(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT resource, revision FROM app_data_revisions ORDER BY resource",
      )
    ).rows[0]["QUERY PLAN"][0];
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  console.log(
    "Polling baseline (two accounts, 5000 archived Work rows each):",
    JSON.stringify({
      full,
      revision,
      revisionPlan: plan.Plan["Node Type"],
      executionMilliseconds: plan["Execution Time"],
    }),
  );
}
