'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { toast } from '@/lib/toast';
import type { DailyAttempt, SearchTrack } from '@/lib/types';

import styles from './SoloRound.module.css';

/** Duree totale d'un extrait joue : la barre est graduee la-dessus. */
const FULL_S = 16;

/** Ce qu'une manche solo a besoin de savoir : la meme forme pour un morceau du jour ou de la playlist. */
export interface RoundState {
  stage: number;
  maxStages: number;
  unlockSeconds: number[];
  unlocked: number;
  preview: string;
  attempts: DailyAttempt[];
  /** La partie entiere est finie : l'extrait se joue en entier, plus de saisie. */
  finished: boolean;
}

interface Props {
  state: RoundState;
  busy: boolean;
  onGuess: (title: string) => Promise<void>;
  onSkip: () => Promise<void>;
  /** Texte sous le bouton lecture quand la partie est finie. */
  finishedLabel: string;
}

async function search(q: string): Promise<SearchTrack[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { tracks: SearchTrack[] };
  return data.tracks.slice(0, 7);
}

/**
 * Une manche : le lecteur borne a la duree debloquee, la progression en six
 * etapes, la saisie avec suggestions, les tentatives. Aucune regle du jeu
 * ici : le serveur decide, ce composant affiche et envoie.
 */
export function SoloRound({ state, busy, onGuess, onSkip, finishedLabel }: Props) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<SearchTrack[]>([]);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  const audio = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<RoundState>(state);
  stateRef.current = state;

  // Le morceau ne joue jamais au-dela de ce qui est debloque : on coupe et on
  // revient au debut. Le cap est relu a chaque tick pour suivre les etapes.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const tick = () => {
      const cap = stateRef.current.finished ? 30 : stateRef.current.unlocked;
      setPos(el.currentTime);
      if (el.currentTime >= cap) { el.pause(); el.currentTime = 0; setPos(0); setPlaying(false); }
    };
    const stop = () => { setPlaying(false); setPos(0); };
    const paused = () => setPlaying(false);
    el.addEventListener('timeupdate', tick);
    el.addEventListener('ended', stop);
    el.addEventListener('pause', paused);
    return () => {
      el.removeEventListener('timeupdate', tick);
      el.removeEventListener('ended', stop);
      el.removeEventListener('pause', paused);
    };
  }, [state.preview]);

  // Nouveau morceau : on repart de zero, saisie comprise.
  useEffect(() => {
    const el = audio.current;
    if (el) { el.pause(); el.currentTime = 0; }
    setPlaying(false);
    setPos(0);
    setText('');
    setHits([]);
    setOpen(false);
  }, [state.preview]);

  function play() {
    const el = audio.current;
    if (!el || !state.preview) return;
    if (playing) { el.pause(); el.currentTime = 0; setPos(0); setPlaying(false); return; }
    el.currentTime = 0;
    el.play().then(() => setPlaying(true)).catch(() => toast('Lecture impossible : reessaie.', 'err'));
  }

  const suggest = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const found = await search(q.trim());
        setHits(found);
        setOpen(true);
      } catch { setHits([]); }
    }, 260);
  }, []);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const title = text.trim();
    if (title.length < 2 || busy || state.finished) return;
    setOpen(false);
    await onGuess(title);
    setText('');
    setHits([]);
  }

  const stageClass = (i: number) => {
    const a = state.attempts[i];
    if (a?.ok) return styles.won;
    if (a?.skipped) return styles.skipped;
    if (a) return styles.done;
    if (i === state.stage && !state.finished) return styles.now;
    return '';
  };

  const nextUnlock = state.unlockSeconds[Math.min(state.stage + 1, state.maxStages - 1)] - state.unlocked;

  return (
    <>
      <audio ref={audio} src={state.preview || undefined} preload="auto" />

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
                ? finishedLabel
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
              onChange={(e) => { setText(e.target.value); suggest(e.target.value); }}
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
            <button className="btn" type="button" onClick={() => { if (!busy) void onSkip(); }} disabled={busy}>
              ⏭ Passer (+{nextUnlock} s)
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
    </>
  );
}
