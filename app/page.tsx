import Link from 'next/link';

import { Brand } from '@/components/Brand';
import { JoinForm } from '@/components/JoinForm';
import { SupportNote } from '@/components/SupportNote';
import styles from './page.module.css';

const FEATURES = [
  { n: '0x01', title: '17 listes pretes', text: 'Top du moment, annees 80/90/2000, rap FR, Disney, jeux video, metal, hymnes de soiree.' },
  { n: '0x02', title: 'Reponse libre ou buzzer', text: 'Tout le monde tape titre et artiste avec bonus de rapidite, ou premier au buzzer valide par l’animateur.' },
  { n: '0x03', title: 'Ecran de projection', text: 'Une page plein ecran a projeter, partager en visio ou capturer dans OBS.' },
  { n: '0x04', title: 'Correction indulgente', text: 'Accents, fautes de frappe et mentions « feat. » sont pardonnes automatiquement.' },
];

export default function HomePage() {
  return (
    <div className={styles.wrap}>
      <div className="bar">
        <Brand href={null} />
        <span className="spacer" />
        <span>EXTRAITS DE 30 S · AUCUN COMPTE REQUIS</span>
        <Link className="btn sm" href="/tuto">COMMENT CA MARCHE</Link>
      </div>

      <header className={styles.hero}>
        <div className={styles.kicker}>
          <span>BLIND TEST MULTIJOUEUR</span>
          <span>REGIE · ECRAN · TELEPHONE</span>
          <span>ETAT : PRET</span>
        </div>
        <h1>REFRAIN</h1>
        <p>LE BLIND TEST OU TOUT LE MONDE REPREND EN CHOEUR. UN ANIMATEUR, UN ECRAN, ET LA SALLE QUI REPOND DEPUIS SON TELEPHONE.</p>
      </header>

      <main className={styles.choices}>
        <section className={`card ${styles.choice}`}>
          <div className={styles.num}>0x01</div>
          <h2>J’ANIME LA PARTIE</h2>
          <p className={styles.lead}>
            Cree un salon, choisis tes listes, invite tes joueurs avec un QR code et pilote les manches.
            Un ecran separe est disponible pour la projection ou le stream.
          </p>
          <Link className="btn primary lg block" href="/host">CREER UNE PARTIE</Link>
        </section>

        <section className={`card ${styles.choice}`}>
          <div className={styles.num}>0x02</div>
          <h2>JE REJOINS</h2>
          <p className={styles.lead}>Saisis le code affiche a l’ecran, choisis ton pseudo, et c’est parti.</p>
          <JoinForm className="col" />
        </section>
      </main>

      <section className={styles.solo} aria-label="Modes solo">
        <div className={`card ${styles.daily}`}>
          <div className={styles.dailyText}>
            <span className="meta">OFFICE DU JOUR</span>
            <h2>MUSIQUE DU JOUR</h2>
            <p className={styles.lead}>
              Un morceau, le meme pour tout le monde, et six ecoutes de plus en plus longues pour le retrouver.
              Une partie par jour.
            </p>
          </div>
          <Link className="btn lg" href="/daily">JOUER AUJOURD’HUI</Link>
        </div>
        <div className={`card ${styles.daily}`}>
          <div className={styles.dailyText}>
            <span className="meta">OFFICE DE LA SEMAINE</span>
            <h2>PLAYLIST DE LA SEMAINE</h2>
            <p className={styles.lead}>
              Cinq morceaux a la suite, six ecoutes chacun, le score s’additionne. Une seule tentative
              par semaine : la meme playlist pour tout le monde jusqu’a dimanche.
            </p>
          </div>
          <Link className="btn lg" href="/weekly">JOUER CETTE SEMAINE</Link>
        </div>
      </section>

      <section className={styles.feats}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.feat}>
            <span className="meta">{f.n}</span>
            <b>{f.title}</b>
            <span className={styles.featText}>{f.text}</span>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>Deja anime une partie ? <Link href="/host">Reprendre la regie</Link> · le lien retrouve ton salon en cours.</p>
        <SupportNote className={styles.support} />
      </footer>
    </div>
  );
}
