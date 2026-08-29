import Link from 'next/link';
import type { Metadata } from 'next';

import { Brand } from '@/components/Brand';
import { SupportNote } from '@/components/SupportNote';
import styles from './tuto.module.css';

export const metadata: Metadata = {
  title: 'Comment ca marche',
  description: 'Prendre en main Refrain en trois minutes : animer une partie, rejoindre, marquer des points.',
};

const STEPS = [
  {
    title: 'Ouvre la regie',
    body: <>Va sur <code>/host</code>. Un salon se cree tout seul, avec un code a quatre lettres et un QR code.</>,
  },
  {
    title: 'Branche l’ecran',
    body: <>Ouvre <code>/screen</code> sur l’ecran que tout le monde voit, puis clique une fois pour autoriser le son. Pas d’ecran separe&nbsp;? Bascule la sortie du son sur «&nbsp;Ici&nbsp;».</>,
  },
  {
    title: 'Fais entrer le monde',
    body: <>Chacun scanne le QR code, ou tape le code sur la page d’accueil. Telephone ou ordinateur, peu importe.</>,
  },
  {
    title: 'Choisis et lance',
    body: <>Une liste, deux ou trois reglages, et <b>Lancer la partie</b>. Les manches s’enchainent toutes seules.</>,
  },
];

