import type { Metadata, Viewport } from 'next';

import { Aurora } from '@/components/Aurora';
import { Toaster } from '@/components/Toaster';
import { archivo, departure, emoji } from '@/lib/fonts';
import './globals.css';

/** Une onde d'os sur fond noir : la marque, reduite a un signe. */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'%3E%3Crect width='16' height='16' fill='%23060505'/%3E%3Cpath fill='%23D9D2C3' d='M2 7h1v2H2zM4 5h1v6H4zM6 2h1v12H6zM9 4h1v8H9zM11 6h1v4h-1zM13 7h1v2h-1z'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: { default: 'Refrain — Blind Test', template: '%s — Refrain' },
  description:
    "Refrain — le blind test ou l'animateur lance la partie et les joueurs repondent depuis leur telephone.",
  applicationName: 'Refrain',
  icons: { icon: FAVICON },
};

export const viewport: Viewport = {
  themeColor: '#060505',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${archivo.variable} ${departure.variable} ${emoji.variable}`}>
      <body>
        <Aurora />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
