/** Verifie le pont Spotify -> Deezer sur une playlist donnee. */
import { io } from 'socket.io-client';
const U = process.env.TARGET || 'http://localhost:3000';
const LIST = process.env.LIST;
const call = (s, ev, p, t) => new Promise((res) => { s.emit(ev, p, res); setTimeout(() => res({ ok:false, error:'delai depasse' }), t || 200000); });
const s = io(U, { transports: ['websocket'] });
await new Promise(r => s.on('connect', r));
let st = null; s.on('state', (v) => { st = v; });
const { code } = await call(s, 'host:create');
console.log('salon', code, '| essai :', LIST);
const res = await call(s, 'host:playlist', { type: 'spotify', id: LIST }, 200000);
if (res.ok) console.log('✅', res.playlist.title, '—', res.playlist.total, 'titres jouables');
else console.log('❌', res.error);
if (st?.playlist) console.log('   etat :', st.playlist.emoji, st.playlist.title, '|', st.playlist.subtitle);
s.close(); process.exit(res.ok ? 0 : 1);
