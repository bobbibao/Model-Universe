export const locales = ['vi', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'vi';
export const isLocale = (value: string): value is Locale => locales.includes(value as Locale);
export const withoutLocale = (path: string) => path.replace(/^\/(vi|en)(?=\/|$)/, '') || '/';
