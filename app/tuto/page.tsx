import Link from 'next/link';
import type { Metadata } from 'next';

import { Icon } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import { SupportNote } from '@/components/SupportNote';
import styles from './tuto.module.css';

export const metadata: Metadata = {
  title: 'Comment ça marche',
  description: 'Prendre en main Refrain en trois minutes : animer une partie, rejoindre, marquer des points.',
};

const STEPS = [
  {
    title: 'Ouvre la régie',
    body: <>Va sur <code>/host</code>. Un salon se crée tout seul, avec un code à quatre lettres et un QR code.</>,
  },
  {
    title: 'Branche l’écran',
    body: <>Ouvre <code>/screen</code> sur l’écran que tout le monde voit, puis clique une fois pour autoriser le son. Pas d’écran séparé&nbsp;? Bascule la sortie du son sur «&nbsp;Ici&nbsp;».</>,
  },
  {
    title: 'Fais entrer le monde',
    body: <>Chacun scanne le QR code, ou tape le code sur la page d’accueil. Téléphone ou ordinateur, peu importe.</>,
  },
  {
    title: 'Choisis et lance',
    body: <>Une liste, deux ou trois réglages, et <b>Lancer la partie</b>. Les manches s’enchaînent toutes seules.</>,
  },
];

export default function TutoPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <Brand />
        <span className={styles.spacer} />
        <Link className="btn sm" href="/"><Icon name="precedent" />Accueil</Link>
      </div>

      <header className={styles.hero}>
        <h1>Comment ça marche</h1>
        <p>
          Un animateur lance la musique, tout le monde répond depuis son appareil. Pas de compte,
          pas d’installation : un code à quatre lettres suffit. Voilà l’essentiel en trois minutes.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Démarrer une partie</h2>
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
          <span>
            La régie garde ton salon même si tu rafraîchis la page. Un joueur qui perd le réseau
            retrouve son score en revenant : rien n’est perdu.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Les deux modes</h2>
        <div className={styles.cards}>
          <div className={styles.card2}>
            <h3>Réponse libre</h3>
            <p>
              Tout le monde tape le titre et l’artiste. La correction est automatique et
              <b> indulgente</b> : accents, majuscules, fautes de frappe et mentions «&nbsp;feat.&nbsp;»
              sont pardonnés. «&nbsp;jackson&nbsp;» compte pour Michael Jackson, «&nbsp;bohemian
              rapsodie&nbsp;» pour Bohemian Rhapsody.
            </p>
            <ul>
              <li>Un champ trouvé se verrouille en vert, on continue à chercher l’autre.</li>
              <li>Revalider ne coûte rien : seule la date du premier succès compte.</li>
              <li>La manche s’arrête dès que tout le monde a tout trouvé.</li>
            </ul>
          </div>

          <div className={styles.card2}>
            <h3>Buzzer</h3>
            <p>
              Le premier qui appuie coupe la musique, son nom s’affiche en grand, il répond
              à voix haute et l’animateur tranche.
            </p>
            <ul>
              <li><b>Délai avant buzz</b> : le buzzer reste fermé quelques secondes, pour ne pas gagner au réflexe.</li>
              <li><b>Temps pour répondre</b> : sans arbitrage à l’expiration, c’est compté raté, la musique repart et les autres peuvent tenter.</li>
              <li>Une mauvaise réponse bloque son auteur pour le reste de la manche.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Les points</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>En réponse libre</th><th>Points</th></tr>
            </thead>
            <tbody>
              <tr><td>Titre trouvé</td><td>3</td></tr>
              <tr><td>Artiste trouvé</td><td>3</td></tr>
              <tr><td>Bonus de rapidité, par champ</td><td>jusqu’à 2</td></tr>
              <tr><td><b>Maximum sur une manche</b></td><td><b>10</b></td></tr>
            </tbody>
          </table>
        </div>
        <div className={styles.tip}>
          <span>
            Le bonus fond pendant l’extrait : trouver à la deuxième seconde rapporte plus qu’à
            la vingtième. Au buzzer, une bonne réponse vaut un forfait fixe, réglable en régie.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Où trouver les morceaux</h2>
        <div className={styles.cards}>
          <div className={styles.card2}>
            <h3>23 listes prêtes</h3>
            <p>
              Top du moment, années 80 à 2010, rap FR, chanson française, rock, disco, dancefloor,
              films et séries, Disney, jeux vidéo, TikTok, K-pop, afro, punk, metal, classique…
              Elles se construisent toutes seules et se rafraîchissent.
            </p>
          </div>
          <div className={styles.card2}>
            <h3>Un seul artiste</h3>
            <p>
              Toute la partie sur un artiste, avec trois profondeurs : ses
              <b> classiques</b>, sa discographie <b>au hasard</b>, ou seulement ce que le grand
              public ignore — le mode <b>«&nbsp;t’es un vrai fan&nbsp;?&nbsp;»</b>.
            </p>
            <ul>
              <li>L’artiste n’est pas demandé — toute la partie porte sur lui, seul le titre compte.</li>
              <li>Une case décide d’inclure ou non ses featurings et ses passages invité.</li>
              <li>Intros et interludes sont écartés, les doublons fusionnés.</li>
              <li>La frontière tube / rareté suit la popularité réelle des morceaux.</li>
            </ul>
          </div>

          <div className={styles.card2}>
            <h3>Tes propres listes</h3>
            <p>
              Cherche des titres un par un pour composer ta sélection, ou colle une playlist
              <b> Deezer</b>, <b>YouTube</b> ou <b>Spotify</b> — le type est reconnu tout seul.
            </p>
            <ul>
              <li>Sur YouTube, les titres sont ceux des vidéos : moins nets, souvent sans nom d’artiste.</li>
              <li>Quand le titre ne nomme personne, l’artiste n’est pas demandé et seul le titre compte.</li>
              <li>Le mode buzzer est plus confortable sur ces listes.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Diffuser en stream</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, maxWidth: '62ch' }}>
          La régie fournit un <b>lien pour OBS</b> : à coller dans une source navigateur
          1920×1080. Le code de la partie reste affiché en permanence pour les viewers qui
          arrivent en cours, les commandes disparaissent de la capture, et tu choisis de quel
          côté va le classement pour laisser la place à ta webcam.
        </p>
        <div className={styles.tip}>
          <span>
            Coupure pub, souci technique&nbsp;? La <b>pause</b> fige le chrono et le son là où ils
            en sont, et la reprise repart exactement de là.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Le son</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, maxWidth: '62ch' }}>
          Par défaut, la musique sort <b>uniquement sur l’écran de diffusion</b> — c’est ce
          qu’on veut dans un salon : une seule source, tout le monde entend la même chose au
          même moment.
        </p>
        <div className={styles.tip}>
          <span>
            Pour jouer <b>à distance</b> (visio, joueurs éparpillés), active «&nbsp;Son aussi sur les
            téléphones&nbsp;» dans les réglages : chaque appareil joue l’extrait, calé sur la même
            horloge. Chacun garde son propre réglage de volume.
          </span>
        </div>
        <div className={`${styles.tip} ${styles.warn}`}>
          <span>
            Dans une <b>même pièce</b>, laisse cette option fermée : une dizaine d’appareils à
            quelques dizaines de millisecondes d’écart font de la bouillie.
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Raccourcis de la régie</h2>
        <div className={styles.keys}>
          <span><kbd>Espace</kbd> lancer / manche suivante</span>
          <span><kbd>P</kbd> pause / reprise</span>
          <span><kbd>R</kbd> révéler la réponse</span>
          <span><kbd>O</kbd> ou <kbd>Entrée</kbd> valider un buzz</span>
          <span><kbd>N</kbd> ou <kbd>Échap</kbd> refuser un buzz</span>
        </div>
        <div className={styles.tip}>
          <span>
            Le bouton <b>Masquer</b> floute le morceau en cours et les manches à venir, si des
            joueurs peuvent voir ton écran de régie.
          </span>
        </div>
      </section>

      <div className={styles.cta}>
        <Link className="btn primary lg" href="/host">Créer une partie</Link>
        <Link className="btn lg" href="/">Rejoindre une partie</Link>
      </div>

      <SupportNote className={styles.footer} />
    </div>
  );
}
