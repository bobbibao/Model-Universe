// Small hand-written validators; services collect messages and raise HttpError.badRequest(summary, messages).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9\s.-]{8,15}$/;

export const MIN_PASSWORD_LENGTH = 6;

export const normalizeEmail = (email: unknown): string => (typeof email === 'string' ? email.trim().toLowerCase() : '');

export const isValidEmail = (email: string): boolean => EMAIL_PATTERN.test(email);

export const isValidPhone = (phone: string): boolean => PHONE_PATTERN.test(phone);

export const asTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const isNonEmpty = (value: unknown, minLength = 1): boolean => asTrimmedString(value).length >= minLength;

// Parses an integer from a JSON/query value; undefined when it is not a whole number.
export const toInteger = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
};

export const isHttpUrl = (value: string): boolean => /^https?:\/\/\S+$/i.test(value);
