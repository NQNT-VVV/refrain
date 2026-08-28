import Link from 'next/link';

import { JoinForm } from '@/components/JoinForm';
import styles from './page.module.css';

const FEATURES = [
  { title: '🎧 17 listes pretes', text: 'Top du moment, annees 80/90/2000, rap FR, Disney, jeux video, metal, hymnes de soiree…' },
  { title: '⚡ Reponse libre ou buzzer', text: 'Tout le monde tape titre + artiste avec bonus de rapidite, ou premier au buzzer valide par l\'animateur.' },
  { title: '📺 Ecran streamable', text: 'Une page plein ecran a projeter, partager en visio ou capturer dans OBS.' },
  { title: '🔤 Correction indulgente', text: 'Accents, fautes de frappe et mentions « feat. » sont pardonnes automatiquement.' },
];

export default function HomePage() {
  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <span className={`pill ${styles.badge}`}>
          <span className="dot" /> Extraits de 30 s • aucun compte requis
        </span>
        <h1>Refrain</h1>
        <p>
          Le blind test ou tout le monde reprend en choeur. Un animateur, un ecran, et la salle qui
          repond depuis son telephone.
        </p>
      </header>

      <main className={styles.choices}>
        <section className={`card ${styles.choice}`}>
          <div className={styles.icon}>🎛️</div>
          <h2>J&apos;anime la partie</h2>
          <p className={styles.lead}>
            Cree un salon, choisis tes listes de morceaux, invite tes joueurs avec un QR code et
            pilote les manches. Un ecran separe est disponible pour la projection ou le stream.
          </p>
          <Link className="btn primary lg block" href="/host">Creer une partie</Link>
        </section>

        <section className={`card ${styles.choice} ${styles.join}`}>
          <div className={styles.icon}>📱</div>
          <h2>Je rejoins</h2>
          <p className={styles.lead}>
            Saisis le code affiche a l&apos;ecran, choisis ton pseudo, et c&apos;est parti.
          </p>
          <JoinForm className="col" inputClassName={styles.codeInput} />
        </section>
      </main>

      <section className={styles.feats}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.feat}>
            <b>{f.title}</b>
            <span>{f.text}</span>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        Deja anime une partie ? <Link href="/host">Reprendre la regie</Link> — le lien retrouve ton salon en cours.
      </footer>
    </div>
  );
}
