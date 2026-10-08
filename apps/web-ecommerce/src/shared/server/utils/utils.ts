type ClassNamesArg = string | { [key: string]: boolean } | boolean | undefined | null;
export const months = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const cn = (...classNames: ClassNamesArg[]): string => {
  return classNames.filter((cn) => !!cn).join(' ');
};

export function capitalizeFirstLetter(str: any) {
  if (typeof str !== 'string' || str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const formatUSD = (amount: number): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });

  return formatter.format(amount);
};

export const formatVND = (amount: number, locale = 'vi'): string => {
  const formatter = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  });

  return formatter.format(Math.round(amount || 0));
};

//client/name/...

export const productNameToHandle = (name: string): string | undefined => {
  if (!name) return undefined;
  return name.toLowerCase().replace(/\s+/g, '-');
};

// This function is used to parse the value based on the data type
export const parseValue = (value: any): any => {
  if (typeof value === 'string' && isDate(value)) {
    return parseDate(value);
  }
  if (value === '' || value === null) {
    return null;
  }
  return value;
};

// This function is used to check if the value is a formatted date
export const isDate = (value: string): boolean => {
  const datePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  return datePattern.test(value);
};

// This function is used to parse the date
export const parseDate = (date: string): Date | undefined => {
  if (!date) return undefined;
  const [month, day, year] = date.split('/').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
};

// Calculate percentage change between two values, handling edge cases for division by zero
export const calculatePercentageChange = (previousValue: number, currentValue: number): number => {
  if (previousValue === 0 && currentValue === 0) return 0; // No change
  if (previousValue === 0) return 100; // Complete increase from 0
  if (currentValue === 0) return -100; // Complete decrease to 0

  return ((currentValue - previousValue) / previousValue) * 100;
};

export const getMonthNames = (previousMonth: number, currentMonth: number): string[] | null => {
  const monthNames = [months[previousMonth], months[currentMonth]];
  return monthNames[0] && monthNames[1] ? monthNames : null;
};
