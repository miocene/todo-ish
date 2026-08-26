const record = (prefix, section, item, to) => ({
  key: `${prefix}-${item.id}`,
  label: item.title,
  section,
  to,
});

export function searchRecords(state) {
  return [
    ...state.work.map((item) => record("work", "Work", item, { name: "work" })),
    ...state.todos.map((item) => record("todo", "To-do", item, { name: "todo" })),
    ...state.chores.map((item) => record("chore", "Chores", item, { name: "chores" })),
    ...state.shopping.map((item) => record("shopping", "Buy", item, { name: "shopping" })),
    ...state.printing.map((item) =>
      record("printing", "Printing", item, { name: "printing-project", params: { id: item.id } }),
    ),
    ...state.stitch.map((item) =>
      record("stitch", "Stitch", item, { name: "stitch-project", params: { id: item.id } }),
    ),
  ];
}

export function filterSearchRecords(records, query, limit = Infinity) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return records.filter((item) => item.label.toLocaleLowerCase().includes(normalizedQuery)).slice(0, limit);
}
