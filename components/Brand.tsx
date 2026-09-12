import Link from 'next/link';

/**
 * Marque de l'application. Le pictogramme se tait : le systeme n'illustre pas,
 * il nomme. Le badge « beta » reste — l'application bouge encore.
 */
export function Brand({ compact = false, href = '/' as string | null }) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">🎧</span>
      {!compact && <span className="brand-name">Refrain</span>}
      <span className="brand-beta">Beta</span>
    </>
  );

  if (!href) return <span className="brand">{content}</span>;
  return <Link className="brand" href={href} aria-label="Refrain — accueil">{content}</Link>;
}
