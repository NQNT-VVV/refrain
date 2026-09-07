import type { Metadata } from 'next';

import { WeeklyClient } from './WeeklyClient';

export const metadata: Metadata = {
  title: 'Playlist de la semaine',
  description: 'Cinq morceaux, les memes pour tout le monde, six ecoutes chacun. Une seule tentative par semaine.',
};

export default function WeeklyPage() {
  return <WeeklyClient />;
}
