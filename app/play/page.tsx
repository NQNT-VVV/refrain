import { Suspense } from 'react';
import type { Metadata } from 'next';

import { PlayClient } from './PlayClient';

export const metadata: Metadata = { title: 'Joueur' };

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayClient />
    </Suspense>
  );
}
