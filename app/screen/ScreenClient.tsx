'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import { Brand } from '@/components/Brand';
import { QrCode } from '@/components/QrCode';
import { confetti } from '@/lib/confetti';
import { answerMarks, asksArtist, hasFoundAll, hasFoundSome } from '@/lib/game';
import { sfx } from '@/lib/sfx';
import { call } from '@/lib/socket';
import { store } from '@/lib/storage';
import { toast } from '@/lib/toast';
import type { GameState, PlayerRow } from '@/lib/types';
import { useAudioDevice } from '@/lib/useAudioDevice';
import { useGameSocket } from '@/lib/useGameSocket';
import { useRoundClock } from '@/lib/useRoundClock';

import styles from './screen.module.css';

const RING = 2 * Math.PI * 47;
const EQ_BARS = 26;
/** Au-dela, la liste de noms cede la place au compteur et aux plus rapides. */
const CROWD_FROM = 12;

interface StreamOptions {
  /** Cache tout ce qui ne sert qu'a l'operateur : volume, plein ecran, badge beta. */
  stream: boolean;
  /** Cote du panneau lateral — l'autre reste libre pour la webcam ou le chat. */
  side: 'left' | 'right';
  /** Fond transparent, pour incruster le jeu sur la scene du streamer dans OBS. */
  transparent: boolean;
}

