import { weekdays } from "./constants";

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

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

export function toDateString(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

export function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = firstDay + daysInMonth > 35 ? 42 : 35;
  const firstCalendarDate = new Date(year, month, 1 - firstDay);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(firstCalendarDate);
    date.setDate(firstCalendarDate.getDate() + index);

    return {
      value: date.getDate(),
      date: toDateString(date),
      outside: date.getMonth() !== month,
    };
  });
}
