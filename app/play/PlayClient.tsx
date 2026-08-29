'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';

import { Brand } from '@/components/Brand';
import { SupportNote } from '@/components/SupportNote';
import { clock } from '@/lib/clock';
import { confetti } from '@/lib/confetti';
import { answerMarks, asksArtist, boardWithSelf, hasFoundAll, hasFoundSome, ordinal } from '@/lib/game';
import { sfx } from '@/lib/sfx';
import { call } from '@/lib/socket';
import { copyToClipboard, store } from '@/lib/storage';
import { toast } from '@/lib/toast';
import type { AnswerBadge, GameState, PlayerRow, You } from '@/lib/types';
import { useAudioPlayer } from '@/lib/useAudioPlayer';
import { useGameSocket } from '@/lib/useGameSocket';
import { useRoundClock } from '@/lib/useRoundClock';

import styles from './play.module.css';

interface Session { playerId: string; token: string }
interface Me { playerId: string; name: string; avatar: string }

interface SoundControls {
  muted: boolean;
  volume: number;
  locked: boolean;
  toggleMute: () => void;
  setVolume: (value: number) => void;
  /** Re-teste si le navigateur accepte qu'on regle le volume. */
  probe: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function PlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

  const [me, setMe] = useState<Me | null>(null);
  const [pseudo, setPseudo] = useState('');
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(80);
  const [volumeLocked, setVolumeLocked] = useState(false);

  const player = useAudioPlayer();
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  const sessionKey = `refrain.player.${code}`;

  const adopt = useCallback((res: { playerId: string; token?: string; name: string; avatar: string }) => {
    const token = res.token ?? store.get<Session | null>(sessionKey, null)?.token ?? '';
    store.set(sessionKey, { playerId: res.playerId, token });
    setMe({ playerId: res.playerId, name: res.name, avatar: res.avatar });
  }, [sessionKey]);

