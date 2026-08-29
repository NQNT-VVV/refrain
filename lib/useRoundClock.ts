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
  /** Secondes restantes avant l'ouverture du buzzer ; 0 des qu'il est ouvert. */
  buzzLock: number;
  /** Secondes restantes au buzzeur pour repondre ; 0 hors arbitrage. */
  answerLeft: number;
}

/**
 * Compte a rebours pilote par les horodatages du serveur.
 *
 * Une boucle `requestAnimationFrame` unique alimente a la fois l'anneau de
 * progression et le decompte : tous les ecrans restent alignes a la meme
 * seconde, quelle que soit la derive de leur horloge locale.
 */
export function useRoundClock(state: GameState | null): RoundClock {
  const [tick, setTick] = useState<RoundClock>({ ratio: 1, seconds: 0, countdown: null, buzzLock: 0, answerLeft: 0 });
  const raf = useRef(0);
  const last = useRef(tick);

  /**
   * Ne redessine que si l'affichage change vraiment.
   *
   * Sans ce filtre, la boucle d'animation declenche un rendu React soixante
   * fois par seconde — sur la regie, cela veut dire re-parcourir la liste des
   * joueurs et les vingt-trois cartes du catalogue a chaque image. Les
   * secondes sont entieres, et le ratio n'a pas besoin d'etre suivi au
   * millieme : une barre de progression ne se voit pas bouger a ce point.
   */
  const publish = (next: RoundClock) => {
    const prev = last.current;
    if (
      Math.abs(next.ratio - prev.ratio) < 0.004
      && next.seconds === prev.seconds
      && next.countdown === prev.countdown
      && next.buzzLock === prev.buzzLock
      && next.answerLeft === prev.answerLeft
    ) return;
    last.current = next;
    setTick(next);
  };

  const phase = state?.phase;
  const startAt = state?.round?.startAt;
  const endAt = state?.round?.endAt;
  const buzzOpensAt = state?.round?.buzzOpensAt;
  const answerDeadline = state?.round?.answerDeadline ?? null;

  useEffect(() => {
    const live = phase === 'playing' || phase === 'countdown' || phase === 'buzzed';
    if (!startAt || !endAt || !live) {
      publish({ ratio: 1, seconds: 0, countdown: null, buzzLock: 0, answerLeft: 0 });
      return;
    }

    const step = () => {
      const now = clock.now();
      const buzzLock = buzzOpensAt ? Math.max(0, Math.ceil((buzzOpensAt - now) / 1000)) : 0;
      const answerLeft = answerDeadline ? Math.max(0, Math.ceil((answerDeadline - now) / 1000)) : 0;
      if (phase === 'countdown') {
        publish({ ratio: 1, seconds: 0, countdown: Math.max(0, Math.ceil((startAt - now) / 1000)), buzzLock, answerLeft });
      } else {
        const total = endAt - startAt;
        const ratio = Math.max(0, Math.min(1, (endAt - now) / total));
        publish({ ratio, seconds: Math.max(0, Math.ceil((endAt - now) / 1000)), countdown: null, buzzLock, answerLeft });
      }
      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, startAt, endAt, buzzOpensAt, answerDeadline]);

  return tick;
}
