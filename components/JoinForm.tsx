'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export function JoinForm({ className, inputClassName }: { className?: string; inputClassName?: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);

  // Un lien d'invitation peut deja porter le code : /?code=ABCD
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    if (fromUrl) setCode(clean(fromUrl));
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 4) {
      setInvalid(true);
      return;
    }
    router.push(`/play?code=${code}`);
  }

  return (
    <form className={className} onSubmit={submit} style={{ gap: 12 }}>
      <input
        className={`input ${inputClassName ?? ''} ${invalid ? 'ko' : ''}`}
        value={code}
        onChange={(e) => {
          setCode(clean(e.target.value));
          setInvalid(false);
        }}
        maxLength={4}
        placeholder="CODE"
        aria-label="Code de la partie"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button className="btn lg block" type="submit">Rejoindre la partie</button>
    </form>
  );
}
