import { db } from '../db.js';

/** Jeu de données d'exemple (livrable « jeu de données d'exemple »). */
export const DEMO_SETS = [
  {
    title: 'Anglais — la maison',
    description: 'Vocabulaire du quotidien : pièces et objets de la maison.',
    termLang: 'en',
    defLang: 'fr',
    color: '#c8603f',
    tags: ['anglais', 'débutant'],
    cards: [
      ['kitchen', 'cuisine', 'I am cooking in the kitchen.'],
      ['bedroom', 'chambre', 'My bedroom is upstairs.'],
      ['bathroom', 'salle de bain', ''],
      ['living room', 'salon', 'We watch TV in the living room.'],
      ['stairs', 'escalier', ''],
      ['roof', 'toit', 'There is a cat on the roof.'],
      ['window', 'fenêtre', 'Open the window, please.'],
      ['door', 'porte', ''],
      ['floor', 'sol / étage', ''],
      ['ceiling', 'plafond', ''],
      ['wall', 'mur', ''],
      ['chair', 'chaise', ''],
      ['table', 'table', ''],
      ['shelf', 'étagère', 'The books are on the shelf.'],
      ['cupboard', 'placard', ''],
      ['sink', 'évier / lavabo', ''],
      ['fridge', 'réfrigérateur', ''],
      ['oven', 'four', 'The cake is in the oven.'],
      ['garden', 'jardin', ''],
      ['key', 'clé', 'I lost my keys again!'],
    ],
  },
  {
    title: 'Espagnol — verbes essentiels',
    description: 'Les verbes les plus fréquents à l’infinitif.',
    termLang: 'es',
    defLang: 'fr',
    color: '#7f9a72',
    tags: ['espagnol'],
    cards: [
      ['ser', 'être (essence)', 'Soy francés.'],
      ['estar', 'être (état, lieu)', 'Estoy cansado.'],
      ['tener', 'avoir', 'Tengo dos hermanos.'],
      ['hacer', 'faire', ''],
      ['ir', 'aller', 'Vamos a la playa.'],
      ['poder', 'pouvoir', ''],
      ['decir', 'dire', ''],
      ['ver', 'voir', ''],
      ['dar', 'donner', ''],
      ['saber', 'savoir', ''],
      ['querer', 'vouloir / aimer', 'Te quiero.'],
      ['llegar', 'arriver', ''],
      ['pasar', 'passer', ''],
      ['deber', 'devoir', ''],
      ['poner', 'mettre', ''],
    ],
  },
  {
    title: 'Réseau — notions de base',
    description: 'Vocabulaire technique pour débuter en réseau informatique.',
    termLang: 'fr',
    defLang: 'fr',
    color: '#4f7a8c',
    tags: ['informatique', 'cours'],
    cards: [
      ['DNS', 'Système qui traduit un nom de domaine en adresse IP.', ''],
      ['Adresse IP', 'Identifiant numérique d’une machine sur un réseau.', ''],
      ['Port', 'Numéro identifiant un service sur une machine (ex. 443 pour HTTPS).', ''],
      ['TLS', 'Protocole de chiffrement des échanges (le « S » de HTTPS).', ''],
      ['Pare-feu', 'Filtre qui autorise ou bloque le trafic réseau.', ''],
      ['Reverse proxy', 'Serveur intermédiaire qui reçoit les requêtes et les transmet à l’application.', ''],
      ['Latence', 'Temps mis par un paquet pour aller d’un point à un autre.', ''],
      ['Bande passante', 'Débit maximal de données transmissibles.', ''],
    ],
  },
];

export function seedDemo(userId: number): number {
  const insSet = db().prepare('INSERT INTO sets (owner_id, title, description, term_lang, def_lang, color, tags) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insCard = db().prepare('INSERT INTO cards (set_id, position, term, definition, example) VALUES (?, ?, ?, ?, ?)');
  db().transaction(() => {
    for (const s of DEMO_SETS) {
      const r = insSet.run(userId, s.title, s.description, s.termLang, s.defLang, s.color, JSON.stringify(s.tags));
      s.cards.forEach(([t, d, e], i) => insCard.run(r.lastInsertRowid, i, t, d, e));
    }
  })();
  return DEMO_SETS.length;
}
