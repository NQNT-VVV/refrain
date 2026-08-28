'use client';

import { useEffect, useRef, useState } from 'react';

import { clock } from './clock';
import type { GameState } from './types';

export interface RoundClock {
  /** Part de l'extrait restant a ecouter, de 1 a 0. */
  ratio: number;
  /** Secondes restantes, arrondies au superieur. */
  seconds: number;
  /** Pendant le compte a rebours : 3, 2, 1 puis 0 pour « GO ». */
  countdown: number | null;
}

/**
 * Compte a rebours pilote par les horodatages du serveur.
 *
 * Une boucle `requestAnimationFrame` unique alimente a la fois l'anneau de
 * progression et le decompte : tous les ecrans restent alignes a la meme
 * seconde, quelle que soit la derive de leur horloge locale.
 */
export function useRoundClock(state: GameState | null): RoundClock {
  const [tick, setTick] = useState<RoundClock>({ ratio: 1, seconds: 0, countdown: null });
  const raf = useRef(0);

  const phase = state?.phase;
  const startAt = state?.round?.startAt;
  const endAt = state?.round?.endAt;

  useEffect(() => {
    if (!startAt || !endAt || (phase !== 'playing' && phase !== 'countdown')) {
      setTick({ ratio: 1, seconds: 0, countdown: null });
      return;
    }

    const step = () => {
      const now = clock.now();
      if (phase === 'countdown') {
        setTick({ ratio: 1, seconds: 0, countdown: Math.max(0, Math.ceil((startAt - now) / 1000)) });
      } else {
        const total = endAt - startAt;
        const ratio = Math.max(0, Math.min(1, (endAt - now) / total));
        setTick({ ratio, seconds: Math.max(0, Math.ceil((endAt - now) / 1000)), countdown: null });
      }
      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, startAt, endAt]);

  return tick;
}
