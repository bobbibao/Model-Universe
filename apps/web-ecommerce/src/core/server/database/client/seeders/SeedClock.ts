import { faker } from '@faker-js/faker/locale/en';
import { faker as fakerVI } from '@faker-js/faker/locale/vi';

// Deterministic development data (plan 5.7): the same SEED_RANDOM_SEED and SEED_NOW give the same shop.
// - SEED_NOW (ISO date-time) replaces the current time in every seeder; unset, the time the seed started.
// - SEED_RANDOM_SEED (integer) seeds faker; unset, 7.
// - SEED_HISTORY_DAYS: how far back the sales history goes; unset, 180.

export const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANDOM_SEED = 7;
const DEFAULT_HISTORY_DAYS = 180;

let now: Date | undefined;

// Called once before the seeders run: fixes "now" and the random sequence for the whole seed.
export const beginSeeding = (): void => {
  const raw = process.env.SEED_NOW;
  const fixed = raw ? new Date(raw) : new Date();
  if (Number.isNaN(fixed.getTime())) throw new Error(`SEED_NOW is not a date-time: ${raw}`);
  now = fixed;
  // Both instances the seeders use (User.Seeder writes Vietnamese names with the `vi` locale).
  const seed = Number(process.env.SEED_RANDOM_SEED || DEFAULT_RANDOM_SEED);
  faker.seed(seed);
  fakerVI.seed(seed);
};

export const seedNow = (): Date => {
  if (!now) beginSeeding();
  return new Date((now as Date).getTime());
};

export const historyDays = (): number => Number(process.env.SEED_HISTORY_DAYS || DEFAULT_HISTORY_DAYS);

export const daysAgo = (days: number): Date => new Date(seedNow().getTime() - days * DAY_MS);
export const daysFromNow = (days: number): Date => new Date(seedNow().getTime() + days * DAY_MS);
export const daysAfter = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

// A calendar date (YYYY-MM-DD) in Vietnam (UTC+7, no daylight saving), and the UTC instant of a local time on it.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const vnDate = (instant: Date): string => new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
export const vnInstant = (date: string, hour: number, minute = 0): Date =>
  new Date(Date.parse(`${date}T00:00:00Z`) + (hour * 60 + minute) * 60 * 1000 - VN_OFFSET_MS);
