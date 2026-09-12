'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { usePodiumIdentity } from '@/lib/usePodiumIdentity';
import styles from './JoinForm.module.css';

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

/**
 * Code de partie — CMP 0x03. Quatre cases plutot qu'un champ : le code est une
 * donnee de quatre signes, pas une phrase. Le champ reel reste au-dessus,
 * transparent, pour que la saisie, le collage et le clavier mobile marchent.
 */
export function JoinForm({ className, inputClassName }: { className?: string; inputClassName?: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const podium = usePodiumIdentity();

  // Un lien d'invitation peut deja porter le code : /?code=ABCD
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    if (fromUrl) setCode(clean(fromUrl));
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 4) {
      setInvalid(true);
      input.current?.focus();
      return;
    }
    router.push(`/play?code=${code}`);
  }

  const cells = [0, 1, 2, 3];

  return (
    <form className={className} onSubmit={submit} style={{ gap: 'var(--sp-3)' }}>
      <div className={`${styles.code} ${inputClassName ?? ''}`}>
        <input
          ref={input}
          className={styles.real}
          value={code}
          onChange={(e) => {
            setCode(clean(e.target.value));
            setInvalid(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={4}
          aria-label="Code de la partie"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
        />
        {cells.map((i) => {
          const active = focused && i === Math.min(code.length, 3);
          return (
            <span key={i} className={`${styles.cell} ${active ? styles.active : ''} ${invalid ? styles.ko : ''}`} aria-hidden="true">
              {code[i] ?? (active ? <span className={styles.caret} /> : '')}
            </span>
          );
        })}
      </div>
      <span className="meta">{invalid ? 'CODE INCOMPLET · 4 SIGNES' : `${code.length}/4 · VERIFICATION AUTOMATIQUE`}</span>
      <button className="btn primary lg block" type="submit">REJOINDRE LA PARTIE</button>
      {podium?.pid && (
        <span className="pill ok">
          <span className="avatar sm" aria-hidden="true"><span>{podium.avatar}</span></span>
          CONNECTE VIA PODIUM · {podium.pseudo}
        </span>
      )}
    </form>
  );
}
