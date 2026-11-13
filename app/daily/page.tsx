import type { Metadata } from 'next';

import { DailyClient } from './DailyClient';

export const metadata: Metadata = {
  title: 'Musique du jour',
  description: 'Un morceau par jour, six écoutes de plus en plus longues pour le retrouver. Le même pour tout le monde.',
};

export default function DailyPage() {
  return <DailyClient />;
}
