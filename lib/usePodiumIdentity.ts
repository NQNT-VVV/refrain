'use client';

import { useEffect, useState } from 'react';

import type { PodiumMe } from './types';

/**
 * Qui est connecte a Podium, d'apres le serveur. `null` tant que la reponse
 * n'est pas arrivee, puis toujours un objet — `hubUrl` vaut null quand le
 * serveur n'est pas branche au hub, et c'est l'unique cas ou on n'en parle pas.
 */
export function usePodiumIdentity(): PodiumMe | null {
  const [me, setMe] = useState<PodiumMe | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/podium/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { hubUrl: null }))
      .then((data: PodiumMe) => { if (alive) setMe(data); })
      .catch(() => { if (alive) setMe({ hubUrl: null }); });
    return () => { alive = false; };
  }, []);
  return me;
}
