export const PROJECT_COLORS = ["#43b25d", "#4d88bd", "#b2b243", "#b044ad", "#28aca4", "#8996a2"];

export function projectColor(id, fallbackIndex = 0) {
  if (!id) return PROJECT_COLORS[fallbackIndex % PROJECT_COLORS.length];
  const seed = [...String(id)].reduce((total, character) => total + character.codePointAt(0), 0);
  return PROJECT_COLORS[seed % PROJECT_COLORS.length];
}

export function nextProjectColor(projects) {
  const usage = new Map(PROJECT_COLORS.map((color) => [color, 0]));
  for (const project of projects) usage.set(project.color, (usage.get(project.color) || 0) + 1);
  return PROJECT_COLORS.reduce((leastUsed, color) => (usage.get(color) < usage.get(leastUsed) ? color : leastUsed));
}
