import type { Metadata } from 'next';

import { HostClient } from './HostClient';

export const metadata: Metadata = { title: 'Régie' };

export default function HostPage() {
  return <HostClient />;
}
