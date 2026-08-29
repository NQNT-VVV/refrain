/** Ou s'adresser quand quelque chose cloche. */
export function SupportNote({ className = '' }: { className?: string }) {
  return (
    <p className={`support-note ${className}`}>
      Un souci ? Contacte <b>danwalex</b> ou ouvre un ticket.
    </p>
  );
}