const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export function ScreenClient() {
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState('');
  const [joined, setJoined] = useState(false);
  const [volume, setVolumeState] = useState(80);
  const [muted, setMuted] = useState(false);
  const codeRef = useRef('');
  const joinedRef = useRef(false);

  const options = useMemo<StreamOptions>(() => ({
    stream: params.get('stream') === '1',
    side: params.get('side') === 'left' ? 'left' : 'right',
    transparent: params.get('bg') === 'transparent',
  }), [params]);

  const player = useAudioDevice((reason) => toast(
    reason === 'autoplay'
      ? 'Le navigateur bloque la lecture — clique sur la page.'
      : "L'extrait n'a pas pu etre charge.",
    'err',
  ));

  useEffect(() => {
    const initial = clean(params.get('code') ?? store.get('refrain.screen.code', ''));
    setCode(initial);
    setDraft(initial);
    codeRef.current = initial;
  }, [params]);

  const { socket, state, setState } = useGameSocket({
    onReady: async (s) => {
      // Reconnexion : on rejoint automatiquement le salon deja valide.
      if (joinedRef.current && codeRef.current) await call(s, 'screen:join', { code: codeRef.current });
    },
    onAudio: player.handleCue,
  });

  async function enter(event: FormEvent) {
    event.preventDefault();
    const value = clean(draft);
    if (value.length !== 4 || !socket) return;

    // Un seul geste utilisateur debloque WebAudio et l'element <audio>.
    sfx.unlock();
    player.unlock();

    const res = await call<{ state: GameState }>(socket, 'screen:join', { code: value });
    if (!res.ok) return toast(res.error, 'err');

    store.set('refrain.screen.code', value);
    // On ne reecrit que le code : les options de stream (stream, side, bg)
    // doivent survivre, sinon la regie perd son mode OBS des la validation.
    const next = new URLSearchParams(window.location.search);
    next.set('code', value);
    window.history.replaceState(null, '', `?${next.toString()}`);
    setCode(value);
    codeRef.current = value;
    joinedRef.current = true;
    setJoined(true);
    setState(res.state);
  }

  // Le curseur s'efface : confortable en projection comme en capture OBS.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onMove = () => {
      document.body.style.cursor = '';
      clearTimeout(timer);
      timer = setTimeout(() => { document.body.style.cursor = 'none'; }, 3000);
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); clearTimeout(timer); document.body.style.cursor = ''; };
  }, []);

  const accent = state?.playlist?.accent;
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent || '#8b5cf6');
  }, [accent]);

  // Fond transparent : OBS compose alors le jeu par-dessus la scene du streamer.
  useEffect(() => {
    document.body.classList.toggle('transparent', options.transparent);
    return () => document.body.classList.remove('transparent');
  }, [options.transparent]);

  // En mode stream les commandes sont cachees : le clavier les remplace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((v) => { player.setVolume(v ? volume / 100 : 0); return !v; });
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setVolumeState((v) => {
          const next = Math.max(0, Math.min(100, v + (e.key === 'ArrowUp' ? 5 : -5)));
          player.setVolume(next / 100);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, volume]);

  // Le serveur demande le chargement d'une playlist YouTube par evenement.
  useEffect(() => player.attach(socket), [socket, player]);

  return (
    <>
      <audio ref={player.audio} preload="auto" />
      <div ref={player.ytContainer} className={styles.ytStage} aria-hidden="true" />

      {joined && state ? (
        <Stage state={state} code={code} options={options} />
      ) : (
        <div className={styles.screen} />
      )}

      <div className={styles.corner} hidden={options.stream}>
        <span className="pill">{volume === 0 ? '🔇 son coupe' : '🔊 son actif'}</span>
        <input
          type="range" min={0} max={100} value={volume} aria-label="Volume"
          onChange={(e) => { const v = Number(e.target.value); setVolumeState(v); player.setVolume(v / 100); }}
        />
        <button
          className="btn sm" type="button"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
        >
          ⛶ Plein ecran
        </button>
      </div>

      {!joined && (
        <div className={styles.gate}>
          <div>
            <h1>{code ? `Partie ${code}` : 'Ecran de diffusion'}</h1>
            <p>{code ? 'Un clic pour autoriser le son et lancer l\'affichage.' : 'Saisis le code de la partie affiche dans la regie.'}</p>
            <form onSubmit={enter}>
              <input
                className={`input ${styles.gateCode}`} data-testid="gate-code" value={draft} maxLength={4} placeholder="CODE"
                autoComplete="off" autoCapitalize="characters" spellCheck={false}
                onChange={(e) => setDraft(clean(e.target.value))}
              />
              <button className="btn primary lg" type="submit" data-testid="gate-submit" disabled={!socket}>
                {code ? '🔊 Activer le son et demarrer' : 'Connecter l\'ecran'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Stage({ state, code, options }: { state: GameState; code: string; options: StreamOptions }) {
  const { ratio, seconds, countdown, buzzLock, answerLeft } = useRoundClock(state);
  const inGame = ['countdown', 'playing', 'buzzed', 'paused', 'reveal', 'scores'].includes(state.phase);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className={`${styles.screen} ${options.stream ? styles.stream : ''}`}>
      <header className={styles.head}>
        <div className={styles.pl}>
          <span className={styles.em}>{state.playlist?.emoji ?? '🎧'}</span>
          <span>{state.playlist?.title ?? 'Refrain'}</span>
        </div>
        <div className={styles.mid}>
          {inGame && state.round && (
            <>
              <span className="pill">Manche <b>{state.round.index + 1}</b> / <b>{state.round.total}</b></span>
              <Dots index={state.round.index} total={state.round.total} />
            </>
          )}
        </div>
        {!options.stream && <span className="brand-beta">beta</span>}
        <span className="pill"><span className="dot" /> <span className={styles.codeMini}>{code}</span></span>
      </header>

      <div className={styles.stage}>
        {state.phase === 'lobby' && <Lobby state={state} code={code} />}
        {state.phase === 'countdown' && <Countdown value={countdown} round={state.round!.index + 1} />}
        {state.phase === 'playing' && <Playing state={state} ratio={ratio} seconds={seconds} buzzLock={buzzLock} side={options.side} />}
        {state.phase === 'buzzed' && <Buzzed state={state} answerLeft={answerLeft} />}
        {state.phase === 'paused' && <Paused />}
        {state.phase === 'reveal' && <Reveal state={state} />}
        {state.phase === 'scores' && <Scores state={state} />}
        {state.phase === 'ended' && <Ended state={state} />}
      </div>

      {/* Toujours la pendant la partie : un viewer qui arrive doit pouvoir rejoindre. */}
      {state.phase !== 'lobby' && origin && (
        <JoinCard code={code} origin={origin} side={options.side === 'right' ? 'left' : 'right'} />
      )}
    </div>
  );
}

function JoinCard({ code, origin, side }: { code: string; origin: string; side: 'left' | 'right' }) {
  const host = origin.replace(/^https?:\/\//, '');
  return (
    <div className={`${styles.joinCard} ${side === 'right' ? styles.right : ''}`} data-testid="join-card">
      <QrCode className={styles.qr} text={`${origin}/j/${code}`} />
      <div>
        <div className={styles.lbl}>Rejoins la partie</div>
        <div className={styles.code}>{code}</div>
        <div className={styles.url}>{host}<b>/j/{code}</b></div>
      </div>
    </div>
  );
}

function Paused() {
  return (
    <section className={`${styles.scene} ${styles.pausedScene}`} data-testid="scene-paused">
      <div className={styles.pauseBars}><i /><i /></div>
      <div className={styles.big}>PAUSE</div>
      <div className={styles.sub}>On reprend dans un instant — le chrono est fige.</div>
    </section>
  );
}

function Dots({ index, total }: { index: number; total: number }) {
  return (
    <div className={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < index ? styles.done : i === index ? styles.now : ''} />
      ))}
    </div>
  );
}

/* ---------------- Salon ---------------- */

function Lobby({ state, code }: { state: GameState; code: string }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const host = origin.replace(/^https?:\/\//, '');
  const count = state.counts.players;
  const hidden = Math.max(0, count - state.leaderboard.length);

  return (
    <section className={`${styles.scene} ${styles.lobby}`} data-testid="scene-lobby">
      <div className={styles.lobbyBrand}><Brand href={null} /></div>
      <div className={styles.joinRow}>
        <div className={styles.codeBox}>
          <span className={styles.lbl}>Code de la partie</span>
          <div className={styles.codeBig}>{code}</div>
          <div className={styles.url}>Rejoins sur <b>{host}/j/{code}</b></div>
        </div>
        {origin && <QrCode className={styles.qr} text={`${origin}/j/${code}`} />}
      </div>

      <div className={styles.lobbyPlayers}>
        {state.leaderboard.map((p) => (
          <span key={p.id} className={`${styles.who} ${p.connected ? '' : styles.off}`}>{p.avatar} {p.name}</span>
        ))}
        {hidden > 0 && <span className={styles.who}>+ {hidden}</span>}
      </div>

      <div className={styles.hint}>
        {count === 0
          ? 'En attente des joueurs…'
          : state.playlist
            ? `${count} joueur${count > 1 ? 's' : ''} • ${state.playlist.emoji} ${state.playlist.title} • ${state.settings.rounds} manches`
            : `${count} joueur${count > 1 ? 's' : ''} • l'animateur choisit la liste`}
      </div>
    </section>
  );
}

/* ---------------- Compte a rebours ---------------- */

function Countdown({ value, round }: { value: number | null; round: number }) {
  const label = value === null ? '' : value > 0 ? String(value) : 'GO';
  useEffect(() => {
    if (!label) return;
    sfx.unlock();
    if (label === 'GO') sfx.go(); else sfx.tick();
  }, [label]);

  return (
    <section className={`${styles.scene} ${styles.countdown}`}>
      <div className={styles.n} key={label}>{label}</div>
      <div className={styles.sub}>Manche {round}</div>
    </section>
  );
}

/* ---------------- Ecoute ---------------- */

function Playing({ state, ratio, seconds, buzzLock, side }: {
  state: GameState; ratio: number; seconds: number; buzzLock: number; side: 'left' | 'right';
}) {
  const crowd = state.counts.players > CROWD_FROM;
  const bars = useMemo(
    () => Array.from({ length: EQ_BARS }, (_, i) => ({
      delay: `${-((i * 0.13) % 1)}s`,
      duration: `${0.7 + (i % 5) * 0.13}s`,
    })),
    [],
  );

  const ask = asksArtist(state);

  useEffect(() => {
    if (seconds <= 5 && seconds > 0) { sfx.unlock(); sfx.tick(); }
  }, [seconds]);

  return (
    <section className={`${styles.scene} ${styles.playing} ${side === 'left' ? styles.sideLeft : ''}`}>
      <div className={styles.playMain}>
        <div className={styles.ringWrap}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <circle className={styles.ringBg} cx="50" cy="50" r="47" />
            <circle
              className={styles.ringFg} cx="50" cy="50" r="47"
              strokeDasharray={RING} strokeDashoffset={RING * (1 - ratio)}
            />
          </svg>
          <div className={styles.vinyl}><span className={styles.q}>?</span></div>
          <div className={`${styles.secLeft} tnum ${seconds <= 5 ? styles.warn : ''}`}>{seconds}</div>
        </div>
        <div className={styles.eq}>
          {bars.map((b, i) => (
            <i key={i} style={{ animationDelay: b.delay, animationDuration: b.duration }} />
          ))}
        </div>

        {state.settings.mode === 'buzzer' && buzzLock > 0 && (
          <div className={styles.buzzGate}>🔒 Buzzer dans <b>{buzzLock}</b></div>
        )}
      </div>

      <aside className={styles.side}>
        {crowd && state.settings.mode !== 'buzzer' ? (
          <Crowd state={state} />
        ) : (
        <>
        <h3>{state.settings.mode === 'buzzer' ? 'Au buzzer' : 'Qui a trouve ?'}</h3>
        <div className={styles.list}>
          {state.leaderboard.map((p) => {
            const done = hasFoundAll(p.answered, ask);
            const part = hasFoundSome(p.answered);
            const marks = state.settings.mode === 'buzzer'
              ? (state.round?.lockedOut.includes(p.id) ? '⛔' : '')
              : answerMarks(p.answered, ask).replace(/·/g, '');
            return (
              <div key={p.id} className={`${styles.prow} ${done ? styles.done : part ? styles.part : ''} ${p.connected ? '' : styles.off}`}>
                <span className={styles.av}>{p.avatar}</span>
                <span className={styles.nm}>{p.name}</span>
                <span className={styles.marks}>{marks}</span>
                <span className={styles.sc}>{p.score}</span>
              </div>
            );
          })}
        </div>
        </>
        )}
      </aside>
    </section>
  );
}

/** Grande audience : le compteur et les plus rapides, plutot qu'une liste. */
function Crowd({ state }: { state: GameState }) {
  const { done, connected } = state.counts;
  const pct = connected ? Math.round((done / connected) * 100) : 0;
  const fastest = state.round?.fastest ?? [];
  return (
    <div className={styles.crowd} data-testid="crowd">
      <h3>Qui a trouve ?</h3>
      <div className={styles.crowdCount}>
        <b>{done.toLocaleString('fr-FR')}</b>
        <span>/ {connected.toLocaleString('fr-FR')} joueurs</span>
      </div>
      <div className={styles.crowdBar}><i style={{ width: `${pct}%` }} /></div>
      {fastest.length > 0 && (
        <div className={styles.fastest}>
          <h4>Les plus rapides</h4>
          {fastest.map((f, i) => (
            <div key={f.playerId} className={styles.frow} style={{ animationDelay: `${i * 0.06}s` }}>
              <span className={styles.rk}>{i + 1}</span>
              <span className={styles.av}>{f.avatar}</span>
              <span className={styles.nm}>{f.name}</span>
              <span className={styles.ms}>{fmtSeconds(f.ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Buzz ---------------- */

function Buzzed({ state, answerLeft }: { state: GameState; answerLeft: number }) {
  const buzz = state.round?.buzz ?? null;
  useEffect(() => { sfx.unlock(); sfx.buzz(); }, []);
  useEffect(() => {
    if (answerLeft > 0 && answerLeft <= 3) { sfx.unlock(); sfx.tick(); }
  }, [answerLeft]);

  return (
    <section className={`${styles.scene} ${styles.buzzed}`}>
      <div className={styles.buzzAv}>{buzz?.avatar ?? '🔔'}</div>
      <div className={styles.buzzName}>{buzz?.name ?? '—'}</div>
      <div className={styles.buzzSub}>a buzze — la reponse, vite !</div>
      {state.round?.answerDeadline && (
        <div className={`${styles.answerClock} ${answerLeft <= 3 ? styles.urgent : ''}`}>
          <b>{answerLeft}</b> <span>seconde{answerLeft > 1 ? 's' : ''} pour repondre</span>
        </div>
      )}
    </section>
  );
}

/* ---------------- Revelation ---------------- */

function Reveal({ state }: { state: GameState }) {
  const track = state.round!.track!;
  const winners = state.round!.topGains ?? [];
  const fastest = state.round!.fastest?.[0];

  useEffect(() => {
    sfx.unlock();
    if (winners.length) sfx.reveal(); else sfx.bad();
  }, [track.id, winners.length]);

  return (
    <section className={`${styles.scene} ${styles.reveal}`}>
      <div className={styles.revealMain}>
        {track.cover && (
          <img
            className={styles.coverLg} src={track.cover} alt="" key={track.id}
            onError={(e) => {
              const img = e.currentTarget;
              if (track.coverFallback && img.src !== track.coverFallback) img.src = track.coverFallback;
              else img.style.display = 'none';
            }}
          />
        )}
        <div className={`${styles.revealText} grow`}>
          <div className={styles.kicker}>La reponse etait</div>
          <div className={styles.revealTitle}>{track.title}</div>
          {track.artist && <div className={styles.revealArtist}>{track.artist}</div>}
          {track.album && <div className={styles.revealAlbum}>{track.album}</div>}
          {fastest && (
            <div className={styles.fastestBadge}>
              ⚡ Le plus rapide : {fastest.avatar} <b>{fastest.name}</b> en {fmtSeconds(fastest.ms)}
            </div>
          )}
          <div className={styles.scorers}>
            {winners.length ? winners.slice(0, 10).map((r, i) => (
              <span key={r.playerId} className={styles.s} style={{ animationDelay: `${i * 0.07}s` }}>
                {r.avatar} {r.name}<span className={styles.pts}> +{r.gained}</span>
              </span>
            )) : <span className={styles.none}>Personne n&apos;a trouve… 😬</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Classement ---------------- */

function Scores({ state }: { state: GameState }) {
  const rows = state.leaderboard.slice(0, 10);
  const max = Math.max(1, ...rows.map((p) => p.score));
  return (
    <section className={`${styles.scene} ${styles.scores}`}>
      <h2>Classement</h2>
      <div className={styles.bars}>
        {rows.map((p, i) => (
          <div key={p.id} className={`${styles.bar} ${i === 0 ? styles.top1 : ''}`}>
            <span className={styles.pos}>{i + 1}</span>
            <span className={styles.av}>{p.avatar}</span>
            <span className={styles.nm}>{p.name}</span>
            <span className={styles.track}>
              <span className={styles.fill} style={{ width: `${Math.round((p.score / max) * 100)}%` }} />
            </span>
            <span className={styles.sc}>{p.score}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Podium ---------------- */

function Ended({ state }: { state: GameState }) {
  const board: PlayerRow[] = state.podium ?? state.leaderboard;
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    sfx.unlock();
    sfx.win();
    if (!canvas.current) return;
    return confetti(canvas.current, { count: 220, duration: 8000 });
  }, []);

  // 2e, 1er, 3e : l'ordre visuel d'un vrai podium.
  const order = [1, 0, 2].filter((i) => board[i]);
  const steps = [styles.p1, styles.p2, styles.p3];

  return (
    <section className={`${styles.scene} ${styles.ended}`}>
      <canvas ref={canvas} className={styles.confetti} />
      <h2>🏆 Resultats</h2>
      <div className={styles.podium}>
        {order.map((i) => (
          <div key={board[i].id} className={`${styles.step} ${steps[i]}`} style={{ animationDelay: `${i * 0.18}s` }}>
            <span className={styles.av}>{board[i].avatar}</span>
            <span className={styles.nm}>{board[i].name}</span>
            <div className={styles.block}><span className={styles.pts}>{board[i].score}</span></div>
          </div>
        ))}
      </div>
      <div className={styles.rest}>
        {board.slice(3).map((p, i) => (
          <span key={p.id} className={styles.r}>{i + 4}. {p.avatar} {p.name} — {p.score}</span>
        ))}
      </div>
    </section>
  );
}
