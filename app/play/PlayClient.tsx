'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';

import { confetti } from '@/lib/confetti';
import { answerMarks, findPlayer, hasFoundAll, hasFoundSome, ordinal } from '@/lib/game';
import { sfx } from '@/lib/sfx';
import { call } from '@/lib/socket';
import { copyToClipboard, store } from '@/lib/storage';
import { toast } from '@/lib/toast';
import type { GameState, PlayerRow } from '@/lib/types';
import { useAudioPlayer } from '@/lib/useAudioPlayer';
import { useGameSocket } from '@/lib/useGameSocket';
import { useRoundClock } from '@/lib/useRoundClock';

import styles from './play.module.css';

interface Session { playerId: string; token: string }
interface Me { playerId: string; name: string; avatar: string }

const MEDALS = ['🥇', '🥈', '🥉'];

export function PlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

  const [me, setMe] = useState<Me | null>(null);
  const [pseudo, setPseudo] = useState('');
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const player = useAudioPlayer();
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  useEffect(() => {
    if (!code) router.replace('/');
  }, [code, router]);

  const sessionKey = `refrain.player.${code}`;

  const adopt = useCallback((res: { playerId: string; token?: string; name: string; avatar: string; state: GameState }) => {
    const token = res.token ?? store.get<Session | null>(sessionKey, null)?.token ?? '';
    store.set(sessionKey, { playerId: res.playerId, token });
    setMe({ playerId: res.playerId, name: res.name, avatar: res.avatar });
  }, [sessionKey]);

  const { socket, state, setState, connected } = useGameSocket({
    onReady: async (s) => {
      const saved = store.get<Session | null>(sessionKey, null);
      if (saved?.token) {
        const res = await call<{ playerId: string; name: string; avatar: string; state: GameState }>(
          s, 'player:resume', { code, ...saved },
        );
        if (res.ok) {
          adopt(res);
          setState(res.state);
          return;
        }
        store.del(sessionKey);
      }
      // Mise a jour fonctionnelle : ne jamais ecraser ce que le joueur tape
      // pendant que la synchronisation d'horloge est encore en cours.
      if (!meRef.current) setPseudo((current) => current || store.get('refrain.lastName', ''));
    },
    // N'arrive que si l'animateur a active la diffusion sur les telephones.
    onAudio: (cue) => player.handleCue(cue),
    onKicked: () => {
      store.del(sessionKey);
      toast('Tu as ete retire de la partie.', 'err');
      setTimeout(() => router.replace('/'), 1600);
    },
  });

  const mine = findPlayer(state, me?.playerId ?? null);
  const rank = state && me ? state.players.findIndex((p) => p.id === me.playerId) + 1 : 0;

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!socket) return;
    // Ce clic est le seul geste utilisateur garanti : on en profite pour
    // debloquer la lecture au cas ou l'animateur diffuse sur les telephones.
    sfx.unlock();
    player.unlock();
    const name = pseudo.trim();
    if (!name) return;
    setJoining(true);
    const res = await call<{ playerId: string; token: string; name: string; avatar: string; state: GameState }>(
      socket, 'player:join', { code, name },
    );
    setJoining(false);
    if (!res.ok) return toast(res.error, 'err');
    store.set('refrain.lastName', name);
    setMuted(store.get('refrain.player.muted', false));
    adopt(res);
    setState(res.state);
  }

  /* ---------------- Ecran de connexion ---------------- */

  if (!me || !state) {
    return (
      <div className={styles.app}>
        <audio ref={player.audio} preload="auto" />
        <main className={styles.main}>
          <form className={styles.hello} onSubmit={join}>
            <div className={styles.logo}>🎧</div>
            <div style={{ textAlign: 'center' }}>
              <h1 className={styles.big}>Rejoindre la partie</h1>
              <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
                Partie <b className="code-chip">{code || '····'}</b>
              </p>
            </div>
            <div className="field">
              <label htmlFor="pseudo">Ton pseudo</label>
              <input
                className="input" id="pseudo" data-testid="pseudo" maxLength={18} placeholder="Ex. Camille"
                autoComplete="nickname" enterKeyHint="go"
                value={pseudo} onChange={(e) => setPseudo(e.target.value)}
              />
            </div>
            <button className="btn primary lg block" type="submit" data-testid="join" disabled={!connected || joining}>
              {connected ? 'Entrer dans la partie' : 'Connexion…'}
            </button>
            <p className={styles.hint} style={{ textAlign: 'center' }}>
              Le son sort sur l&apos;ecran de l&apos;animateur — garde ton telephone pour repondre.
            </p>
          </form>
        </main>
      </div>
    );
  }

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    store.set('refrain.player.muted', next);
    player.setVolume(next ? 0 : 0.9);
    if (!next) player.unlock();
  }

  return (
    <>
      <audio ref={player.audio} preload="auto" />
      <PlayScreen
        code={code} me={me} mine={mine} rank={rank}
        state={state} socket={socket} connected={connected}
        muted={muted} onToggleSound={toggleSound}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Partie en cours                                                    */
/* ------------------------------------------------------------------ */

function PlayScreen({ code, me, mine, rank, state, socket, connected, muted, onToggleSound }: {
  code: string; me: Me; mine: PlayerRow | null; rank: number;
  state: GameState; socket: Socket | null; connected: boolean;
  muted: boolean; onToggleSound: () => void;
}) {
  const { ratio, countdown, buzzLock, answerLeft } = useRoundClock(state);
  const showTimer = state.phase === 'playing';

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.line}>
          <div className={styles.me}>
            <span className="avatar">{mine?.avatar ?? me.avatar}</span>
            <div>
              <div className={styles.name}>{mine?.name ?? me.name}</div>
              <div className={`${styles.rank} faint`}>
                {state.phase === 'lobby' ? 'Pret' : `${ordinal(rank)} sur ${state.players.length}`}
              </div>
            </div>
          </div>
          {state.settings.playerAudio && (
            <button
              type="button" className={`${styles.soundToggle} ${muted ? styles.off : ''}`}
              onClick={onToggleSound} aria-label={muted ? 'Reactiver le son' : 'Couper le son'}
              title={muted ? 'Reactiver le son' : 'Couper le son'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          )}
          <div className={styles.scoreChip}>
            <span className={`${styles.val} tnum`}>{mine?.score ?? 0}</span>
            <span className={styles.unit}>pts</span>
          </div>
        </div>
        {showTimer && (
          <div className={`${styles.timer} ${ratio < 0.28 ? styles.warn : ''}`}>
            <i style={{ transform: `scaleX(${ratio})` }} />
          </div>
        )}
      </header>

      <main className={styles.main}>
        {state.phase === 'lobby' && <Lobby state={state} me={me} />}
        {state.phase === 'countdown' && <Countdown round={state.round!.index + 1} value={countdown} />}
        {state.phase === 'playing' && state.settings.mode === 'input' && (
          <AnswerForm key={state.round!.index} state={state} me={me} mine={mine} socket={socket} />
        )}
        {(state.phase === 'playing' || state.phase === 'buzzed') && state.settings.mode === 'buzzer' && (
          <Buzzer state={state} me={me} socket={socket} buzzLock={buzzLock} answerLeft={answerLeft} />
        )}
        {state.phase === 'reveal' && <Reveal state={state} me={me} />}
        {state.phase === 'scores' && <Scores state={state} me={me} />}
        {state.phase === 'ended' && <Ending state={state} me={me} code={code} />}
      </main>

      {!connected && (
        <div className={styles.connLost}>
          <div>
            <div style={{ fontSize: 44 }}>📡</div>
            <h2 className={styles.big} style={{ margin: '10px 0 6px' }}>Connexion perdue</h2>
            <p className="muted">On tente de te reconnecter…</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Salon ---------------- */

function Lobby({ state, me }: { state: GameState; me: Me }) {
  return (
    <section className={styles.panel} data-testid="scene-lobby">
      <div className={styles.waiting}>
        <div className={styles.pulseRing}>🎶</div>
        <div>
          <h2 className={styles.big}>Tu es dans la place</h2>
          <p className="muted" style={{ marginTop: 6 }}>L&apos;animateur lance la partie quand tout le monde est la.</p>
        </div>
        <div className={styles.roster}>
          {state.players.map((p) => (
            <span key={p.id} className={`${styles.who} ${p.connected ? '' : styles.off} ${p.id === me.playerId ? styles.self : ''}`}>
              {p.avatar} {p.name}
            </span>
          ))}
        </div>
        <p className={styles.hint}>
          {state.playlist ? `Liste choisie : ${state.playlist.emoji} ${state.playlist.title}` : 'L\'animateur choisit la liste…'}
        </p>
      </div>
    </section>
  );
}

/* ---------------- Compte a rebours ---------------- */

function Countdown({ round, value }: { round: number; value: number | null }) {
  const label = value === null ? '' : value > 0 ? String(value) : 'GO';
  useEffect(() => {
    if (!label) return;
    sfx.unlock();
    if (label === 'GO') sfx.go();
    else sfx.tick();
  }, [label]);

  return (
    <section className={styles.panel}>
      <div className={styles.countdown}>
        <div className={styles.n} key={label}>{label}</div>
      </div>
      <p className="muted" style={{ textAlign: 'center' }}>Manche <b>{round}</b> — prepare-toi</p>
    </section>
  );
}

/* ---------------- Reponse libre ---------------- */

function AnswerForm({ state, me, mine, socket }: {
  state: GameState; me: Me; mine: PlayerRow | null; socket: Socket | null;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState('Tu peux corriger et revalider autant que tu veux : plus tu trouves tot, plus tu marques.');

  const badge = mine?.answered ?? null;
  const titleOk = Boolean(badge?.titleOk);
  const artistOk = Boolean(badge?.artistOk);
  const askArtist = state.settings.guessArtist;
  const allFound = hasFoundAll(badge, askArtist);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!socket || state.phase !== 'playing') return;
    sfx.unlock();
    if (!title.trim() && !artist.trim()) return;

    const before = { title: titleOk, artist: artistOk };
    setSending(true);
    const res = await call<{ titleOk: boolean; artistOk: boolean }>(socket, 'player:answer', {
      title: title.trim(), artist: artist.trim(),
    });
    setSending(false);
    if (!res.ok) return toast(res.error, 'err');

    const gotTitle = res.titleOk && !before.title;
    const gotArtist = res.artistOk && !before.artist;
    if (gotTitle && gotArtist) { sfx.great(); toast('🎯 Titre + artiste !', 'ok'); navigator.vibrate?.([20, 50, 20, 50, 30]); }
    else if (gotTitle) { sfx.good(); toast('✅ Titre trouve !', 'ok'); navigator.vibrate?.(45); }
    else if (gotArtist) { sfx.good(); toast('✅ Artiste trouve !', 'ok'); navigator.vibrate?.(45); }
    else { sfx.bad(); setHint('Pas encore… reessaie, le chrono tourne.'); navigator.vibrate?.(90); }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.answerHead}>
        <div className={styles.wave}><i /><i /><i /><i /><i /></div>
        <div className="grow">
          <div className={styles.stageTitle}>Manche {state.round!.index + 1}</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>C&apos;est quoi ce morceau ?</div>
        </div>
      </div>

      <form className="col" onSubmit={submit} style={{ gap: 12 }}>
        <div className={`field ${styles.guess} ${titleOk ? styles.found : ''}`}>
          <label htmlFor="fTitle">Titre</label>
          <input
            className="input" id="fTitle" data-testid="answer-title" placeholder="Le titre du morceau" readOnly={titleOk}
            autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="send"
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
          <span className={styles.flag}>✅</span>
        </div>

        {askArtist && (
          <div className={`field ${styles.guess} ${artistOk ? styles.found : ''}`}>
            <label htmlFor="fArtist">Artiste</label>
            <input
              className="input" id="fArtist" data-testid="answer-artist" placeholder="Qui chante ?" readOnly={artistOk}
              autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="send"
              value={artist} onChange={(e) => setArtist(e.target.value)}
            />
            <span className={styles.flag}>✅</span>
          </div>
        )}

        <button className="btn primary lg block" type="submit" data-testid="answer-submit" disabled={allFound || sending}>
          Valider ma reponse
        </button>
        <p className={styles.hint}>{allFound ? '🎯 Tout trouve ! Repose-toi une seconde.' : hint}</p>
      </form>

      <LiveMini state={state} me={me} />
    </section>
  );
}

function LiveMini({ state, me }: { state: GameState; me: Me }) {
  const rows = state.players.filter((p) => p.connected).slice(0, 6);
  return (
    <div className={styles.liveMini}>
      <div className={styles.head}>Qui a deja trouve ?</div>
      {rows.map((p) => {
        const done = hasFoundAll(p.answered, state.settings.guessArtist);
        const part = hasFoundSome(p.answered);
        return (
          <div key={p.id} className={`${styles.lm} ${done ? styles.done : part ? styles.part : ''} ${p.id === me.playerId ? styles.self : ''}`}>
            <span>{p.avatar}</span>
            <span className={`${styles.nm} ellipsis`}>{p.name}</span>
            <span className={styles.mk}>{answerMarks(p.answered, state.settings.guessArtist)}</span>
            <span className={styles.sc}>{p.score}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Buzzer ---------------- */

function Buzzer({ state, me, socket, buzzLock, answerLeft }: {
  state: GameState; me: Me; socket: Socket | null; buzzLock: number; answerLeft: number;
}) {
  const [pressed, setPressed] = useState(false);
  const buzz = state.round?.buzz ?? null;
  const lockedOut = state.round?.lockedOut.includes(me.playerId) ?? false;
  const isMine = buzz?.playerId === me.playerId;
  const buzzed = state.phase === 'buzzed';

  // Le buzzer ne s'ouvre qu'apres quelques secondes d'ecoute : personne ne
  // gagne une manche au reflexe sur le premier accord.
  const arming = !buzzed && !lockedOut && buzzLock > 0;

  useEffect(() => { setPressed(false); }, [state.round?.index, buzzed]);

  async function press() {
    if (!socket) return;
    sfx.unlock();
    setPressed(true);
    const res = await call<{ accepted: boolean; reason: string | null }>(socket, 'player:buzz');
    if (res.ok && res.accepted) {
      sfx.buzz();
      navigator.vibrate?.([30, 40, 60]);
      return;
    }
    setPressed(false);
    if (!res.ok) return;
    if (res.reason === 'too_early') {
      sfx.bad();
      navigator.vibrate?.(120);
      toast('Trop tot ! Ecoute encore un peu.', 'err');
    } else if (res.reason === 'taken') {
      toast('Trop tard, quelqu\'un a ete plus rapide.', 'err');
    }
  }

  const label = buzzed
    ? (isMine ? 'A TOI !' : '…')
    : lockedOut ? 'BLOQUE'
    : arming ? String(buzzLock)
    : 'BUZZ';

  return (
    <section className={styles.panel}>
      <div className={styles.stageTitle} style={{ textAlign: 'center' }}>Manche {state.round!.index + 1}</div>
      <div className={styles.buzzZone}>
        <button
          className={`${styles.buzzer} ${arming ? styles.arming : ''}`} type="button" data-testid="buzz"
          onClick={press} disabled={buzzed || lockedOut || pressed || arming}
        >
          {label}
        </button>
      </div>
      <div className={styles.buzzState}>
        {buzzed ? (
          <>
            <span className={styles.who}>{isMine ? '🔔 A toi de repondre !' : `${buzz?.avatar ?? ''} ${buzz?.name ?? 'Quelqu\'un'} a buzze`}</span>
            <p className="muted" style={{ marginTop: 6 }}>
              {isMine ? 'Annonce le titre et l\'artiste a voix haute.' : 'L\'animateur valide ou non sa reponse.'}
            </p>
            {state.round?.answerDeadline && (
              <div className={`${styles.answerClock} ${answerLeft <= 3 ? styles.urgent : ''}`}>
                <b>{answerLeft}</b> <span>{isMine ? 'pour repondre' : 'restantes'}</span>
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            {lockedOut
              ? 'Tu as deja tente ta chance sur cette manche.'
              : arming
                ? `Le buzzer s'ouvre dans ${buzzLock} s — ecoute d'abord.`
                : 'Sois le premier a appuyer, puis annonce ta reponse a voix haute.'}
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------------- Revelation ---------------- */

function Reveal({ state, me }: { state: GameState; me: Me }) {
  const round = state.round!;
  const track = round.track!;
  const result = round.results?.find((r) => r.playerId === me.playerId);
  const gained = result?.gained ?? 0;

  useEffect(() => {
    sfx.unlock();
    if (gained > 0) { sfx.good(); navigator.vibrate?.([18, 60, 18]); }
    else sfx.bad();
  }, [gained]);

  return (
    <section className={styles.panel}>
      <div className={styles.stageTitle}>La reponse</div>
      <div className={`card ${styles.trackCard}`}>
        {track.cover ? <img src={track.cover} alt="" /> : <div className="avatar lg">🎵</div>}
        <div className="grow">
          <div className={styles.t}>{track.title}</div>
          <div className={styles.a}>{track.artist}</div>
          {track.album && <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{track.album}</div>}
        </div>
      </div>

      <div className={styles.verdict}>
        <div className={`${styles.v} ${result?.titleOk ? styles.yes : styles.no}`}>
          <b>Titre</b><span>{result?.titleOk ? '✅' : '❌'}</span>
        </div>
        {state.settings.guessArtist ? (
          <div className={`${styles.v} ${result?.artistOk ? styles.yes : styles.no}`}>
            <b>Artiste</b><span>{result?.artistOk ? '✅' : '❌'}</span>
          </div>
        ) : (
          <div className={styles.v}><b>Artiste</b><span className="faint">—</span></div>
        )}
      </div>

      <div className={`${styles.gain} ${gained > 0 ? styles.plus : styles.zero} pop-in`}>+{gained}</div>
      <Board rows={state.players.slice(0, 5)} me={me} />
      <p className={styles.hint} style={{ textAlign: 'center' }}>Manche {round.index + 1} / {round.total}</p>
    </section>
  );
}

function Scores({ state, me }: { state: GameState; me: Me }) {
  return (
    <section className={styles.panel}>
      <div className={styles.stageTitle}>Classement</div>
      <Board rows={state.players} me={me} />
    </section>
  );
}

/* ---------------- Fin de partie ---------------- */

function Ending({ state, me, code }: { state: GameState; me: Me; code: string }) {
  const board = state.podium ?? state.players;
  const position = board.findIndex((p) => p.id === me.playerId) + 1;
  const score = board.find((p) => p.id === me.playerId)?.score ?? 0;
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    sfx.unlock();
    sfx.win();
    if (position > 3 || !canvas.current) return;
    return confetti(canvas.current);
  }, [position]);

  return (
    <section className={styles.panel}>
      <canvas ref={canvas} className={styles.confetti} />
      <div className={styles.final}>
        <div className={styles.medal}>{MEDALS[position - 1] ?? '🎉'}</div>
        <div>
          <div className={styles.pos}>{position ? `${ordinal(position)} place` : 'Partie terminee'}</div>
          <p className="muted">{position === 1 ? 'Personne ne t\'arrete.' : `${score} points au compteur.`}</p>
        </div>
        <Board rows={board} me={me} />
        <button
          className="btn block"
          onClick={() => copyToClipboard(`${location.origin}/j/${code}`).then(() => toast('Lien copie', 'ok'))}
        >
          🔗 Copier le lien de la partie
        </button>
      </div>
    </section>
  );
}

/* ---------------- Classement ---------------- */

function Board({ rows, me }: { rows: PlayerRow[]; me: Me }) {
  const tops = [styles.top1, styles.top2, styles.top3];
  return (
    <div className={styles.board}>
      {rows.map((p, i) => (
        <div key={p.id} className={`${styles.r} ${p.id === me.playerId ? styles.self : ''} ${tops[i] ?? ''}`}>
          <span className={styles.pos}>{i + 1}</span>
          <span>{p.avatar}</span>
          <span className={`${styles.nm} ellipsis`}>{p.name}</span>
          {p.lastGain > 0 && <span className={styles.delta}>+{p.lastGain}</span>}
          <span className={styles.sc}>{p.score}</span>
        </div>
      ))}
    </div>
  );
}
