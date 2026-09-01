'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Brand } from '@/components/Brand';
import { SupportNote } from '@/components/SupportNote';
import { confetti } from '@/lib/confetti';
import { sfx } from '@/lib/sfx';
import { toast } from '@/lib/toast';
import type { DailyState, SearchTrack } from '@/lib/types';

import styles from './daily.module.css';

const FULL_S = 16;

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
  const [text, setText] = useState('');
  const [hits, setHits] = useState<SearchTrack[]>([]);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  const audio = useRef<HTMLAudioElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<DailyState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    api<DailyState>('/api/daily').then(setState).catch((e: Error) => setError(e.message));
  }, []);

  // Le morceau ne joue jamais au-dela de ce qui est debloque : on coupe et on
  // revient au debut. Le cap est relu a chaque tick pour suivre les etapes.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const tick = () => {
      const cap = stateRef.current?.finished ? 30 : (stateRef.current?.unlocked ?? 1);
      setPos(el.currentTime);
      if (el.currentTime >= cap) { el.pause(); el.currentTime = 0; setPos(0); setPlaying(false); }
    };
    const stop = () => { setPlaying(false); setPos(0); };
    el.addEventListener('timeupdate', tick);
    el.addEventListener('ended', stop);
    el.addEventListener('pause', () => setPlaying(false));
    return () => { el.removeEventListener('timeupdate', tick); el.removeEventListener('ended', stop); };
  }, [state?.preview]);

  useEffect(() => {
    if (!state?.finished || !state.solved || !canvas.current) return;
    sfx.unlock();
    sfx.win();
    return confetti(canvas.current);
  }, [state?.finished, state?.solved]);

  function play() {
    const el = audio.current;
    if (!el || !state?.preview) return;
    if (playing) { el.pause(); el.currentTime = 0; setPos(0); setPlaying(false); return; }
    el.currentTime = 0;
    el.play().then(() => setPlaying(true)).catch(() => toast('Lecture impossible : reessaie.', 'err'));
  }

  const search = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api<{ tracks: SearchTrack[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`);
        setHits(data.tracks.slice(0, 7));
        setOpen(true);
      } catch { setHits([]); }
    }, 260);
  }, []);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const title = text.trim();
    if (title.length < 2 || busy || !state || state.finished) return;
    setBusy(true);
    setOpen(false);
    try {
      const next = await api<DailyState>('/api/daily/guess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      setState(next);
      setText('');
      setHits([]);
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

  const stageClass = (i: number) => {
    if (!state) return '';
    const a = state.attempts[i];
    if (a?.ok) return styles.won;
    if (a?.skipped) return styles.skipped;
    if (a) return styles.done;
    if (i === state.stage && !state.finished) return styles.now;
    return '';
  };

  return (
    <div className={styles.app}>
      <canvas ref={canvas} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, width: '100%', height: '100%' }} />
      <audio ref={audio} src={state?.preview || undefined} preload="auto" />

      <div className={styles.brandBar}>
        <Brand />
        <span className={styles.spacer} />
        <Link className="btn sm" href="/">← Accueil</Link>
      </div>

      <main className={styles.main}>
        <header className={styles.head}>
          <span className={styles.date}>{state ? prettyDate(state.dateKey) : 'Musique du jour'}</span>
          <h1>🎵 Musique du jour</h1>
          <p>Un seul morceau, le meme pour tout le monde. Six ecoutes, de plus en plus longues, pour le retrouver.</p>
        </header>

        {error && <p className={styles.error}>{error}</p>}
        {!state && !error && <div className={styles.loading}>Chargement de la musique du jour…</div>}

        {state && (
          <>
            <section className={`card ${styles.player}`}>
              <div className={styles.playRow}>
                <button
                  type="button"
                  className={`${styles.playBtn} ${playing ? styles.playing : ''}`}
                  onClick={play}
                  disabled={!state.preview}
                  aria-label={playing ? 'Arreter' : 'Ecouter'}
                >
                  {playing ? '■' : '▶'}
                </button>
                <div className={styles.playInfo}>
                  <b>{state.finished ? 'Extrait complet' : `${state.unlocked} seconde${state.unlocked > 1 ? 's' : ''} debloquee${state.unlocked > 1 ? 's' : ''}`}</b>
                  <span>
                    {state.finished
                      ? 'La partie du jour est terminee.'
                      : `Etape ${state.stage + 1} sur ${state.maxStages} — une erreur ou un passe debloque la suite.`}
                  </span>
                </div>
              </div>

              <div className={styles.track} aria-hidden="true">
                <i className={styles.unlocked} style={{ width: `${Math.min(100, ((state.finished ? FULL_S : state.unlocked) / FULL_S) * 100)}%` }} />
                {state.unlockSeconds.slice(0, -1).map((s) => (
                  <i key={s} className={styles.tick} style={{ left: `${(s / FULL_S) * 100}%` }} />
                ))}
                <i className={styles.cursor} style={{ left: `${Math.min(100, (pos / FULL_S) * 100)}%` }} />
              </div>
              <div className={styles.ticks}>
                <span>0 s</span><span>{FULL_S} s</span>
              </div>

              <div className={styles.stages} aria-label="Progression">
                {Array.from({ length: state.maxStages }, (_, i) => (
                  <i key={i} className={`${styles.stage} ${stageClass(i)}`} />
                ))}
              </div>
            </section>

            {!state.finished && (
              <form className={styles.form} onSubmit={submit} autoComplete="off">
                <div className={styles.inputRow}>
                  <input
                    className="input"
                    placeholder="Titre du morceau…"
                    value={text}
                    onChange={(e) => { setText(e.target.value); search(e.target.value); }}
                    onFocus={() => hits.length && setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    aria-label="Ta reponse"
                    enterKeyHint="send"
                    maxLength={120}
                  />
                </div>
                {open && hits.length > 0 && (
                  <div className={styles.suggest} role="listbox">
                    {hits.map((h) => (
                      <button
                        key={h.id} type="button" role="option" aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setText(`${h.title} — ${h.artist}`); setOpen(false); }}
                      >
                        {h.cover ? <img src={h.cover} alt="" /> : <span className="avatar">🎵</span>}
                        <span className={styles.st}><b>{h.title}</b><span>{h.artist}</span></span>
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.actions}>
                  <button className="btn" type="button" onClick={skip} disabled={busy}>
                    ⏭ Passer (+{state.unlockSeconds[Math.min(state.stage + 1, state.maxStages - 1)] - state.unlocked} s)
                  </button>
                  <button className="btn primary" type="submit" disabled={busy || text.trim().length < 2}>
                    Valider
                  </button>
                </div>
              </form>
            )}

            <section className={styles.attempts} aria-label="Tentatives">
              {Array.from({ length: state.maxStages }, (_, i) => {
                const a = state.attempts[i];
                const cls = !a ? styles.empty : a.ok ? styles.hit : a.skipped ? styles.skip : styles.miss;
                return (
                  <div key={i} className={`${styles.attempt} ${cls}`}>
                    <span className={styles.n}>{i + 1}</span>
                    <span className={styles.txt}>{!a ? '' : a.skipped ? 'Passe' : a.text}</span>
                    <span aria-hidden="true">{!a ? '' : a.ok ? '✓' : a.skipped ? '⏭' : '✕'}</span>
                  </div>
                );
              })}
            </section>

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
                <p className={styles.next}>Un nouveau morceau demain, a minuit.</p>
              </section>
            )}

            {state.hubUrl && (
              state.identity ? (
                <div className={`${styles.podiumNote} ${styles.linked}`}>
                  <span aria-hidden="true">🏆</span>
                  <span>
                    Connecte via Podium en tant que <b>{state.identity.pseudo}</b> : ton score compte pour le defi du jour.
                    {' '}<a href={`${state.hubUrl}/defis`}>Voir le classement</a>
                  </span>
                </div>
              ) : (
                <div className={styles.podiumNote}>
                  <span aria-hidden="true">🏆</span>
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