export default function TutoPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <Brand />
        <span className={styles.spacer} />
        <Link className="btn sm" href="/">← Accueil</Link>
      </div>

      <header className={styles.hero}>
        <h1>Comment ca marche</h1>
        <p>
          Un animateur lance la musique, tout le monde repond depuis son appareil. Pas de compte,
          pas d&apos;installation : un code a quatre lettres suffit. Voila l&apos;essentiel en trois minutes.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Demarrer une partie</h2>
        <div className={styles.steps}>
          {STEPS.map((step, i) => (
            <div key={step.title} className={styles.step}>
              <span className={styles.num}>{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
        <div className={styles.tip}>
          <span className={styles.mark}>💡</span>
          <span>
            La regie garde ton salon meme si tu rafraichis la page. Un joueur qui perd le reseau
            retrouve son score en revenant : rien n&apos;est perdu.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Les deux modes</h2>
        <div className={styles.cards}>
          <div className={styles.card2}>
            <span className={styles.icon}>⌨️</span>
            <h3>Reponse libre</h3>
            <p>
              Tout le monde tape le titre et l&apos;artiste. La correction est automatique et
              <b> indulgente</b> : accents, majuscules, fautes de frappe et mentions «&nbsp;feat.&nbsp;»
              sont pardonnes. «&nbsp;jackson&nbsp;» compte pour Michael Jackson, «&nbsp;bohemian
              rapsodie&nbsp;» pour Bohemian Rhapsody.
            </p>
            <ul>
              <li>Un champ trouve se verrouille en vert, on continue a chercher l&apos;autre.</li>
              <li>Revalider ne coute rien : seule la date du premier succes compte.</li>
              <li>La manche s&apos;arrete des que tout le monde a tout trouve.</li>
            </ul>
          </div>

          <div className={styles.card2}>
            <span className={styles.icon}>🔔</span>
            <h3>Buzzer</h3>
            <p>
              Le premier qui appuie coupe la musique, son nom s&apos;affiche en grand, il repond
              a voix haute et l&apos;animateur tranche.
            </p>
            <ul>
              <li><b>Delai avant buzz</b> : le buzzer reste ferme quelques secondes, pour ne pas gagner au reflexe.</li>
              <li><b>Temps pour repondre</b> : sans arbitrage a l&apos;expiration, c&apos;est compte rate, la musique repart et les autres peuvent tenter.</li>
              <li>Une mauvaise reponse bloque son auteur pour le reste de la manche.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Les points</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>En reponse libre</th><th>Points</th></tr>
            </thead>
            <tbody>
              <tr><td>Titre trouve</td><td>3</td></tr>
              <tr><td>Artiste trouve</td><td>3</td></tr>
              <tr><td>Bonus de rapidite, par champ</td><td>jusqu&apos;a 2</td></tr>
              <tr><td><b>Maximum sur une manche</b></td><td><b>10</b></td></tr>
            </tbody>
          </table>
        </div>
        <div className={styles.tip}>
          <span className={styles.mark}>⏱️</span>
          <span>
            Le bonus fond pendant l&apos;extrait : trouver a la deuxieme seconde rapporte plus qu&apos;a
            la vingtieme. Au buzzer, une bonne reponse vaut un forfait fixe, reglable en regie.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Ou trouver les morceaux</h2>
        <div className={styles.cards}>
          <div className={styles.card2}>
            <span className={styles.icon}>🎧</span>
            <h3>23 listes pretes</h3>
            <p>
              Top du moment, annees 80 a 2010, rap FR, chanson francaise, rock, disco, dancefloor,
              films et series, Disney, jeux video, TikTok, K-pop, afro, punk, metal, classique…
              Elles se construisent toutes seules et se rafraichissent.
            </p>
          </div>
          <div className={styles.card2}>
            <span className={styles.icon}>🎤</span>
            <h3>Un seul artiste</h3>
            <p>
              Toute la partie sur un artiste, avec trois profondeurs : ses
              <b> classiques</b>, sa discographie <b>au hasard</b>, ou seulement ce que le grand
              public ignore — le mode <b>«&nbsp;t&apos;es un vrai fan&nbsp;?&nbsp;»</b>.
            </p>
            <ul>
              <li>L&apos;artiste n&apos;est pas demande — toute la partie porte sur lui, seul le titre compte.</li>
              <li>Une case decide d&apos;inclure ou non ses featurings et ses passages invite.</li>
              <li>Intros et interludes sont ecartes, les doublons fusionnes.</li>
              <li>La frontiere tube / rarete suit la popularite reelle des morceaux.</li>
            </ul>
          </div>

          <div className={styles.card2}>
            <span className={styles.icon}>📥</span>
            <h3>Tes propres listes</h3>
            <p>
              Cherche des titres un par un pour composer ta selection, ou colle une playlist
              <b> Deezer</b>, <b>YouTube</b> ou <b>Spotify</b> — le type est reconnu tout seul.
            </p>
            <ul>
              <li>Sur YouTube, les titres sont ceux des videos : moins nets, souvent sans nom d&apos;artiste.</li>
              <li>Quand le titre ne nomme personne, l&apos;artiste n&apos;est pas demande et seul le titre compte.</li>
              <li>Le mode buzzer est plus confortable sur ces listes.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Diffuser en stream</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, maxWidth: '62ch' }}>
          La regie fournit un <b>lien pour OBS</b> : a coller dans une source navigateur
          1920×1080. Le code de la partie reste affiche en permanence pour les viewers qui
          arrivent en cours, les commandes disparaissent de la capture, et tu choisis de quel
          cote va le classement pour laisser la place a ta webcam.
        </p>
        <div className={styles.tip}>
          <span className={styles.mark}>⏸</span>
          <span>
            Coupure pub, souci technique&nbsp;? La <b>pause</b> fige le chrono et le son la ou ils
            en sont, et la reprise repart exactement de la.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Le son</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, maxWidth: '62ch' }}>
          Par defaut, la musique sort <b>uniquement sur l&apos;ecran de diffusion</b> — c&apos;est ce
          qu&apos;on veut dans un salon : une seule source, tout le monde entend la meme chose au
          meme moment.
        </p>
        <div className={styles.tip}>
          <span className={styles.mark}>📱</span>
          <span>
            Pour jouer <b>a distance</b> (visio, joueurs eparpilles), active «&nbsp;Son aussi sur les
            telephones&nbsp;» dans les reglages : chaque appareil joue l&apos;extrait, cale sur la meme
            horloge. Chacun garde son propre reglage de volume.
          </span>
        </div>
        <div className={`${styles.tip} ${styles.warn}`}>
          <span className={styles.mark}>⚠️</span>
          <span>
            Dans une <b>meme piece</b>, laisse cette option fermee : une dizaine d&apos;appareils a
            quelques dizaines de millisecondes d&apos;ecart font de la bouillie.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Raccourcis de la regie</h2>
        <div className={styles.keys}>
          <span><kbd>Espace</kbd> lancer / manche suivante</span>
          <span><kbd>P</kbd> pause / reprise</span>
          <span><kbd>R</kbd> reveler la reponse</span>
          <span><kbd>O</kbd> ou <kbd>Entree</kbd> valider un buzz</span>
          <span><kbd>N</kbd> ou <kbd>Echap</kbd> refuser un buzz</span>
        </div>
        <div className={styles.tip}>
          <span className={styles.mark}>🙈</span>
          <span>
            Le bouton <b>Masquer</b> floute le morceau en cours et les manches a venir, si des
            joueurs peuvent voir ton ecran de regie.
          </span>
        </div>
      </section>

      <div className={styles.cta}>
        <Link className="btn primary lg" href="/host">Creer une partie</Link>
        <Link className="btn lg" href="/">Rejoindre une partie</Link>
      </div>

      <SupportNote className={styles.footer} />
    </div>
  );
}
