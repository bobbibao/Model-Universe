import React from 'react';

// Centered card used by the sign-in and sign-up pages.
const AuthCard = ({ title, children }: { title: string; children: React.ReactNode }) => {
  return (
    <div className="mx-auto my-12 w-full max-w-lg px-4">
      <div className="rounded-md border border-stroke bg-white p-6 shadow-default dark:border-store-card dark:bg-store-panel sm:p-10">
        <h1 className="mb-8 text-center text-3xl font-bold text-black dark:text-white">{title}</h1>
        {children}
      </div>
    </div>
  );
};

export const primaryButtonClassName =
  'w-full rounded-md bg-brand px-4 py-3 font-semibold text-brand-ink transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClassName =
  'w-full rounded-md bg-gray px-4 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-store-card dark:text-store-text';

export default AuthCard;
