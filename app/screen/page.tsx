import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ScreenClient } from './ScreenClient';

export const metadata: Metadata = { title: 'Ecran' };

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenClient />
    </Suspense>
  );
}
