import type { Metadata, Viewport } from 'next';

import { Aurora } from '@/components/Aurora';
import { Toaster } from '@/components/Toaster';
import { caveat, emoji, fraunces, karla } from '@/lib/fonts';
import './globals.css';

/** Une cassette d'encre sur le papier : la marque, reduite a un objet. */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23E8E2D4'/%3E%3Crect x='1.5' y='3.5' width='13' height='9' rx='1.6' fill='%23221E1A'/%3E%3Crect x='3' y='5' width='10' height='2' rx='.6' fill='%23C8442B'/%3E%3Ccircle cx='5.4' cy='9.6' r='1.3' fill='%23F4EFE3'/%3E%3Ccircle cx='10.6' cy='9.6' r='1.3' fill='%23F4EFE3'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: { default: 'Refrain — Blind Test', template: '%s — Refrain' },
  description:
    "Refrain — le blind test où l’animateur lance la partie et les joueurs répondent depuis leur téléphone.",
  applicationName: 'Refrain',
  icons: { icon: FAVICON },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E8E2D4' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1714' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Pose le theme sur <html> avant le premier affichage, pour ne jamais montrer
 * la page claire a quelqu'un qui a choisi le sombre. Ordre : `?theme=dark|light`
 * dans l'adresse (utile pour une source OBS), puis le choix memorise, puis le
 * reglage du systeme.
 */
const THEME_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var s=null;try{s=localStorage.getItem('refrain-theme')}catch(e){}var t=(q==='dark'||q==='light')?q:(s==='dark'||s==='light')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${karla.variable} ${caveat.variable} ${emoji.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Aurora />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
