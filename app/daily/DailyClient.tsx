'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import { SoloRound } from '@/components/SoloRound';
import { SupportNote } from '@/components/SupportNote';
import { confetti } from '@/lib/confetti';
import { sfx } from '@/lib/sfx';
import { toast } from '@/lib/toast';
import type { DailyState } from '@/lib/types';

import styles from './daily.module.css';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Le serveur ne repond pas.');
  return data as T;
}

/** Date lisible du jour joue, depuis la cle AAAA-MM-JJ. */
function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function DailyClient() {
  const [state, setState] = useState<DailyState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api<DailyState>('/api/daily').then(setState).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!state?.finished || !state.solved || !canvas.current) return;
    sfx.unlock();
    sfx.win();
    return confetti(canvas.current);
  }, [state?.finished, state?.solved]);

  async function guess(title: string) {
    if (busy || !state || state.finished) return;
    setBusy(true);
    try {
      const next = await api<DailyState>('/api/daily/guess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      setState(next);
      if (next.result === 'ok') { sfx.unlock(); sfx.good(); }
      else if (next.result === 'miss' && !next.finished) toast(`Non… ${next.unlocked} s debloquees.`, 'err');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (busy || !state || state.finished) return;
    setBusy(true);
    try {
      const next = await api<DailyState>('/api/daily/skip', { method: 'POST' });
      setState(next);
      if (!next.finished) toast(`Passe. ${next.unlocked} s debloquees.`);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.app}>
      <canvas ref={canvas} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, width: '100%', height: '100%' }} />

      <div className={styles.brandBar}>
        <Brand />
        <span className={styles.spacer} />
        <Link className="btn sm" href="/weekly" title="Playlist de la semaine"><Icon name="liste" />La semaine</Link>
        <Link className="btn sm" href="/"><Icon name="precedent" />Accueil</Link>
      </div>

      <main className={styles.main}>
        <header className={styles.head}>
          <span className={styles.date}>{state ? prettyDate(state.dateKey) : 'Musique du jour'}</span>
          <h1>MUSIQUE DU JOUR</h1>
          <p>Un seul morceau, le meme pour tout le monde. Six ecoutes, de plus en plus longues, pour le retrouver.</p>
        </header>

        {error && <p className={styles.error}>{error}</p>}
        {!state && !error && (
          <div className="waiting" role="status" aria-live="polite">
            <div className="frame">
              <span className="what">Chargement de la musique du jour</span>
              <span className="loading-dots" aria-hidden="true"><span /><span /><span /></span>
              <span>Le morceau est le meme pour tout le monde</span>
            </div>
          </div>
        )}

        {state && (
          <>
            <SoloRound state={state} busy={busy} onGuess={guess} onSkip={skip} finishedLabel="La partie du jour est terminee." />

            {state.finished && state.track && (
              <section className={`card ${styles.reveal}`}>
                <div className={`${styles.verdict} ${state.solved ? styles.win : styles.lose}`}>
                  {state.solved ? `Trouve en ${state.attempts.length} ecoute${state.attempts.length > 1 ? 's' : ''} !` : 'Pas cette fois…'}
                </div>
                <div className={styles.trackCard}>
                  {state.track.cover && <img src={state.track.cover} alt="" />}
                  <div>
                    <div className={styles.t}>{state.track.title}</div>
                    <div className={styles.a}>{state.track.artist}</div>
                    {state.track.album && <div className={styles.al}>{state.track.album}</div>}
                  </div>
                </div>
                <div className={styles.score}><b>{state.score}</b><span>points</span></div>
                {state.track.link && (
                  <a className="btn sm" href={state.track.link} target="_blank" rel="noreferrer">Ecouter en entier ↗</a>
                )}
                <p className={styles.next}>Un nouveau morceau demain, a minuit. En attendant, la <Link href="/weekly">playlist de la semaine</Link>.</p>
              </section>
            )}

            {state.hubUrl && (
              state.identity ? (
                <div className={`${styles.podiumNote} ${styles.linked}`}>
                  <span className="meta">PODIUM</span>
                  <span>
                    Connecte via Podium en tant que <b>{state.identity.pseudo}</b> : ton score compte pour le defi du jour.
                    {' '}<a href={`${state.hubUrl}/defis`}>Voir le classement</a>
                  </span>
                </div>
              ) : (
                <div className={styles.podiumNote}>
                  <span className="meta">PODIUM</span>
                  <span>
                    Tu joues en anonyme : rien n&apos;est enregistre.
                    {' '}<a href={`${state.hubUrl}/connexion`}>Connecte-toi a Podium</a> pour etre classe avec les autres.
                  </span>
                </div>
              )
            )}

            <SupportNote />
          </>
        )}
      </main>
    </div>
  );
}
