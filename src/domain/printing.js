export function projectProgress(project) {
  const included = project.parts.filter((part) => part.status !== "Cancelled");
  const done = included.filter((part) => part.status === "Done").length;
  return {
    done,
    total: included.length,
    percent: included.length ? Math.round((done / included.length) * 100) : null,
  };
}

export function isPrintProjectDone(project) {
  const included = project.parts.filter((part) => part.status !== "Cancelled");
  return included.length > 0 && included.every((part) => part.status === "Done");
}

export function filamentDemand(state, catalogId) {
  return state.printing
    .flatMap((project) => project.parts)
    .filter((part) => part.filamentId === catalogId && !["Done", "Cancelled"].includes(part.status))
    .reduce((sum, part) => sum + (Number(part.materialGrams) || 0), 0);
}
