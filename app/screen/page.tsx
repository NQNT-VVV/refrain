import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ScreenClient } from './ScreenClient';

export const metadata: Metadata = { title: 'Écran' };

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenClient />
    </Suspense>
  );
}
