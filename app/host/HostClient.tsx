'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { Brand } from '@/components/Brand';
import { QrCode } from '@/components/QrCode';
import { SupportNote } from '@/components/SupportNote';
import { asksArtist, hasFoundAll, hasFoundSome, PHASE_LABEL } from '@/lib/game';
import { sfx } from '@/lib/sfx';
import { call } from '@/lib/socket';
import { copyToClipboard, store } from '@/lib/storage';
import { toast } from '@/lib/toast';
import type { ArtistHit, ArtistMode, Category, GameState, SearchTrack, Settings } from '@/lib/types';
import { useAudioDevice } from '@/lib/useAudioDevice';
import { useGameSocket } from '@/lib/useGameSocket';
import { useRoundClock } from '@/lib/useRoundClock';

import styles from './host.module.css';

interface HostSession { code: string; hostToken: string }
type Tab = 'catalog' | 'artist' | 'search' | 'import';

const MODE_NOTE = {
  input: 'Tout le monde tape titre + artiste. Correction automatique, bonus de rapidite.',
  buzzer: 'Le premier qui buzze coupe la musique et repond a voix haute. Tu valides ou non.',
} as const;

export function HostClient() {
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [artistModes, setArtistModes] = useState<ArtistMode[]>([]);
  const [tab, setTab] = useState<Tab>('catalog');
  const [blurred, setBlurred] = useState(false);
  const [loadingCat, setLoadingCat] = useState<string | null>(null);
  const [sources, setSources] = useState<{ spotify?: boolean }>({});
  const [refreshing, setRefreshing] = useState(false);

  const player = useAudioDevice((reason) => toast(
    reason === 'autoplay'
      ? 'Clique une fois sur la page pour autoriser le son.'
      : "L'extrait n'a pas pu etre charge.",
    'err',
  ));
  const codeRef = useRef('');

  useEffect(() => {
    setOrigin(window.location.origin);
    setBlurred(store.get('refrain.host.blur', false));
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d: { categories: Category[]; artistModes: ArtistMode[] }) => {
        setCategories(d.categories);
        setArtistModes(d.artistModes ?? []);
      })
      .catch(() => toast('Impossible de charger les listes.', 'err'));
    fetch('/api/sources').then((r) => r.json()).then(setSources).catch(() => {});
  }, []);

  const { socket, state, setState } = useGameSocket({
    onReady: async (s) => {
      const saved = store.get<HostSession | null>('refrain.host', null);
      if (saved?.code && saved.hostToken) {
        const res = await call<{ code: string; state: GameState }>(s, 'host:resume', saved);
        if (res.ok) {
          setCode(res.code);
          codeRef.current = res.code;
          setState(res.state);
          return;
        }
      }
      const created = await call<{ code: string; hostToken: string; state: GameState }>(s, 'host:create');
      if (!created.ok) return toast(created.error, 'err');
      store.set('refrain.host', { code: created.code, hostToken: created.hostToken });
      setCode(created.code);
      codeRef.current = created.code;
      setState(created.state);
    },
    onAudio: player.handleCue,
  });

  const joinUrl = origin && code ? `${origin}/j/${code}` : '';
  const inGame = Boolean(state && state.phase !== 'lobby' && state.phase !== 'ended');

  const send = useCallback(
    async (event: string, payload?: unknown, timeout?: number) => {
      if (!socket) return;
      const res = await call(socket, event, payload, timeout);
      if (!res.ok) toast(res.error, 'err');
      return res;
    },
    [socket],
  );

  async function pickCategory(cat: Category) {
    setLoadingCat(cat.id);
    const res = await send('host:playlist', { type: 'catalog', id: cat.id }, 60000);
    setLoadingCat(null);
    if (res?.ok) toast(`${cat.emoji} ${cat.title} — liste prete`, 'ok');
  }

  // Un seul chrono pour toute la page : le panneau de jeu et la barre de
  // commande partagent la meme boucle d'animation.
  const roundClock = useRoundClock(state);

  useKeyboardShortcuts(state, send);
  // La regie pilote aussi le lecteur quand la sortie du son est reglee sur « Ici ».
  useEffect(() => player.attach(socket), [socket, player]);

  if (!state) {
    return (
      <div className={styles.shell}>
        <div className={styles.bar}><Brand /><span className="pill">🎛️ Regie</span></div>
        <p className="muted">Ouverture du salon…</p>
      </div>
    );
  }

  const playersCard = <PlayersCard state={state} send={send} wide={inGame} />;

  return (
    <>
      <audio ref={player.audio} preload="auto" />
      <div ref={player.ytContainer} className={styles.ytStage} aria-hidden="true" />

      <div className={styles.shell}>
        <div className={styles.bar}>
          <Brand />
          <span className="pill">🎛️ Regie</span>
          <span className="pill" data-testid="phase">{PHASE_LABEL[state.phase]}</span>
          <div className="grow" />
          <span className={`pill ${state.screenOnline > 0 ? 'ok' : ''}`}>
            {state.screenOnline > 0
              ? `📺 ${state.screenOnline} ecran${state.screenOnline > 1 ? 's' : ''} connecte${state.screenOnline > 1 ? 's' : ''}`
              : '📺 aucun ecran'}
          </span>
          <a className="btn sm" href={`/screen?code=${code}`} target="_blank" rel="noopener">Ouvrir l&apos;ecran ↗</a>
        </div>

        <div className={styles.grid}>
          <div className={styles.sticky}>
            <section className="card pad col" style={{ gap: 14 }}>
              <div className="section-title">Salon</div>
              <div className={styles.roomCode}>
                <div className="grow">
                  <div className={styles.big} data-testid="room-code">{code || '····'}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    Code a saisir sur {origin.replace(/^https?:\/\//, '')}
                  </div>
                </div>
                {joinUrl && <QrCode className={styles.qrMini} text={joinUrl} />}
              </div>
              <div className={styles.linkRow}>
                <code>{joinUrl.replace(/^https?:\/\//, '') || '—'}</code>
                <button
                  className="btn icon" title="Copier le lien joueur"
                  onClick={() => copyToClipboard(joinUrl).then(() => toast('Lien copie !', 'ok'))}
                >🔗</button>
              </div>

              <div className="col" style={{ gap: 7 }}>
                <div className="section-title" style={{ fontSize: 11 }}>Sortie du son</div>
                <div className="seg" role="group" aria-label="Sortie du son">
                  {(['screen', 'host'] as const).map((target) => (
                    <button
                      key={target} type="button" aria-pressed={state.audioTarget === target}
                      onClick={() => {
                        if (target === 'host') { sfx.unlock(); player.unlock(); }
                        void send('host:audioTarget', { target });
                      }}
                    >
                      {target === 'screen' ? '📺 Ecran' : '💻 Ici'}
                    </button>
                  ))}
                </div>
                <p className="faint" style={{ fontSize: 11.5 }}>
                  « Ici » joue la musique depuis cette page — pratique si tu n&apos;as pas d&apos;ecran separe.
                </p>
              </div>
            </section>

            {!inGame && playersCard}
            <SupportNote />
          </div>

          <div className="col" style={{ gap: 18 }}>
            {inGame && state.round && (
              <LivePanel
                state={state} blurred={blurred} ratio={roundClock.ratio} answerLeft={roundClock.answerLeft}
                onBlur={(v) => { setBlurred(v); store.set('refrain.host.blur', v); }}
              >
                {playersCard}
              </LivePanel>
            )}

            {!inGame && (
              <>
                <section className="card pad col" style={{ gap: 16 }}>
                  <div className={styles.tabs} role="tablist">
                    {([
                      ['catalog', '🎧 Listes pretes'],
                      ['artist', '🎤 Un artiste'],
                      ['search', '🔎 Ma selection'],
                      ['import', '📥 Importer'],
                    ] as const).map(([id, label]) => (
                      <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                    ))}
                  </div>

                  {tab === 'catalog' && (
                    <>
                    {state.playlist?.source === 'catalog' && (
                      <div className="row" style={{ marginBottom: 4 }}>
                        <span className="muted grow" style={{ fontSize: 13 }}>
                          {state.playlist.emoji} {state.playlist.title} — {state.playlist.total} titres
                        </span>
                        <button
                          className="btn xs" disabled={refreshing}
                          title="Recharger la liste depuis Deezer"
                          onClick={async () => {
                            setRefreshing(true);
                            const res = await send('host:refresh', {}, 120000) as { ok: boolean; total?: number } | undefined;
                            setRefreshing(false);
                            if (res?.ok) toast(`Liste actualisee — ${res.total} titres`, 'ok');
                          }}
                        >
                          {refreshing ? '⏳ Actualisation…' : '🔄 Actualiser'}
                        </button>
                      </div>
                    )}
                    <div className={styles.cats}>
                      {categories.map((c) => (
                        <button
                          key={c.id} type="button" className={styles.cat}
                          data-testid="category" data-category={c.id}
                          aria-pressed={state.playlist?.id === c.id}
                          style={{ ['--c' as string]: c.accent }}
                          onClick={() => pickCategory(c)}
                        >
                          <span className={styles.check}>✅</span>
                          <span className={styles.em}>{c.emoji}</span>
                          <span className={styles.t}>{c.title}</span>
                          <span className={styles.s}>{loadingCat === c.id ? 'Chargement des extraits…' : c.subtitle}</span>
                        </button>
                      ))}
                    </div>
                    </>
                  )}

                  {tab === 'artist' && <ArtistTab send={send} modes={artistModes} state={state} />}
                  {tab === 'search' && <SearchTab send={send} count={state.customCount ?? 0} />}
                  {tab === 'import' && <ImportTab send={send} state={state} sources={sources} />}
                </section>

                <SettingsPanel
                  settings={state.settings} send={send}
                  askArtist={state.playlist?.askArtist !== false}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <Controls state={state} send={send} unlockAudio={player.unlock} answerLeft={roundClock.answerLeft} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Joueurs                                                            */
/* ------------------------------------------------------------------ */

type Send = (event: string, payload?: unknown, timeout?: number) => Promise<{ ok: boolean } | undefined>;

function PlayersCard({ state, send, wide }: { state: GameState; send: Send; wide: boolean }) {
  const ask = asksArtist(state);
  const { counts, leaderboard } = state;
  const hidden = Math.max(0, counts.players - leaderboard.length);

  return (
    <section className={`card pad col ${wide ? styles.bare : ''}`} style={{ gap: 12 }}>
      <div className="section-title">
        Joueurs <span className="pill">{counts.players}</span>
        {counts.connected < counts.players && <span className="pill">{counts.connected} en ligne</span>}
        {state.round && <span className="pill">{counts.done} ont trouve</span>}
      </div>
      <div className={`${styles.plist} ${wide ? styles.wide : ''}`}>
        {leaderboard.map((p) => {
          const done = hasFoundAll(p.answered, ask);
          const part = hasFoundSome(p.answered);
          const guess = p.guessTitle || p.guessArtist
            ? `${p.guessTitle || '—'} · ${p.guessArtist || '—'}` : null;
          return (
            <div key={p.id} className={`${styles.pcard} ${p.connected ? '' : styles.off} ${done ? styles.done : part ? styles.part : ''}`}>
              <span>{p.avatar}</span>
              <div className="grow">
                <div className={`${styles.nm} ellipsis`}>{p.name}</div>
                {guess && (
                  <div className={`${styles.guess} ellipsis`}>
                    {p.answered?.titleOk ? '🎵' : ''}{p.answered?.artistOk ? '🎤' : ''} {guess}
                  </div>
                )}
              </div>
              <div className={styles.tools}>
                <button className="btn xs" title="Retirer un point" onClick={() => send('host:award', { playerId: p.id, delta: -1 })}>−</button>
                <button className="btn xs" title="Donner un point" onClick={() => send('host:award', { playerId: p.id, delta: 1 })}>+</button>
                <button
                  className="btn xs danger" title="Exclure"
                  onClick={() => { if (confirm(`Retirer ${p.name} de la partie ?`)) void send('host:kick', { playerId: p.id }); }}
                >✕</button>
              </div>
              {p.lastGain > 0 && <span className={styles.sc} style={{ color: 'var(--green)' }}>+{p.lastGain}</span>}
              <span className={styles.sc}>{p.score}</span>
            </div>
          );
        })}
        {counts.players === 0 && (
          <p className="faint" style={{ fontSize: 12.5 }}>Personne pour l&apos;instant. Fais scanner le QR code.</p>
        )}
      </div>
      {hidden > 0 && (
        <p className="faint" style={{ fontSize: 12 }}>
          {state.phase === 'lobby'
            ? `+ ${hidden} autres joueurs — la liste montre les derniers arrives.`
            : `+ ${hidden} autres joueurs — la liste montre le haut du classement.`}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau de jeu                                                     */
/* ------------------------------------------------------------------ */

function LivePanel({ state, blurred, ratio, answerLeft, onBlur, children }: {
  state: GameState; blurred: boolean; ratio: number; answerLeft: number;
  onBlur: (v: boolean) => void; children: React.ReactNode;
}) {
  const round = state.round!;
  const track = round.track;
  const buzz = state.phase === 'buzzed' ? round.buzz : null;

  useEffect(() => { if (buzz) { sfx.unlock(); sfx.buzz(); } }, [buzz?.playerId]);

  return (
    <section className="card pad col" style={{ gap: 14 }}>
      <div className="row">
        <div className="section-title grow">Manche {round.index + 1} / {round.total}</div>
        <label className="switch" title="Masquer la reponse pour ne pas spoiler ton entourage">
          <input type="checkbox" checked={blurred} onChange={(e) => onBlur(e.target.checked)} />
          <span className="track" />
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Masquer</span>
        </label>
      </div>

      {buzz && (
        <div className={styles.buzzAlert}>
          <span className={styles.av}>{buzz.avatar}</span>
          <div className="grow">
            <div className={styles.nm}>{buzz.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>a buzze — ecoute sa reponse puis tranche.</div>
          </div>
          {round.answerDeadline && (
            <span className={`${styles.clock} ${answerLeft <= 3 ? styles.urgent : ''}`}>{answerLeft}</span>
          )}
        </div>
      )}

      <div className={`${styles.secret} ${blurred ? styles.blur : ''}`}>
        <div className={styles.nowPlaying}>
          {track?.cover
            ? <img className={styles.hideable} src={track.cover} alt="" />
            : <div className={`${styles.hideable} avatar lg`}>🎵</div>}
          <div className="grow">
            <div className={`${styles.t} ${styles.hideable}`} data-testid="np-title">{track?.title ?? '—'}</div>
            <div className={`${styles.a} ${styles.hideable}`} data-testid="np-artist">{track?.artist ?? '—'}</div>
            {track?.album && <div className={`faint ${styles.hideable}`} style={{ fontSize: 12.5, marginTop: 3 }}>{track.album}</div>}
          </div>
        </div>

        <div className={styles.liveTimer}><i style={{ transform: `scaleX(${state.phase === 'playing' ? ratio : 1})` }} /></div>

        <div className={`${styles.upnext} ${styles.hideable}`}>
          {(state.upcoming ?? []).map((u, i) => (
            <div key={u.id} className={styles.u}>
              <b>Manche {round.index + 2 + i} :</b> {u.title} — {u.artist}
            </div>
          ))}
        </div>
      </div>

      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Onglets de selection                                               */
/* ------------------------------------------------------------------ */

/**
 * Une partie entiere sur un seul artiste.
 *
 * Trois profondeurs : ses tubes, tout son repertoire, ou seulement ce que le
 * grand public ne connait pas. Le rang de popularite de chaque morceau chez
 * Deezer sert de frontiere.
 */
function ArtistTab({ send, modes, state }: { send: Send; modes: ArtistMode[]; state: GameState }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArtistHit[] | null>(null);
  const [picked, setPicked] = useState<ArtistHit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [featurings, setFeaturings] = useState(true);
  const [lastMode, setLastMode] = useState<ArtistMode | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/artists?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { artists?: ArtistHit[] };
        setResults(data.artists ?? []);
      } catch {
        toast('Recherche d\'artiste indisponible.', 'err');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = useCallback(async (mode: ArtistMode, withFeaturings: boolean) => {
    if (!picked) return;
    setBusy(mode.id);
    setLastMode(mode);
    const res = await send(
      'host:playlist',
      { type: 'artist', artistId: picked.id, mode: mode.id, featurings: withFeaturings },
      90000,
    );
    setBusy(null);
    if (res?.ok) toast(`${mode.emoji} ${picked.name} — ${mode.title}`, 'ok');
  }, [picked, send]);

  /** Changer d'avis sur les featurings reconstruit la liste deja choisie. */
  function toggleFeaturings(next: boolean) {
    setFeaturings(next);
    if (lastMode) void choose(lastMode, next);
  }

  const active = state.playlist?.source === 'artist' ? state.playlist : null;

  return (
    <div>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
        Toute la partie sur un seul artiste. Cherche-le, puis choisis a quel point tu veux
        malmener les joueurs.
      </p>

      {!picked && (
        <>
          <div className="row">
            <input
              className="input grow" placeholder="Vald, Queen, Angele…" autoComplete="off"
              value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.artists}>
            {results?.map((a) => (
              <button key={a.id} type="button" className={styles.artistCard} onClick={() => setPicked(a)}>
                {a.picture
                  ? <img src={a.picture} alt="" loading="lazy" />
                  : <span className="avatar">🎤</span>}
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className={`${styles.n} ellipsis`} style={{ display: 'block' }}>{a.name}</span>
                  <span className={styles.f}>{a.fans.toLocaleString('fr-FR')} fans</span>
                </span>
              </button>
            ))}
          </div>
          {results?.length === 0 && (
            <p className={styles.note} style={{ marginTop: 10 }}>Aucun artiste trouve.</p>
          )}
        </>
      )}

      {picked && (
        <>
          <div className={styles.artistPicked}>
            {picked.picture && <img src={picked.picture} alt="" />}
            <div className="grow">
              <div className={styles.n}>{picked.name}</div>
              <div className="faint" style={{ fontSize: 12 }}>{picked.fans.toLocaleString('fr-FR')} fans</div>
            </div>
            <button className="btn xs" onClick={() => { setPicked(null); setQuery(''); setResults(null); }}>
              Changer
            </button>
          </div>

          <label className="switch" style={{ marginTop: 14 }}>
            <input
              type="checkbox" checked={featurings}
              onChange={(e) => toggleFeaturings(e.target.checked)}
              disabled={busy !== null}
            />
            <span className="track" />
            <span style={{ fontSize: 13.5 }}>Inclure les featurings</span>
          </label>
          <p className={styles.note} style={{ marginTop: 6 }}>
            Ses collaborations et ses passages invite chez d&apos;autres. Decoche pour ne garder
            que ce qu&apos;il a sorti seul.
          </p>

          <div className={styles.modes}>
            {modes.map((mode) => (
              <button
                key={mode.id} type="button" className={styles.modeCard}
                disabled={busy !== null}
                aria-pressed={active?.id === `artist-${picked.id}-${mode.id}-${featurings ? 'f' : 'n'}`}
                onClick={() => choose(mode, featurings)}
              >
                <span className={styles.em}>{mode.emoji}</span>
                <span className={styles.t}>{busy === mode.id ? 'Construction…' : mode.title}</span>
                <span className={styles.h}>{mode.hint}</span>
              </button>
            ))}
          </div>

          {active && (
            <p className={styles.note} style={{ marginTop: 12 }}>
              ✅ {active.title} — {active.subtitle}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SearchTab({ send, count }: { send: Send; count: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchTrack[] | null>(null);
  const [picked, setPicked] = useState<{ id: string; title: string; artist: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { tracks?: SearchTrack[] };
        setResults(data.tracks ?? []);
      } catch {
        toast('Recherche indisponible.', 'err');
      } finally {
        setBusy(false);
      }
    }, 420);
    return () => clearTimeout(timer);
  }, [query]);

  async function custom(action: string, payload: Record<string, unknown> = {}) {
    const res = (await send('host:custom', { action, ...payload })) as
      | { ok: true; tracks: { id: string; title: string; artist: string }[] }
      | { ok: false }
      | undefined;
    if (res?.ok) setPicked(res.tracks);
  }

  return (
    <div>
      <div className="row">
        <input
          className="input grow" placeholder="Chercher un titre ou un artiste…" autoComplete="off"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.results}>
        {busy && <p className="faint" style={{ padding: 10 }}>Recherche…</p>}
        {!busy && results?.length === 0 && <p className="faint" style={{ padding: 10 }}>Aucun extrait jouable pour cette recherche.</p>}
        {!busy && results?.map((t) => (
          <div key={t.id} className={styles.tres}>
            {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <div className="avatar">🎵</div>}
            <div className="grow">
              <div className={`${styles.t} ellipsis`}>{t.title}</div>
              <div className={`${styles.a} ellipsis`}>{t.artist}</div>
            </div>
            <button className="btn xs" onClick={() => custom('add', { track: t })}>+ Ajouter</button>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <div className="section-title grow">Ma selection <span className="pill">{picked.length || count}</span></div>
        <button className="btn xs danger" onClick={() => custom('clear')}>Vider</button>
        <button
          className="btn xs primary"
          onClick={async () => {
            const res = await send('host:playlist', { type: 'custom' }, 30000);
            if (res?.ok) toast('Ta selection est prete', 'ok');
          }}
        >Utiliser cette liste</button>
      </div>

      <div className={styles.picked}>
        {picked.map((t) => (
          <span key={t.id} className={styles.p}>
            {t.title} — {t.artist}
            <button title="Retirer" onClick={() => custom('remove', { id: t.id })}>✕</button>
          </span>
        ))}
      </div>
    </div>
  );
}

/** On devine la source a partir de l'adresse collee. */
function detectSource(raw: string): 'youtube' | 'deezer' | 'spotify' | null {
  const value = raw.trim();
  if (!value) return null;
  if (/open\.spotify\.com\/(intl-[a-z]+\/)?playlist\/|^spotify:playlist:/.test(value)) return 'spotify';
  if (/[?&]list=|^(PL|UU|OL|RD|FL|LL)[A-Za-z0-9_-]{10,}$/.test(value)) return 'youtube';
  if (/deezer\.com|^\d{3,}$/.test(value)) return 'deezer';
  return null;
}

const SOURCE_LABEL = { spotify: '🟢 Charger', youtube: '▶️ Charger', deezer: 'Importer' } as const;

function ImportTab({ send, state, sources }: { send: Send; state: GameState; sources: { spotify?: boolean } }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const source = detectSource(url);
  const playlist = state.playlist;
  const isYoutube = playlist?.source === 'youtube';
  const audioDeviceReady = state.audioTarget === 'host' ? state.hostOnline : state.screenOnline > 0;

  async function submit() {
    if (!source) return;
    setBusy(true);
    // Spotify demande de retrouver chaque morceau chez Deezer : c'est plus long.
    const res = await send('host:playlist', { type: source, id: url.trim() }, source === 'spotify' ? 180000 : 60000);
    setBusy(false);
    if (!res?.ok) return;
    toast(
      source === 'youtube' ? 'Playlist envoyee au lecteur…'
      : source === 'spotify' ? 'Playlist Spotify prete' : 'Playlist Deezer importee',
      'ok',
    );
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
        Colle une playlist <b>Deezer</b>, <b>YouTube</b>
        {sources.spotify && <> ou <b>Spotify</b></>} — le type est reconnu tout seul.
      </p>
      <div className="row">
        <input
          className="input grow" autoComplete="off"
          placeholder={sources.spotify
            ? 'https://open.spotify.com/playlist/… ou YouTube, ou Deezer'
            : 'https://www.youtube.com/playlist?list=… ou https://www.deezer.com/playlist/…'}
          value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && source) { e.preventDefault(); void submit(); } }}
        />
        <button className="btn" disabled={busy || !source} onClick={submit}>
          {busy ? 'Chargement…' : SOURCE_LABEL[source ?? 'deezer']}
        </button>
      </div>

      {url.trim() && !source && (
        <p className={styles.note} style={{ marginTop: 10 }}>
          Adresse non reconnue. Pour YouTube il faut le parametre <code>list=</code> d&apos;une playlist,
          pas un simple lien de video.
        </p>
      )}

      {!audioDeviceReady && (
        <p className={styles.note} style={{ marginTop: 10 }}>
          ⚠️ {state.audioTarget === 'host' ? 'La regie' : "L'ecran de diffusion"} doit etre connecte :
          c&apos;est lui qui lit la playlist YouTube.
        </p>
      )}

      {source === 'spotify' && !sources.spotify && (
        <p className={styles.note} style={{ marginTop: 10 }}>
          ⚠️ Spotify n&apos;est pas configure sur ce serveur : il manque
          <code> SPOTIFY_CLIENT_ID</code> et <code>SPOTIFY_CLIENT_SECRET</code>.
        </p>
      )}

      {playlist?.source === 'spotify' && (
        <p className={styles.note} style={{ marginTop: 12 }}>
          {playlist.pending
            ? `⏳ ${playlist.subtitle}`
            : `🟢 ${playlist.subtitle}. Spotify ne fournit plus d'extraits : chaque morceau est
               retrouve chez Deezer par son identifiant international, ce qui explique l'ecart.`}
        </p>
      )}

      {isYoutube && (
        <p className={styles.note} style={{ marginTop: 12 }}>
          {playlist?.pending
            ? '⏳ Le lecteur parcourt la playlist…'
            : `▶️ ${playlist?.total} videos pretes. Les titres viennent de YouTube : ils sont moins
               propres que ceux de Deezer, le mode buzzer est souvent plus confortable. Le son ne
               peut pas etre diffuse sur les telephones dans ce mode.`}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reglages                                                           */
/* ------------------------------------------------------------------ */

function SettingsPanel({ settings, send, askArtist }: { settings: Settings; send: Send; askArtist: boolean }) {
  const patch = (p: Partial<Settings>) => send('host:settings', p);

  const sliders: { key: keyof Settings; label: string; min: number; max: number; format: (v: number) => string }[] = [
    { key: 'rounds', label: 'Nombre de manches', min: 3, max: 30, format: (v) => String(v) },
    { key: 'clip', label: "Duree d'ecoute", min: 5, max: 30, format: (v) => `${v} s` },
    // Le bonus de rapidite ne sert qu'en reponse libre, le delai de buzz qu'au buzzer.
    ...(settings.mode === 'buzzer'
      ? [
          { key: 'buzzDelay' as const, label: 'Delai avant buzz', min: 0, max: 15, format: (v: number) => `${v} s` },
          { key: 'buzzAnswerTime' as const, label: 'Temps pour repondre', min: 3, max: 30, format: (v: number) => `${v} s` },
        ]
      : [{ key: 'speedBonus' as const, label: 'Bonus de rapidite', min: 0, max: 6, format: (v: number) => String(v) }]),
    { key: 'revealDelay', label: "Temps d'affichage de la reponse", min: 4, max: 20, format: (v) => `${v} s` },
  ];

  const notes: Partial<Record<keyof Settings, string>> = {
    clip: 'Les extraits Deezer durent 30 s maximum.',
    speedBonus: 'Points supplementaires max, degressifs pendant l\'extrait.',
    buzzDelay: 'Secondes d\'ecoute imposees avant d\'ouvrir le buzzer : evite le buzz reflexe des la premiere note.',
    buzzAnswerTime: 'Passe ce delai sans arbitrage, la reponse est comptee ratee et la musique repart.',
  };

  return (
    <section className="card pad col" style={{ gap: 16 }}>
      <div className="section-title">Reglages</div>
      <div className={styles.settings}>
        <div className={styles.setting}>
          <div className={styles.lab}><b>Mode de jeu</b></div>
          <div className="seg" role="group">
            {(['input', 'buzzer'] as const).map((mode) => (
              <button key={mode} type="button" data-testid={`mode-${mode}`} aria-pressed={settings.mode === mode} onClick={() => patch({ mode })}>
                {mode === 'input' ? '⌨️ Reponse libre' : '🔔 Buzzer'}
              </button>
            ))}
          </div>
          <p className={styles.note}>{MODE_NOTE[settings.mode]}</p>
        </div>

        {sliders.map((s) => (
          <div key={s.key} className={styles.setting}>
            <div className={styles.lab}><span>{s.label}</span><b>{s.format(settings[s.key] as number)}</b></div>
            <input
              type="range" data-testid={`setting-${s.key}`} min={s.min} max={s.max} value={settings[s.key] as number}
              onChange={(e) => patch({ [s.key]: Number(e.target.value) } as Partial<Settings>)}
            />
            {notes[s.key] && <p className={styles.note}>{notes[s.key]}</p>}
          </div>
        ))}

        <div className={styles.setting}>
          <div className={styles.lab}><b>Options</b></div>
          <label className="switch">
            <input
              type="checkbox" checked={settings.guessArtist && askArtist} disabled={!askArtist}
              onChange={(e) => patch({ guessArtist: e.target.checked })}
            />
            <span className="track" /><span style={{ fontSize: 13.5 }}>Demander aussi l&apos;artiste</span>
          </label>
          {!askArtist && (
            <p className={styles.note}>
              Sans objet ici : toute la partie porte sur le meme artiste, seul le titre compte.
            </p>
          )}
          <label className="switch">
            <input type="checkbox" checked={settings.autoNext} onChange={(e) => patch({ autoNext: e.target.checked })} />
            <span className="track" /><span style={{ fontSize: 13.5 }}>Enchainer les manches tout seul</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={settings.playerAudio} onChange={(e) => patch({ playerAudio: e.target.checked })} />
            <span className="track" /><span style={{ fontSize: 13.5 }}>Son aussi sur les telephones</span>
          </label>
          <p className={styles.note}>
            Indispensable a distance (visio, joueurs eparpilles). Dans une meme piece, laisse
            plutot ferme : une dizaine de telephones legerement decales font de la bouillie.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Barre de commande                                                  */
/* ------------------------------------------------------------------ */

function Controls({ state, send, unlockAudio, answerLeft }: {
  state: GameState; send: Send; unlockAudio: () => void; answerLeft: number;
}) {
  let content: React.ReactNode;

  if (state.phase === 'lobby') {
    const loaded = Boolean(state.playlist) && !state.playlist!.pending && state.playlist!.total > 0;
    const ready = loaded && state.counts.connected > 0;
    const why = !state.playlist
      ? 'Choisis une liste de morceaux'
      : !loaded ? 'Playlist en cours de chargement…'
      : state.counts.connected === 0 ? 'Attends au moins un joueur'
      : null;
    content = (
      <>
        <div className="grow muted" style={{ fontSize: 13.5 }}>
          {state.playlist
            ? `${state.playlist.emoji} ${state.playlist.title} · ${state.settings.rounds} manches · ${state.settings.clip} s`
            : 'Aucune liste selectionnee'}
        </div>
        {why && <span className="pill">{why}</span>}
        <button
          className="btn primary lg" disabled={!ready} data-testid="primary-action"
          onClick={() => { sfx.unlock(); if (state.audioTarget === 'host') unlockAudio(); void send('host:start'); }}
        >▶ Lancer la partie</button>
      </>
    );
  } else if (state.phase === 'buzzed') {
    content = (
      <>
        <div className="grow muted" style={{ fontSize: 13.5 }}>
          Reponse attendue : {state.round?.track?.title} — {state.round?.track?.artist}
        </div>
        {state.round?.answerDeadline && (
          <span className="pill" style={answerLeft <= 3 ? { color: '#ffc0c0', borderColor: 'rgba(251,93,93,.5)' } : undefined}>
            ⏳ {answerLeft} s — sans arbitrage, la manche repart
          </span>
        )}
        <button className="btn danger lg" data-testid="judge-bad" onClick={() => send('host:judge', { ok: false })}>❌ Mauvaise reponse</button>
        <button className="btn good lg" data-testid="judge-good" onClick={() => send('host:judge', { ok: true })}>
          ✅ Bonne reponse (+{state.settings.buzzerPoints})
        </button>
      </>
    );
  } else if (state.phase === 'ended') {
    content = (
      <>
        <div className="grow muted" style={{ fontSize: 13.5 }}>
          Partie terminee — {state.leaderboard[0]?.name ?? '—'} gagne avec {state.leaderboard[0]?.score ?? 0} points
        </div>
        <button className="btn primary lg" data-testid="primary-action" onClick={() => send('host:lobby')}>↩ Nouvelle partie</button>
      </>
    );
  } else {
    const round = state.round!;
    const isReveal = state.phase === 'reveal' || state.phase === 'scores';
    content = (
      <>
        <div className="grow muted" style={{ fontSize: 13.5 }}>Manche {round.index + 1} / {round.total}</div>
        <button
          className="btn sm"
          onClick={() => { if (confirm('Arreter la partie et revenir au salon ?')) void send('host:lobby'); }}
        >↩ Retour au salon</button>
        {!isReveal && <button className="btn" data-testid="reveal" onClick={() => send('host:reveal')}>👁 Reveler maintenant</button>}
        <button className="btn primary" data-testid="primary-action" onClick={() => send('host:next')}>
          {round.index + 1 >= round.total ? '🏁 Terminer' : '⏭ Manche suivante'}
        </button>
      </>
    );
  }

  return <div className={styles.controls}><div className={styles.inner}>{content}</div></div>;
}

/* ------------------------------------------------------------------ */

function useKeyboardShortcuts(state: GameState | null, send: Send) {
  const ref = useRef({ state, send });
  ref.current = { state, send };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const { state: s, send: emit } = ref.current;
      if (!s) return;

      if (s.phase === 'buzzed') {
        if (e.key === 'o' || e.key === 'Enter') void emit('host:judge', { ok: true });
        if (e.key === 'n' || e.key === 'Escape') void emit('host:judge', { ok: false });
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (s.phase === 'lobby') void emit('host:start');
        else void emit('host:next');
      }
      if (e.key === 'r' && s.phase === 'playing') void emit('host:reveal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
