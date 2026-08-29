import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Color_Emoji, Space_Grotesk } from 'next/font/google';

import { Aurora } from '@/components/Aurora';
import { Toaster } from '@/components/Toaster';
import './globals.css';

const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

/**
 * Police emoji embarquee. Une source navigateur OBS, ou un PC de projection
 * fraichement installe, n'a souvent aucune police emoji : avatars, marqueurs et
 * trophees s'affichent alors en carres vides — sur l'ecran que tout le monde
 * regarde. L'embarquer garantit le meme rendu partout.
 */
const emoji = Noto_Color_Emoji({
  subsets: ['emoji'],
  weight: '400',
  variable: '--font-emoji',
  display: 'swap',
  preload: false,
});

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🎧%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: { default: 'Refrain — Blind Test', template: '%s — Refrain' },
  description:
    "Refrain — le blind test ou l'animateur lance la partie et les joueurs repondent depuis leur telephone.",
  applicationName: 'Refrain',
  icons: { icon: FAVICON },
};

export const viewport: Viewport = {
  themeColor: '#07060e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${body.variable} ${display.variable} ${emoji.variable}`}>
      <body>
        <Aurora />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
