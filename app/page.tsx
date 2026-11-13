import Link from 'next/link';
import type { CSSProperties } from 'react';

import { Brand } from '@/components/Brand';
import { Cassette } from '@/components/Cassette';
import { JoinForm } from '@/components/JoinForm';
import { SupportNote } from '@/components/SupportNote';
import styles from './page.module.css';

const FEATURES = [
  { title: '17 listes prêtes', text: 'Top du moment, années 80/90/2000, rap FR, Disney, jeux vidéo, metal, hymnes de soirée.' },
  { title: 'Réponse libre ou buzzer', text: 'Tout le monde tape titre et artiste avec bonus de rapidité, ou premier au buzzer validé par l’animateur.' },
  { title: 'Écran de projection', text: 'Une page plein écran à projeter, partager en visio ou capturer dans OBS.' },
  { title: 'Correction indulgente', text: 'Accents, fautes de frappe et mentions « feat. » sont pardonnés automatiquement.' },
];

const TITLE = ['Le', 'blind', 'test', 'où', 'tout', 'le', 'monde', 'reprend', 'en', 'chœur.'];
const LISTS = ['Top du moment', 'Années 80', 'Années 90', 'Années 2000', 'Rap FR', 'Disney', 'Jeux vidéo', 'Metal', 'Hymnes de soirée'];
const COVERS = ['#221E1A', '#1F4E46', '#D9A074', '#F2C230', '#C8442B'];

/** Decale l'entree en scene d'un element : voir `.rise`, `.pop` et `.words` dans le socle. */
const step = (i: number) => ({ '--i': i }) as CSSProperties;

export default function HomePage() {
  const band = LISTS.join(' · ') + ' · ';
  return (
    <div className={styles.wrap}>
      <div className={`bar ${styles.top}`}>
        <Brand href={null} />
        <span className="spacer" />
        <Link className="btn sm" href="/tuto">Comment ça marche</Link>
      </div>

      <header className={styles.hero}>
        <div className={styles.pitch}>
          <span className={`hand rise ${styles.kicker}`}>blind test multijoueur</span>
          <h1 className={`words ${styles.title}`} aria-label={TITLE.join(' ')}>
            {TITLE.map((word, i) => (
              <span key={i} aria-hidden="true">
                <span className={i >= 8 ? styles.hot : undefined} style={step(i)}>{word}</span>
              </span>
            ))}
          </h1>
          <svg className={styles.stroke} viewBox="0 0 300 22" aria-hidden="true">
            <path d="M4 14 C 60 2, 110 20, 160 10 S 250 4, 296 13" />
          </svg>
          <p className={`rise ${styles.sub}`} style={step(9)}>
            Un animateur, un écran, et la salle qui répond depuis son téléphone. Extraits de 30 s, aucun compte requis.
          </p>
          <div className={`rise ${styles.cta}`} style={step(11)}>
            <Link className="btn primary lg" href="/host">Créer une partie</Link>
            <a className="btn lg" href="#rejoindre">J’ai un code</a>
          </div>
        </div>

        <div className={styles.stage} aria-hidden="true">
          <span className={`eq pop ${styles.eq}`} style={step(6)}><i /><i /><i /><i /><i /></span>
          <div className={`pop ${styles.tape}`} style={step(3)}>
            <div className={styles.tapeFloat}>
              <Cassette className={styles.k7} side="face A · 30 s" />
            </div>
          </div>
          <span className={`hand pop ${styles.note} ${styles.noteA}`} style={step(7)}>30 s par extrait</span>
          <span className={`hand pop ${styles.note} ${styles.noteB}`} style={step(9)}>aucun compte requis</span>
          <span className={`pop ${styles.buzz}`} style={step(8)}><i>Buzz</i></span>
        </div>
      </header>

      <div className={styles.band} aria-hidden="true">
        <div>{band}{band}</div>
      </div>

      <main className={styles.choices}>
        <section className={`on-scroll ${styles.choice} ${styles.host}`}>
          <span className={`hand ${styles.tag}`}>pour l’animateur</span>
          <h2>J’anime la partie</h2>
          <p className={styles.lead}>
            Crée un salon, choisis tes listes, invite tes joueurs avec un QR code et pilote les manches.
            Un écran séparé est disponible pour la projection ou le stream.
          </p>
          <Link className={`btn lg block ${styles.gold}`} href="/host">Créer une partie</Link>
        </section>

        <section id="rejoindre" className={`on-scroll ${styles.choice} ${styles.join}`}>
          <span className={`hand ${styles.tag}`}>pour les joueurs</span>
          <h2>Je rejoins</h2>
          <p className={styles.lead}>Saisis le code affiché à l’écran, choisis ton pseudo, et c’est parti.</p>
          <JoinForm className="col" />
        </section>
      </main>

      <section className={styles.solo} aria-label="Modes solo">
        <div className={`spins on-scroll ${styles.soloCard}`}>
          <div className={styles.deck}><span className="vinyl" /><i className={styles.arm} /></div>
          <div className={styles.soloText}>
            <span className="meta">Défi du jour</span>
            <h2>Musique du jour</h2>
            <p className={styles.lead}>
              Un morceau, le même pour tout le monde, et six écoutes de plus en plus longues pour le retrouver.
              Une partie par jour.
            </p>
            <Link className="btn" href="/daily">Jouer aujourd’hui</Link>
          </div>
        </div>
        <div className={`on-scroll ${styles.soloCard}`}>
          <div className={styles.stack}>
            {COVERS.map((color, i) => <i key={color} style={{ background: color, ...step(i) }} />)}
          </div>
          <div className={styles.soloText}>
            <span className="meta">Défi de la semaine</span>
            <h2>Playlist de la semaine</h2>
            <p className={styles.lead}>
              Cinq morceaux à la suite, six écoutes chacun, le score s’additionne. Une seule tentative
              par semaine : la même playlist pour tout le monde jusqu’à dimanche.
            </p>
            <Link className="btn" href="/weekly">Jouer cette semaine</Link>
          </div>
        </div>
      </section>

      <section className={styles.feats}>
        {FEATURES.map((f, i) => (
          <div key={f.title} className={`on-scroll ${styles.feat}`}>
            <span className={styles.num}>{i + 1}</span>
            <b>{f.title}</b>
            <span className={styles.featText}>{f.text}</span>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>Déjà animé une partie ? <Link href="/host">Reprendre la régie</Link> · le lien retrouve ton salon en cours.</p>
        <SupportNote className={styles.support} />
      </footer>
    </div>
  );
}
