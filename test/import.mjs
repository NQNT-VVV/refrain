/**
 * Imports de playlists : Spotify (meme sans identifiants), YouTube lu par le
 * serveur, Deezer pagine. Reseau reel : Deezer, Spotify et YouTube publics.
 */
import { io } from 'socket.io-client';
const U = process.env.TARGET || 'http://localhost:3000';
const call = (s, ev, p, t = 200000) => new Promise((res) => { s.emit(ev, p, res); setTimeout(() => res({ ok: false, error: 'delai depasse' }), t); });
const mk = () => io(U, { transports: ['websocket'] });
const ready = (s) => new Promise((r) => s.on('connect', r));
const fails = [];
const check = (l, c, x = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${l}${x ? ` — ${x}` : ''}`); if (!c) fails.push(l); };

const host = mk(); await ready(host);
let st = null; host.on('state', (s) => { st = s; });
const { code } = await call(host, 'host:create');

// « All Out 80s » : 150 titres, 30 artistes environ. L'ancien plafond de quatre
// titres par artiste en gardait a peine la moitie.
const sp = await call(host, 'host:playlist', { type: 'spotify', id: 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe' });
check('playlist Spotify editoriale importee', sp.ok, sp.ok ? `${sp.playlist.total} titres` : sp.error);
check('la quasi-totalite des titres lus est jouable', sp.ok && sp.playlist.total >= 90, String(sp.playlist?.total));

// Les 100 classiques du rap francais
const yt = await call(host, 'host:playlist', { type: 'youtube', id: 'https://www.youtube.com/playlist?list=PL43DjR6QvKGFVjTXj3oAzWHzAlybXaLr4' });
await new Promise((r) => setTimeout(r, 800));   // l'etat part juste apres la reponse
check('playlist YouTube lue par le serveur, sans ecran connecte', yt.ok, yt.ok ? `${yt.playlist.total} titres` : yt.error);
check('elle n\'attend pas le lecteur', st?.playlist && !st.playlist.pending, st?.playlist?.subtitle);
check('la majorite passe par Deezer', /via Deezer|tous retrouvés/.test(st?.playlist?.subtitle || ''), st?.playlist?.subtitle);

// Une playlist privee ou un mix genere, sans ecran : message clair
const bad = await call(host, 'host:playlist', { type: 'youtube', id: 'https://www.youtube.com/watch?v=x&list=RDCLAK5uy_k8ZWUt0R4nW1IY5PaP7RYTNMtWBnTZfqY' });
check('mix illisible sans ecran : erreur explicite', !bad.ok && /publique/.test(bad.error || ''), bad.error);

console.log(fails.length ? `\n❌ ${fails.join(' | ')}` : '\n✅ Imports conformes');
host.close();
process.exit(fails.length ? 1 : 0);
