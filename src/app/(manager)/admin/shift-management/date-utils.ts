import { weekdays } from "./constants";

export function normalizeDateInput(value: string) {
  if (value === "") return value;
  const [year] = value.split("-");

  if (year.length > 4 || value.length > 10) return null;

  return value;
}

export function getDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const weekday = weekdays[parsedDate.getDay()];

  return `${month}月${day}日（${weekday}）`;
}
