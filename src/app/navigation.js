export const primaryNavigation = [
  { group: "home", label: "Home", icon: "⌂", to: { name: "home" } },
  {
    group: "make",
    label: "Make",
    icon: "◇",
    to: { name: "printing" },
    shortcuts: [
      { to: { name: "printing" }, icon: "◇", label: "Printing" },
      { to: { name: "cross-stitch" }, icon: "✣", label: "Stitch" },
    ],
  },
  {
    group: "do",
    label: "Do",
    icon: "✓",
    to: { name: "work" },
    shortcuts: [
      { to: { name: "work" }, icon: "↗", label: "Work" },
      { to: { name: "todo" }, icon: "✓", label: "To-dos" },
      { to: { name: "chores" }, icon: "◴", label: "Chores" },
    ],
  },
  { group: "shopping", label: "Buy", icon: "⌁", to: { name: "shopping" } },
  {
    group: "catalogues",
    label: "Catalogues",
    icon: "◉",
    to: { name: "filaments" },
    shortcutLabel: "Catalogue",
    shortcuts: [
      { to: { name: "filaments" }, icon: "◌", label: "Filaments" },
      { to: { name: "threads" }, icon: "●", label: "DMC floss" },
    ],
  },
];

export const sectionNavigation = Object.fromEntries(
  primaryNavigation.filter((item) => item.shortcuts).map((item) => [item.group, item.shortcuts]),
);

const searchPage = (label, to) => ({ key: `page-${to.name}`, label, section: "Page", to });

export const searchablePages = [
  ...primaryNavigation.flatMap((item) =>
    item.shortcuts
      ? item.shortcuts.map((shortcut) => searchPage(shortcut.label, shortcut.to))
      : [searchPage(item.label, item.to)],
  ),
  { key: "page-settings", label: "Settings", section: "Page", to: { name: "settings" } },
];
