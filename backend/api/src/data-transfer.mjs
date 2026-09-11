import {
  APP_DATA_RESOURCES,
  SHARED_APP_DATA_RESOURCES,
  resourceFromState,
  emptyResource,
} from "./app-data-contract.mjs";
import { validateAppDataResource, AppDataValidationError } from "./app-data-validation.mjs";
import { historyKey } from "./history-transport.mjs";
const PERSONAL = APP_DATA_RESOURCES.filter(
  (resource) => !SHARED_APP_DATA_RESOURCES.includes(resource) || resource === "shopping",
);
const SHARED = SHARED_APP_DATA_RESOURCES;
const copy = (value) => JSON.parse(JSON.stringify(value));
const shoppingPart = (value, personal) => ({
  tasks: value.tasks.filter((item) => Boolean(item.source) === personal),
  history: (value.history ?? []).filter((item) => Boolean(item.source) === personal),
});
export function exportAccountData(account, state) {
  const result = {
    format: "done-ish-data",
    version: 1,
    createdAt: new Date().toISOString(),
    account: { id: account.id, username: account.username },
    private: {},
    shared: {},
  };
  for (const resource of APP_DATA_RESOURCES) {
    const value = resourceFromState(state, resource) ?? emptyResource(resource);
    if (resource === "shopping") {
      result.private.shopping = shoppingPart(value, true);
      result.shared.shopping = shoppingPart(value, false);
    } else (PERSONAL.includes(resource) ? result.private : result.shared)[resource] = copy(value);
  }
  return result;
}
function checkExport(data) {
  if (data?.format !== "done-ish-data" || data.version !== 1 || typeof data.account?.id !== "string")
    throw new AppDataValidationError("Unsupported data export format");
  for (const [group, resources] of [
    ["private", PERSONAL],
    ["shared", SHARED],
  ]) {
    if (
      !data[group] ||
      typeof data[group] !== "object" ||
      Array.isArray(data[group]) ||
      Object.keys(data[group]).some((key) => !resources.includes(key))
    )
      throw new AppDataValidationError(`Invalid ${group} resource group`);
    for (const resource of resources) validateAppDataResource(resource, data[group][resource]);
  }
  for (const [group, personal] of [
    ["private", true],
    ["shared", false],
  ]) {
    const shopping = data[group].shopping;
    if ([...shopping.tasks, ...(shopping.history ?? [])].some((item) => Boolean(item.source) !== personal))
      throw new AppDataValidationError("Shopping ownership does not match its export group");
  }
}
const mergeRows = (before, after, key = (row) => row.id) => [
  ...new Map([...before, ...after].map((row) => [key(row), row])).values(),
];
function mergeResource(resource, before, after) {
  if (Array.isArray(before)) return mergeRows(before, after);
  if (["work-statuses", "colors", "filament-inventory", "floss-inventory"].includes(resource))
    return { ...before, ...after };
  if (resource === "preferences") return after;
  const collection =
    resource === "todos" ? "lists" : ["printing", "cross-stitch"].includes(resource) ? "projects" : "tasks";
  const archived = new Set((after.history ?? []).map((item) => historyKey(resource, item)));
  let current = before[collection];
  if (["lists", "projects"].includes(collection)) {
    const destination = new Map(
      after[collection].flatMap((parent) => parent.tasks.map((item) => [item.id, parent.id])),
    );
    current = current.map((parent) => ({
      ...parent,
      tasks: parent.tasks.filter(
        (item) => !archived.has(item.id) && (!destination.has(item.id) || destination.get(item.id) === parent.id),
      ),
    }));
    const parents = new Map(current.map((parent) => [parent.id, parent]));
    for (const parent of after[collection])
      parents.set(parent.id, { ...parent, tasks: mergeRows(parents.get(parent.id)?.tasks ?? [], parent.tasks) });
    current = [...parents.values()];
  } else
    current = mergeRows(
      current.filter((item) => !archived.has(historyKey(resource, item))),
      after[collection],
    );
  const active = new Set(
    (["lists", "projects"].includes(collection) ? current.flatMap((parent) => parent.tasks) : current).map((item) =>
      historyKey(resource, item),
    ),
  );
  const history = mergeRows(before.history ?? [], after.history ?? [], (item) => historyKey(resource, item)).filter(
    (item) => !active.has(historyKey(resource, item)),
  );
  return {
    ...before,
    ...after,
    [collection]: current,
    history,
    ...(resource === "chores" && {
      occurrenceOrder: [...new Set([...after.occurrenceOrder, ...before.occurrenceOrder])].filter((id) =>
        current.some((item) => item.id === id),
      ),
    }),
  };
}
function counts(resource, value) {
  if (Array.isArray(value))
    return {
      active: value.filter((item) => !item.archived).length,
      history: value.filter((item) => item.archived).length,
    };
  return {
    active:
      value.tasks?.length ??
      value.lists?.reduce((n, list) => n + list.tasks.length, 0) ??
      value.projects?.reduce((n, project) => n + project.tasks.length, 0) ??
      Object.keys(value).length,
    history: value.history?.length ?? 0,
  };
}
export function previewAccountImport(
  account,
  state,
  data,
  { mode = "merge", includeShared = false, allowAccountRemap = false } = {},
) {
  checkExport(data);
  if (!["merge", "replace"].includes(mode)) throw new AppDataValidationError("Import mode must be merge or replace");
  if (data.account.id !== account.id && !allowAccountRemap)
    throw new AppDataValidationError(
      "This export belongs to another account; explicitly allow account remapping to import it",
    );
  const plan = {
    format: "done-ish-import-plan",
    version: 1,
    createdAt: new Date().toISOString(),
    account: { id: account.id, username: account.username },
    mode,
    includeShared,
    resources: {},
    revisions: {},
    summary: [],
  };
  for (const resource of APP_DATA_RESOURCES.filter((resource) => includeShared || PERSONAL.includes(resource))) {
    const before = resourceFromState(state, resource) ?? emptyResource(resource);
    let after;
    if (resource === "shopping") {
      const personal =
        mode === "merge"
          ? mergeResource(resource, shoppingPart(before, true), data.private.shopping)
          : data.private.shopping;
      const shared = includeShared
        ? mode === "merge"
          ? mergeResource(resource, shoppingPart(before, false), data.shared.shopping)
          : data.shared.shopping
        : shoppingPart(before, false);
      after = {
        tasks: [...shared.tasks, ...personal.tasks],
        history: [...(shared.history ?? []), ...(personal.history ?? [])],
      };
    } else {
      const incoming = (PERSONAL.includes(resource) ? data.private : data.shared)[resource];
      after = mode === "merge" ? mergeResource(resource, before, incoming) : copy(incoming);
    }
    if (resource === "todos" && !after.lists.some((list) => list.id === "general"))
      after = {
        ...after,
        lists: [
          {
            ...(before.lists.find((list) => list.id === "general") ?? {
              id: "general",
              title: "General",
              color: 1,
            }),
            tasks: [],
          },
          ...after.lists,
        ],
      };
    if (!Array.isArray(after) && ["chores", "todos", "shopping", "printing", "cross-stitch"].includes(resource))
      after = {
        ...after,
        history: after.history ?? [],
        ...(["chores", "todos"].includes(resource) && { replaceHistory: true }),
      };
    plan.resources[resource] = validateAppDataResource(resource, after);
    plan.revisions[resource] = state.revisions[resource] ?? 0;
    plan.summary.push({ resource, before: counts(resource, before), after: counts(resource, after) });
  }
  return plan;
}
export function validateImportPlan(plan) {
  if (
    plan?.format !== "done-ish-import-plan" ||
    plan.version !== 1 ||
    typeof plan.account?.id !== "string" ||
    !plan.account.id ||
    typeof plan.includeShared !== "boolean" ||
    !["merge", "replace"].includes(plan.mode) ||
    !plan.resources ||
    !plan.revisions
  )
    throw new AppDataValidationError("Invalid import plan");
  const expected = APP_DATA_RESOURCES.filter((resource) => plan.includeShared || PERSONAL.includes(resource));
  if (
    Object.keys(plan.resources).length !== expected.length ||
    expected.some((resource) => !Object.hasOwn(plan.resources, resource))
  )
    throw new AppDataValidationError("Import plan resources do not match the selected scope");
  for (const resource of expected) {
    validateAppDataResource(resource, plan.resources[resource]);
    if (!Number.isInteger(plan.revisions[resource]) || plan.revisions[resource] < 0)
      throw new AppDataValidationError("Invalid import revision");
  }
  return plan;
}
