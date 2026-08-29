import Link from 'next/link';

/** Ou s'adresser quand quelque chose cloche, et ou lire les regles du jeu. */
export function SupportNote({ className = '' }: { className?: string }) {
  return (
    <p className={`support-note ${className}`}>
      Un souci ? Contacte <b>danwalex</b> ou ouvre un ticket.
      {' · '}
      <Link href="/legal">Donnees et conditions</Link>
    </p>
  );
}
