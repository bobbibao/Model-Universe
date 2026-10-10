import { redirect } from 'next/navigation';

// Preserve shared search links while keeping catalog discovery in one workspace.
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
    else value?.forEach((item) => query.append(key, item));
  }
  redirect(`/${locale}/shop${query.size ? `?${query}` : ''}`);
}
