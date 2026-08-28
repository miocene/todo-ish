import { reactive } from "vue";
import { initializeAppDataResource, readAppData, writeAppData } from "./app-data.js";

export const WORK_STATUSES = Object.freeze([
  { value: "work", label: "Workday", icon: "work" },
  { value: "pto", label: "PTO", icon: "pto" },
  { value: "sick-leave", label: "Sick leave", icon: "sick-leave" },
  { value: "holiday", label: "Holiday", icon: "holiday" },
  { value: "business-trip", label: "Business trip", icon: "work-trip" },
  { value: "weekend", label: "Weekend", icon: "weekend" },
  { value: "conference", label: "Conference", icon: "conference" },
]);

const DEFAULT_STATUS = WORK_STATUSES[0];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES = new Set(WORK_STATUSES.map((status) => status.value));

function loadStatuses() {
  const savedStatuses = readAppData("work-statuses");
  const statuses =
    !savedStatuses || typeof savedStatuses !== "object" || Array.isArray(savedStatuses) ? {} : savedStatuses;
  const normalized = Object.fromEntries(
    Object.entries(statuses).filter(([date, value]) => ISO_DATE.test(date) && STATUS_VALUES.has(value)),
  );
  return initializeAppDataResource("work-statuses", normalized);
}

function saveStatuses(statuses) {
  writeAppData("work-statuses", statuses);
}

const statusesByDate = reactive(loadStatuses());

export function getWorkStatus(date) {
  const value = statusesByDate[date];
  return WORK_STATUSES.find((status) => status.value === value) ?? DEFAULT_STATUS;
}

export function setWorkStatus(date, value) {
  const status = WORK_STATUSES.find((option) => option.value === value) ?? DEFAULT_STATUS;
  statusesByDate[date] = status.value;
  saveStatuses(statusesByDate);
}