  const { socket, state, setState, you, setYou, connected } = useGameSocket({
    onReady: async (s) => {
      const saved = store.get<Session | null>(sessionKey, null);
      if (saved?.token) {
        const res = await call<{ playerId: string; name: string; avatar: string; state: GameState; you: You }>(
          s, 'player:resume', { code, ...saved },
        );
        if (res.ok) {
          adopt(res);
          setState(res.state);
          if (res.you) setYou(res.you);
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

  useEffect(() => {
    if (!code) router.replace('/');
  }, [code, router]);

  // iOS ignore silencieusement toute ecriture sur `volume` : on le detecte pour
  // guider vers les boutons physiques plutot qu'offrir un curseur inerte.
  const audioOn = Boolean(state?.settings.playerAudio);
  useEffect(() => {
    if (!audioOn) return;
    setVolumeLocked(!player.canSetVolume());
  }, [audioOn, player]);

  useEffect(() => {
    player.setVolume(muted ? 0 : volume / 100);
  }, [muted, volume, player]);

  const sound: SoundControls = {
    muted,
    volume,
    locked: volumeLocked,
    toggleMute() {
      // Surtout pas de unlock() ici : il remplacerait le morceau en cours par
      // l'echantillon silencieux, et le son ne reviendrait jamais.
      const next = !muted;
      setMuted(next);
      store.set('refrain.player.muted', next);
    },
    setVolume(value) {
      setVolumeState(value);
      store.set('refrain.player.volume', value);
      if (value > 0 && muted) { setMuted(false); store.set('refrain.player.muted', false); }
    },
    probe() {
      // Teste au moment ou l'utilisateur ouvre le panneau : l'element a alors
      // une vraie source, ce qui rend la detection fiable.
      setVolumeLocked(!player.canSetVolume());
    },
  };

  /** Quitter pour de bon : le salon oublie le joueur, l'appareil oublie le salon. */
  async function leave() {
    if (!window.confirm('Quitter la partie ? Ton score sera perdu.')) return;
    if (socket) await call(socket, 'player:leave');
    store.del(sessionKey);
    router.replace('/');
  }

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
    const res = await call<{ playerId: string; token: string; name: string; avatar: string; state: GameState; you: You }>(
      socket, 'player:join', { code, name },
    );
    setJoining(false);
    if (!res.ok) return toast(res.error, 'err');

    store.set('refrain.lastName', name);
    setMuted(store.get('refrain.player.muted', false));
    setVolumeState(store.get('refrain.player.volume', 80));
    adopt(res);
    setState(res.state);
    if (res.you) setYou(res.you);
  }

  // Le classement diffuse est borne : la ligne du joueur vient de son canal
  // personnel, ou il figure toujours — meme 1500e sur 2000.
  const self: PlayerRow | null = you
    ? {
        id: you.id, name: you.name, avatar: you.avatar, score: you.score,
        connected: true, lastGain: you.lastGain, answered: you.answered,
      }
    : null;

  return (
    <>
      <audio ref={player.audio} preload="auto" />
      {!me || !state ? (
        <JoinScreen
          code={code} pseudo={pseudo} setPseudo={setPseudo}
          connected={connected} joining={joining} onSubmit={join}
        />
      ) : (
        <PlayScreen
          code={code} me={me} self={self} you={you}
          state={state} socket={socket} connected={connected} sound={sound} onLeave={leave}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Connexion                                                          */
/* ------------------------------------------------------------------ */

function JoinScreen({ code, pseudo, setPseudo, connected, joining, onSubmit }: {
  code: string; pseudo: string; setPseudo: (v: string) => void;
  connected: boolean; joining: boolean; onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className={styles.app}>
      <div className={styles.brandBar}><Brand /></div>
      <main className={styles.main}>
        <form className={styles.hello} onSubmit={onSubmit}>
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
            Telephone ou ordinateur, peu importe. Le son sort sur l&apos;ecran de l&apos;animateur.
          </p>
          <SupportNote />
        </form>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partie en cours                                                    */
/* ------------------------------------------------------------------ */

function PlayScreen({ code, me, self, you, state, socket, connected, sound, onLeave }: {
  code: string; me: Me; self: PlayerRow | null; you: You | null;
  state: GameState; socket: Socket | null; connected: boolean; sound: SoundControls;
  onLeave: () => void;
}) {
  const { ratio, countdown, buzzLock, answerLeft } = useRoundClock(state);
  const [soundOpen, setSoundOpen] = useState(false);
  const showTimer = state.phase === 'playing';
  const inGame = state.phase !== 'lobby' && state.phase !== 'ended';

  return (
    <div className={styles.app}>
      <div className={styles.brandBar}>
        <Brand />
        <span className={styles.spacer} />
        <span className="faint" style={{ fontSize: 12 }}>Salon {code}</span>
        <button type="button" className={styles.leaveBtn} onClick={onLeave} data-testid="leave">
          Quitter
        </button>
      </div>

      <header className={styles.topbar}>
        <div className={styles.line}>
          <div className={styles.me}>
            <span className="avatar">{self?.avatar ?? me.avatar}</span>
            <div>
              <div className={styles.name}>{self?.name ?? me.name}</div>
              <div className={`${styles.rank} faint`}>
                {state.phase === 'lobby'
                  ? 'Pret'
                  : `${ordinal(you?.rank ?? 0)} sur ${state.counts.players}`}
              </div>
            </div>
          </div>

          {inGame && state.round && (
            <span className={styles.roundChip}>{state.round.index + 1}/{state.round.total}</span>
          )}

          {state.settings.playerAudio && (
            <button
              type="button"
              className={`${styles.soundToggle} ${sound.muted ? styles.off : ''} ${soundOpen ? styles.open : ''}`}
              onClick={() => { if (!soundOpen) sound.probe(); setSoundOpen((v) => !v); }}
              aria-expanded={soundOpen} aria-label="Reglage du son" title="Reglage du son"
            >
              {sound.muted || sound.volume === 0 ? '🔇' : '🔊'}
            </button>
          )}

          <ScoreChip score={self?.score ?? 0} />
        </div>

        {soundOpen && state.settings.playerAudio && (
          <div className={styles.soundPanel}>
            <button
              type="button" onClick={sound.toggleMute}
              aria-label={sound.muted ? 'Reactiver le son' : 'Couper le son'}
            >
              {sound.muted ? '🔇' : '🔊'}
            </button>

            {sound.locked ? (
              // Sur iOS, ecrire dans `volume` n'a aucun effet : un curseur ici
              // serait un mensonge. On garde ce qui marche, on dit le reste.
              <span className={styles.soundNote}>
                Volume : utilise les boutons de ton appareil. Couper / remettre fonctionne ici.
              </span>
            ) : (
              <>
                <input
                  type="range" min={0} max={100} step={5} value={sound.muted ? 0 : sound.volume}
                  aria-label="Volume"
                  onChange={(e) => sound.setVolume(Number(e.target.value))}
                />
                <span className={styles.lvl}>{sound.muted ? 0 : sound.volume}%</span>
              </>
            )}
          </div>
        )}

        {showTimer && (
          <div className={`${styles.timer} ${ratio < 0.28 ? styles.warn : ''}`}>
            <i style={{ transform: `scaleX(${ratio})` }} />
          </div>
        )}
      </header>

      <main className={styles.main}>
        {state.phase === 'lobby' && <Lobby state={state} me={me} code={code} />}
        {state.phase === 'countdown' && <Countdown round={state.round!.index + 1} value={countdown} />}
        {state.phase === 'playing' && state.settings.mode === 'input' && (
          <AnswerForm key={state.round!.index} state={state} me={me} self={self} socket={socket} />
        )}
        {(state.phase === 'playing' || state.phase === 'buzzed') && state.settings.mode === 'buzzer' && (
          <Buzzer state={state} me={me} you={you} socket={socket} buzzLock={buzzLock} answerLeft={answerLeft} />
        )}
        {state.phase === 'paused' && (
          <section className={styles.panel} data-testid="scene-paused">
            <div className={styles.pausedPanel}>
              <div className={styles.bars}><i /><i /></div>
              <h2 className={styles.big}>Pause</h2>
              <p className="muted">L&apos;animateur revient dans un instant. Ton chrono est fige, rien n&apos;est perdu.</p>
            </div>
          </section>
        )}
        {state.phase === 'reveal' && <Reveal state={state} me={me} self={self} />}
        {state.phase === 'scores' && <Scores state={state} me={me} self={self} />}
        {state.phase === 'ended' && <Ending state={state} me={me} self={self} you={you} code={code} />}
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

/** Le score tressaille quand il monte : on voit ses points arriver. */
function ScoreChip({ score }: { score: number }) {
  const [bump, setBump] = useState(false);
  const previous = useRef(score);

  useEffect(() => {
    if (score > previous.current) {
      setBump(true);
      const timer = setTimeout(() => setBump(false), 600);
      previous.current = score;
      return () => clearTimeout(timer);
    }
    previous.current = score;
  }, [score]);

  return (
    <div className={`${styles.scoreChip} ${bump ? styles.bump : ''}`}>
      <span className={`${styles.val} tnum`}>{score}</span>
      <span className={styles.unit}>pts</span>
    </div>
  );
}

/* ---------------- Salon ---------------- */

function Lobby({ state, me, code }: { state: GameState; me: Me; code: string }) {
  const hidden = Math.max(0, state.counts.players - state.leaderboard.length);
  return (
    <section className={styles.panel} data-testid="scene-lobby">
      <div className={styles.waiting}>
        <div className={styles.pulseRing}>🎶</div>
        <div>
          <h2 className={styles.big}>Tu es dans la place</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            L&apos;animateur lance la partie quand tout le monde est la.
          </p>
        </div>

        <div className={styles.roster}>
          {state.leaderboard.map((p) => (
            <span key={p.id} className={`${styles.who} ${p.connected ? '' : styles.off} ${p.id === me.playerId ? styles.self : ''}`}>
              {p.avatar} {p.name}
            </span>
          ))}
          {hidden > 0 && <span className={styles.who}>+ {hidden}</span>}
        </div>

        <p className={styles.hint}>
          {state.counts.players} joueur{state.counts.players > 1 ? 's' : ''} •{' '}
          {state.playlist ? `${state.playlist.emoji} ${state.playlist.title}` : 'liste en cours de choix…'}
        </p>
        <p className={styles.hint}>Salon <b className="code-chip">{code}</b></p>
        <SupportNote />
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

function AnswerForm({ state, me, self, socket }: {
  state: GameState; me: Me; self: PlayerRow | null; socket: Socket | null;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [sending, setSending] = useState(false);
  const [hint, setHint] = useState('Tu peux corriger et revalider autant que tu veux : plus tu trouves tot, plus tu marques.');

  const titleRef = useRef<HTMLInputElement>(null);
  const [foundAt, setFoundAt] = useState<number | null>(null);

  // L'accuse de reception fait foi immediatement : le verrouillage ne doit pas
  // attendre l'aller-retour de la ligne personnelle.
  const [localBadge, setLocalBadge] = useState<AnswerBadge | null>(null);
  const badge = localBadge ?? self?.answered ?? null;
  const titleOk = Boolean(badge?.titleOk);
  const artistOk = Boolean(badge?.artistOk);
  const askArtist = asksArtist(state);
  const allFound = hasFoundAll(badge, askArtist);

  // Le champ est pret des le depart : une seconde gagnee, c'est un bonus de plus.
  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    if (allFound && foundAt === null) setFoundAt(clock.now() - state.round!.startAt);
  }, [allFound, foundAt, state]);

  const elapsed = useMemo(
    () => (foundAt === null ? null : Math.max(0.1, foundAt / 1000).toFixed(1)),
    [foundAt],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!socket || state.phase !== 'playing') return;
    sfx.unlock();
    if (!title.trim() && !artist.trim()) return;

    const before = { title: titleOk, artist: artistOk };
    setSending(true);
    const res = await call<{ titleOk: boolean; artistOk: boolean; throttled?: boolean }>(socket, 'player:answer', {
      title: title.trim(), artist: artist.trim(),
    });
    setSending(false);
    if (!res.ok) return toast(res.error, 'err');
    if (res.throttled) return setHint('Doucement — laisse une seconde entre deux essais.');

    setLocalBadge({ titleOk: res.titleOk, artistOk: res.artistOk, tries: 0 });

    const gotTitle = res.titleOk && !before.title;
    const gotArtist = res.artistOk && !before.artist;
    if (gotTitle && gotArtist) { sfx.great(); toast('🎯 Titre + artiste !', 'ok'); navigator.vibrate?.([20, 50, 20, 50, 30]); }
    else if (gotTitle) { sfx.good(); toast('✅ Titre trouve !', 'ok'); navigator.vibrate?.(45); }
    else if (gotArtist) { sfx.good(); toast('✅ Artiste trouve !', 'ok'); navigator.vibrate?.(45); }
    else { sfx.bad(); setHint('Pas encore… reessaie, le chrono tourne.'); navigator.vibrate?.(90); }
  }

  return (
    <section className={`${styles.panel} ${styles.split}`}>
      <div className={styles.answerCol}>
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
              ref={titleRef}
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

          {allFound ? (
            <div className={styles.allFound}>
              <span className={styles.mark}>🎯</span>
              <span className={styles.t}>Tout trouve !</span>
              <span className={styles.s}>
                {elapsed ? `En ${elapsed} s — les points arrivent a la revelation.` : 'Les points arrivent a la revelation.'}
              </span>
            </div>
          ) : (
            <>
              <button className="btn primary lg block" type="submit" data-testid="answer-submit" disabled={sending}>
                Valider ma reponse
              </button>
              <p className={styles.hint}>{hint}</p>
            </>
          )}
        </form>
      </div>

      <LiveMini state={state} me={me} />
    </section>
  );
}

function LiveMini({ state, me }: { state: GameState; me: Me }) {
  const rows = state.leaderboard.slice(0, 6);
  const ask = asksArtist(state);
  const { counts } = state;

  return (
    <div className={styles.liveMini}>
      <div className={styles.head}>
        Qui a deja trouve ? <span className={styles.headCount}>{counts.done}/{counts.connected}</span>
      </div>
      {rows.map((p) => {
        const done = hasFoundAll(p.answered, ask);
        const part = hasFoundSome(p.answered);
        return (
          <div key={p.id} className={`${styles.lm} ${done ? styles.done : part ? styles.part : ''} ${p.id === me.playerId ? styles.self : ''}`}>
            <span>{p.avatar}</span>
            <span className={`${styles.nm} ellipsis`}>{p.name}</span>
            <span className={styles.mk}>{answerMarks(p.answered, ask)}</span>
            <span className={styles.sc}>{p.score}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Buzzer ---------------- */

function Buzzer({ state, me, you, socket, buzzLock, answerLeft }: {
  state: GameState; me: Me; you: You | null; socket: Socket | null; buzzLock: number; answerLeft: number;
}) {
  const [pressed, setPressed] = useState(false);
  const buzz = state.round?.buzz ?? null;
  // La liste publique fait foi : elle arrive avec le changement de phase,
  // alors que la ligne personnelle n'est rafraichie qu'aux bornes de manche.
  const lockedOut = Boolean(you?.lockedOut) || Boolean(state.round?.lockedOut.includes(me.playerId));
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
            <span className={styles.who}>
              {isMine ? '🔔 A toi de repondre !' : `${buzz?.avatar ?? ''} ${buzz?.name ?? 'Quelqu\'un'} a buzze`}
            </span>
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

function Reveal({ state, me, self }: { state: GameState; me: Me; self: PlayerRow | null }) {
  const round = state.round!;
  const track = round.track!;
  const badge = self?.answered ?? null;
  const gained = self?.lastGain ?? 0;

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
          {track.artist && <div className={styles.a}>{track.artist}</div>}
          {track.album && <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{track.album}</div>}
        </div>
      </div>

      <div className={styles.verdict}>
        <div className={`${styles.v} ${badge?.titleOk ? styles.yes : styles.no}`}>
          <b>Titre</b><span>{badge?.titleOk ? '✅' : '❌'}</span>
        </div>
        {asksArtist(state) ? (
          <div className={`${styles.v} ${badge?.artistOk ? styles.yes : styles.no}`}>
            <b>Artiste</b><span>{badge?.artistOk ? '✅' : '❌'}</span>
          </div>
        ) : (
          <div className={styles.v}><b>Artiste</b><span className="faint">—</span></div>
        )}
      </div>

      <div className={`${styles.gain} ${gained > 0 ? styles.plus : styles.zero} pop-in`}>+{gained}</div>

      {track.link && (
        <a className={styles.listenLink} href={track.link} target="_blank" rel="noopener noreferrer">
          🎧 Ecouter le morceau en entier
        </a>
      )}

      <Board rows={boardWithSelf(state, self, 5)} me={me} />
      <p className={styles.hint} style={{ textAlign: 'center' }}>Manche {round.index + 1} / {round.total}</p>
    </section>
  );
}

function Scores({ state, me, self }: { state: GameState; me: Me; self: PlayerRow | null }) {
  return (
    <section className={styles.panel}>
      <div className={styles.stageTitle}>Classement</div>
      <Board rows={boardWithSelf(state, self)} me={me} />
      {state.counts.players > state.leaderboard.length && (
        <p className={styles.hint} style={{ textAlign: 'center' }}>
          Sur {state.counts.players} joueurs
        </p>
      )}
    </section>
  );
}

/* ---------------- Fin de partie ---------------- */

function Ending({ state, me, self, you, code }: {
  state: GameState; me: Me; self: PlayerRow | null; you: You | null; code: string;
}) {
  const board = state.podium ?? state.leaderboard;
  const position = you?.rank ?? 0;
  const score = self?.score ?? 0;
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    sfx.unlock();
    sfx.win();
    if (position > 3 || position === 0 || !canvas.current) return;
    return confetti(canvas.current);
  }, [position]);

  return (
    <section className={styles.panel}>
      <canvas ref={canvas} className={styles.confetti} />
      <div className={styles.final}>
        <div className={styles.medal}>{MEDALS[position - 1] ?? '🎉'}</div>
        <div>
          <div className={styles.pos}>{position ? `${ordinal(position)} place` : 'Partie terminee'}</div>
          <p className="muted">
            {position === 1 ? 'Personne ne t\'arrete.' : `${score} points sur ${state.counts.players} joueurs.`}
          </p>
        </div>
        <Board rows={boardWithSelf({ ...state, leaderboard: board }, self)} me={me} />
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
