import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { createAppDataRepository } from "../src/app-data-repository.mjs";
import { exportAccountData, previewAccountImport, validateImportPlan } from "../src/data-transfer.mjs";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    username: { type: "string" },
    file: { type: "string" },
    plan: { type: "string" },
    mode: { type: "string", default: "merge" },
    "include-shared": { type: "boolean", default: false },
    "allow-account-remap": { type: "boolean", default: false },
  },
});
const command = positionals[0];
if (!["export", "preview", "apply"].includes(command) || positionals.length !== 1 || !values.username)
  throw new Error(
    "Usage: data-transfer.mjs export|preview|apply --username NAME --file EXPORT.json --plan PLAN.json [--mode merge|replace] [--include-shared] [--allow-account-remap]",
  );
const password = (await readFile(process.env.PGPASSWORD_FILE, "utf8")).trimEnd();
if (!password) throw new Error("Database password secret is empty");
const role = process.env.DATA_RUNTIME_ROLE ?? "todo_runtime";
if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error("Unsafe runtime role");
const pool = new Pool({ password, connectionTimeoutMillis: 5000, max: 1 });
const scopedPool = {
  connect: async () => {
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE "${role}"`);
      const permissions = await client.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
      if (permissions.rows[0]?.rolsuper || permissions.rows[0]?.rolbypassrls)
        throw new Error("Data transfers require a runtime role subject to row-level security");
      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  },
};
const save = (file, data) => writeFile(file, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
try {
  const account = (await pool.query("SELECT id, username FROM auth_users WHERE username=$1", [values.username]))
    .rows[0];
  if (!account) throw new Error("Provision this account before importing or exporting its data");
  const repository = createAppDataRepository(scopedPool);
  if (command === "export") {
    if (!values.file) throw new Error("--file is required");
    await save(values.file, exportAccountData(account, await repository.read(account.id)));
    console.log(`Exported ${account.username} and household data to ${values.file}`);
  } else if (command === "preview") {
    if (!values.file || !values.plan) throw new Error("--file and --plan are required");
    const data = JSON.parse(await readFile(values.file, "utf8"));
    const plan = previewAccountImport(account, await repository.read(account.id), data, {
      mode: values.mode,
      includeShared: values["include-shared"],
      allowAccountRemap: values["allow-account-remap"],
    });
    await save(values.plan, plan);
    console.table(
      plan.summary.map((row) => ({
        resource: row.resource,
        activeBefore: row.before.active,
        activeAfter: row.after.active,
        historyBefore: row.before.history,
        historyAfter: row.after.history,
      })),
    );
    console.log(
      `Review ${values.plan}. No database changes made. Mode: ${plan.mode}; shared data: ${plan.includeShared ? "included" : "preserved"}.`,
    );
  } else {
    if (!values.plan) throw new Error("--plan is required");
    const plan = validateImportPlan(JSON.parse(await readFile(values.plan, "utf8")));
    if (plan.account.id !== account.id) throw new Error("The plan belongs to a different account");
    await repository.restore(plan);
    console.log(`Imported reviewed plan for ${account.username}. All resource changes committed together.`);
  }
} finally {
  await pool.end();
}
