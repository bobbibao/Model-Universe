export const dateValue = (date: Date, time = false) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return time ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
};

export function parseDateValue(value?: string | number) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) return undefined;
  const [year, month, day, hour = 0, minute = 0] = value.split(/[-T:]/).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute
    ? date
    : undefined;
}
