'use client';
import React from 'react';
import StoreHeader from '@/components/StoreHeader';
import StoreFooter from '@/components/StoreFooter';
import AttributionCapture from '@/components/Tracking/AttributionCapture';
import ConsentBanner from '@/components/Tracking/ConsentBanner';
import TrackingTags from '@/components/Tracking/TrackingTags';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black dark:bg-store dark:text-store-text">
      <StoreHeader />
      <main className="flex-1">{children}</main>
      <StoreFooter />
      <AttributionCapture />
      <TrackingTags />
      <ConsentBanner />
    </div>
  );
}
