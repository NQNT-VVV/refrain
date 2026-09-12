'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Brand } from '@/components/Brand';
import { SoloRound } from '@/components/SoloRound';
import { SupportNote } from '@/components/SupportNote';
import { confetti } from '@/lib/confetti';
import { sfx } from '@/lib/sfx';
import { toast } from '@/lib/toast';
import type { RevealedTrack, WeeklyState } from '@/lib/types';

import daily from '../daily/daily.module.css';
import styles from './weekly.module.css';

const MAX_PER_TRACK = 60;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Le serveur ne repond pas.');
  return data as T;
}

/** « Semaine 37 · 2026 » depuis la cle AAAA-Wss. */
function prettyWeek(key: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  return m ? `Semaine ${Number(m[2])} · ${m[1]}` : key;
}

function Revealed({ track, highlight = false }: { track: RevealedTrack; highlight?: boolean }) {
  return (
    <div className={`${styles.revealed} ${track.solved ? styles.solved : styles.missed} ${highlight ? styles.fresh : ''}`}>
      <span className={styles.idx}>{track.index + 1}</span>
      {track.cover ? <img src={track.cover} alt="" /> : <span className={styles.noCover} aria-hidden="true" />}
      <span className={styles.meta}>
        <b>{track.title}</b>
        <span>{track.artist}</span>
      </span>
      <span className={styles.pts}>
        <b>{track.points}</b>
        <small>{track.solved ? `en ${track.attempts} ecoute${track.attempts > 1 ? 's' : ''}` : 'rate'}</small>
      </span>
    </div>
  );
}

export function WeeklyClient() {
  const [state, setState] = useState<WeeklyState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastRevealed, setLastRevealed] = useState<RevealedTrack | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api<WeeklyState>('/api/weekly').then(setState).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!state?.finished || !canvas.current) return;
    if (state.revealed.filter((r) => r.solved).length === 0) return;
    sfx.unlock();
    sfx.win();
    return confetti(canvas.current);
  }, [state?.finished, state?.revealed]);

  function apply(next: WeeklyState) {
    setState(next);
    if (next.roundEnded) {
      const done = next.revealed[next.revealed.length - 1] || null;
      setLastRevealed(next.finished ? null : done);
      if (done?.solved) { sfx.unlock(); sfx.good(); }
      else if (done && !next.finished) toast(`Rate. C'etait « ${done.title} ».`, 'err');
    } else if (next.result === 'miss') {
      toast(`Non… ${next.unlocked} s debloquees.`, 'err');
    } else if (next.result === 'skipped') {
      toast(`Passe. ${next.unlocked} s debloquees.`);
    }
  }

  async function guess(title: string) {
    if (busy || !state || state.finished) return;
    setBusy(true);
    try {
      apply(await api<WeeklyState>('/api/weekly/guess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      }));
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
      apply(await api<WeeklyState>('/api/weekly/skip', { method: 'POST' }));
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const solvedCount = state ? state.revealed.filter((r) => r.solved).length : 0;
  const maxScore = state ? state.tracksTotal * MAX_PER_TRACK : 0;

  return (
    <div className={daily.app}>
      <canvas ref={canvas} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, width: '100%', height: '100%' }} />

      <div className={daily.brandBar}>
        <Brand />
        <span className={daily.spacer} />
        <Link className="btn sm" href="/daily">MUSIQUE DU JOUR</Link>
        <Link className="btn sm" href="/">← Accueil</Link>
      </div>

      <main className={daily.main}>
        <header className={daily.head}>
          <span className={daily.date}>{state ? prettyWeek(state.weekKey) : 'Playlist de la semaine'}</span>
          <h1>PLAYLIST DE LA SEMAINE</h1>
          <p>Cinq morceaux, les memes pour tout le monde, six ecoutes chacun. Une seule tentative par semaine : le score s&apos;additionne.</p>
        </header>

        {error && <p className={daily.error}>{error}</p>}
        {!state && !error && <div className={daily.loading}>Chargement de la playlist…</div>}

        {state && (
          <>
            <div className={styles.progress} aria-label="Progression dans la playlist">
              <div className={styles.dots}>
                {Array.from({ length: state.tracksTotal }, (_, i) => {
                  const r = state.revealed.find((x) => x.index === i);
                  const cls = r ? (r.solved ? styles.dotSolved : styles.dotMissed) : (i === state.trackIndex && !state.finished ? styles.dotNow : '');
                  return <i key={i} className={`${styles.dot} ${cls}`} />;
                })}
              </div>
              <span className={styles.counter}>
                {state.finished ? `${state.tracksTotal} / ${state.tracksTotal}` : `Morceau ${state.trackIndex + 1} / ${state.tracksTotal}`}
              </span>
              <span className={styles.total}><b>{state.totalScore}</b> / {maxScore} pts</span>
            </div>

            {!state.finished && lastRevealed && (
              <section className={`card ${styles.justPlayed}`}>
                <span className={styles.justLabel}>{lastRevealed.solved ? 'Trouve !' : 'C’etait…'}</span>
                <Revealed track={lastRevealed} highlight />
              </section>
            )}

            {!state.finished && (
              <SoloRound state={state} busy={busy} onGuess={guess} onSkip={skip} finishedLabel="" />
            )}

            {state.finished && (
              <section className={`card ${daily.reveal}`}>
                <div className={`${daily.verdict} ${solvedCount >= 3 ? daily.win : daily.lose}`}>
                  {solvedCount === state.tracksTotal ? 'Sans faute !' : solvedCount === 0 ? 'Semaine difficile…' : `${solvedCount} sur ${state.tracksTotal} trouves`}
                </div>
                <div className={daily.score}><b>{state.totalScore}</b><span>/ {maxScore} points</span></div>
                <div className={styles.list}>
                  {state.revealed.map((r) => <Revealed key={r.index} track={r} />)}
                </div>
                <p className={daily.next}>Une nouvelle playlist lundi, a minuit. D&apos;ici la, la <Link href="/daily">musique du jour</Link> change chaque matin.</p>
              </section>
            )}

            {!state.finished && state.revealed.length > 0 && (
              <section className={styles.list} aria-label="Morceaux deja joues">
                <span className={styles.listTitle}>Deja joues</span>
                {[...state.revealed].reverse().map((r) => <Revealed key={r.index} track={r} />)}
              </section>
            )}

            {state.hubUrl && (
              state.identity ? (
                <div className={`${daily.podiumNote} ${daily.linked}`}>
                  <span className="meta">PODIUM</span>
                  <span>
                    Connecte via Podium en tant que <b>{state.identity.pseudo}</b> : ton total compte pour le defi de la semaine.
                    {' '}<a href={`${state.hubUrl}/defis`}>Voir le classement</a>
                  </span>
                </div>
              ) : (
                <div className={daily.podiumNote}>
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
