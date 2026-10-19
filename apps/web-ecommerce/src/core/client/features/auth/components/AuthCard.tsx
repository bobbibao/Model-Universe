import React from 'react';

// Centered card used by the sign-in and sign-up pages.
const AuthCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="mx-auto my-8 w-full max-w-lg px-4 sm:my-16">
      <div className="rounded-3xl border border-stroke bg-white p-6 shadow-xl shadow-black/5 dark:border-store-card dark:bg-store-panel sm:p-10">
        <div className="mb-6 flex justify-center">
          <span className="rounded-full bg-brand/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black dark:text-store-text">
            Model Universe
          </span>
        </div>
        <h1 className="text-center text-3xl font-bold tracking-tight text-black dark:text-white">{title}</h1>
        {description && (
          <p className="mt-3 text-center text-sm leading-6 text-body dark:text-store-muted">{description}</p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
};

export const primaryButtonClassName =
  'w-full rounded-xl bg-brand px-4 py-3.5 font-semibold text-brand-ink transition hover:bg-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-hover disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClassName =
  'w-full rounded-md bg-gray px-4 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-store-card dark:text-store-text';

export default AuthCard;
