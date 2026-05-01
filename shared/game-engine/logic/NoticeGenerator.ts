/**
 * Notice Generator
 *
 * Generates notice board articles authored by NPCs from a settlement.
 * Templates are driven by each NPC's occupation so content is contextual
 * rather than generic filler. Notices span difficulty levels and include
 * vocabulary words and comprehension questions for language learning.
 */

import type { NoticeArticle } from '@shared/game-engine/types';
import { type GameText, noticeArticleToGameText } from './GameTextTypes';

export interface NPCAuthorInfo {
  characterId: string;
  name: string;
  occupation?: string;
}

// ── Occupation-driven notice templates ──────────────────────────────────────

interface NoticeTemplate {
  /** Occupations this template applies to (empty = universal fallback) */
  occupations: string[];
  titleFn: (npc: NPCAuthorInfo, settlement: string) => string;
  titleTransFn: (npc: NPCAuthorInfo, settlement: string) => string;
  bodyFn: (npc: NPCAuthorInfo, settlement: string) => string;
  bodyTransFn: (npc: NPCAuthorInfo, settlement: string) => string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  noticeType: 'letter' | 'flyer' | 'official' | 'wanted' | 'advertisement';
  vocabularyWords: { word: string; meaning: string }[];
  comprehensionQuestion: {
    question: string;
    questionTranslation: string;
    options: string[];
    correctIndex: number;
  };
  questHook?: {
    questId: string;
    questTitle: string;
    questTitleTranslation: string;
  };
}

/** Normalize occupation string for matching */
function normalizeOccupation(occ: string): string {
  return occ.toLowerCase().trim();
}

const OCCUPATION_TEMPLATES: NoticeTemplate[] = [
  // ── Merchant / Shopkeeper (beginner) ──
  {
    occupations: ['merchant', 'shopkeeper', 'vendor', 'trader'],
    titleFn: (npc) => `Boutique de ${npc.name}`,
    titleTransFn: (npc) => `${npc.name}'s Shop`,
    bodyFn: (npc, s) => `${npc.name} vend des marchandises à ${s}. Nous avons des vêtements, des outils, et des provisions. Venez voir!`,
    bodyTransFn: (npc, s) => `${npc.name} sells goods in ${s}. We have clothing, tools, and provisions. Come see!`,
    difficulty: 'beginner',
    noticeType: 'advertisement',
    vocabularyWords: [
      { word: 'marchandises', meaning: 'goods' },
      { word: 'vêtements', meaning: 'clothing' },
      { word: 'outils', meaning: 'tools' },
      { word: 'provisions', meaning: 'provisions' },
    ],
    comprehensionQuestion: {
      question: 'Que vend cette boutique?',
      questionTranslation: 'What does this shop sell?',
      options: ['Des animaux', 'Des vêtements et des outils', 'Des livres'],
      correctIndex: 1,
    },
  },
  // ── Baker (beginner) ──
  {
    occupations: ['baker', 'boulanger'],
    titleFn: (npc) => `Pain frais chez ${npc.name}`,
    titleTransFn: (npc) => `Fresh Bread at ${npc.name}'s`,
    bodyFn: (npc) => `${npc.name} prépare du pain chaque matin. Du pain blanc, du pain complet, et des croissants. Ouvert de six heures à midi.`,
    bodyTransFn: (npc) => `${npc.name} bakes bread every morning. White bread, whole wheat bread, and croissants. Open from six o'clock to noon.`,
    difficulty: 'beginner',
    noticeType: 'advertisement',
    vocabularyWords: [
      { word: 'pain', meaning: 'bread' },
      { word: 'matin', meaning: 'morning' },
      { word: 'blanc', meaning: 'white' },
      { word: 'midi', meaning: 'noon' },
    ],
    comprehensionQuestion: {
      question: 'À quelle heure ouvre la boulangerie?',
      questionTranslation: 'What time does the bakery open?',
      options: ['À huit heures', 'À six heures', 'À dix heures'],
      correctIndex: 1,
    },
  },
  // ── Farmer (beginner) ──
  {
    occupations: ['farmer', 'fermier', 'agricultor'],
    titleFn: () => 'Fruits et Légumes Frais',
    titleTransFn: () => 'Fresh Fruits and Vegetables',
    bodyFn: (npc) => `${npc.name} vend des fruits et des légumes de sa ferme. Tout est frais et naturel. Venez au marché le matin!`,
    bodyTransFn: (npc) => `${npc.name} sells fruits and vegetables from the farm. Everything is fresh and natural. Come to the market in the morning!`,
    difficulty: 'beginner',
    noticeType: 'flyer',
    vocabularyWords: [
      { word: 'légumes', meaning: 'vegetables' },
      { word: 'ferme', meaning: 'farm' },
      { word: 'frais', meaning: 'fresh' },
      { word: 'naturel', meaning: 'natural' },
    ],
    comprehensionQuestion: {
      question: "D'où viennent les légumes?",
      questionTranslation: 'Where do the vegetables come from?',
      options: ['Du magasin', 'De la ferme', "D'un autre pays"],
      correctIndex: 1,
    },
  },
  // ── Guard / Soldier (intermediate) ──
  {
    occupations: ['guard', 'soldier', 'sheriff', 'constable', 'watchman'],
    titleFn: (_npc, s) => `Sécurité de ${s}`,
    titleTransFn: (_npc, s) => `${s} Security`,
    bodyFn: (npc, s) => `${npc.name}, garde de ${s}, rappelle aux habitants de verrouiller leurs portes la nuit. Des voyageurs inconnus ont été aperçus dans la région. Signalez toute activité suspecte.`,
    bodyTransFn: (npc, s) => `${npc.name}, guard of ${s}, reminds inhabitants to lock their doors at night. Unknown travelers have been seen in the area. Report any suspicious activity.`,
    difficulty: 'intermediate',
    noticeType: 'official',
    vocabularyWords: [
      { word: 'sécurité', meaning: 'security' },
      { word: 'verrouiller', meaning: 'to lock' },
      { word: 'portes', meaning: 'doors' },
      { word: 'voyageurs', meaning: 'travelers' },
      { word: 'suspecte', meaning: 'suspicious' },
    ],
    comprehensionQuestion: {
      question: 'Que doivent faire les habitants?',
      questionTranslation: 'What should inhabitants do?',
      options: ['Partir du village', 'Verrouiller leurs portes', 'Acheter des armes'],
      correctIndex: 1,
    },
  },
  // ── Mayor / Official (intermediate) ──
  {
    occupations: ['mayor', 'official', 'magistrate', 'councillor', 'administrator'],
    titleFn: (_npc, s) => `Annonce du Conseil de ${s}`,
    titleTransFn: (_npc, s) => `${s} Council Announcement`,
    bodyFn: (_npc, s) => `Le conseil de ${s} organise une assemblée publique pour discuter des projets du village. Tous les habitants sont invités à donner leur avis. La réunion aura lieu à la mairie.`,
    bodyTransFn: (_npc, s) => `The ${s} council is organizing a public assembly to discuss village projects. All inhabitants are invited to give their opinion. The meeting will be held at the town hall.`,
    difficulty: 'intermediate',
    noticeType: 'official',
    vocabularyWords: [
      { word: 'assemblée', meaning: 'assembly' },
      { word: 'projets', meaning: 'projects' },
      { word: 'habitants', meaning: 'inhabitants' },
      { word: 'avis', meaning: 'opinion' },
      { word: 'mairie', meaning: 'town hall' },
    ],
    comprehensionQuestion: {
      question: 'Où aura lieu la réunion?',
      questionTranslation: 'Where will the meeting be held?',
      options: ['Au marché', 'À la mairie', "À l'église"],
      correctIndex: 1,
    },
    questHook: {
      questId: 'quest_town_assembly',
      questTitle: "Assister à l'assemblée",
      questTitleTranslation: 'Attend the assembly',
    },
  },
  // ── Blacksmith (intermediate) ──
  {
    occupations: ['blacksmith', 'forgeron', 'smith', 'metalworker'],
    titleFn: (npc) => `La Forge de ${npc.name}`,
    titleTransFn: (npc) => `${npc.name}'s Forge`,
    bodyFn: (npc) => `${npc.name} répare les outils et fabrique des objets en métal. Apportez vos outils cassés. Les réparations prennent un à trois jours selon le travail nécessaire.`,
    bodyTransFn: (npc) => `${npc.name} repairs tools and crafts metal objects. Bring your broken tools. Repairs take one to three days depending on the work needed.`,
    difficulty: 'intermediate',
    noticeType: 'advertisement',
    vocabularyWords: [
      { word: 'répare', meaning: 'repairs' },
      { word: 'outils', meaning: 'tools' },
      { word: 'métal', meaning: 'metal' },
      { word: 'cassés', meaning: 'broken' },
      { word: 'travail', meaning: 'work' },
    ],
    comprehensionQuestion: {
      question: 'Combien de temps prennent les réparations?',
      questionTranslation: 'How long do repairs take?',
      options: ['Une heure', 'Un à trois jours', 'Une semaine'],
      correctIndex: 1,
    },
  },
  // ── Doctor / Healer (intermediate) ──
  {
    occupations: ['doctor', 'healer', 'physician', 'apothecary', 'herbalist', 'médecin'],
    titleFn: (npc) => `Cabinet de ${npc.name}`,
    titleTransFn: (npc) => `${npc.name}'s Practice`,
    bodyFn: (npc, s) => `${npc.name} soigne les malades de ${s}. Consultations tous les jours sauf le dimanche. En cas d'urgence, venez directement. Apportez vos remèdes si vous en avez.`,
    bodyTransFn: (npc, s) => `${npc.name} treats the sick of ${s}. Consultations every day except Sunday. In case of emergency, come directly. Bring your remedies if you have any.`,
    difficulty: 'intermediate',
    noticeType: 'flyer',
    vocabularyWords: [
      { word: 'soigne', meaning: 'treats/heals' },
      { word: 'malades', meaning: 'sick people' },
      { word: 'urgence', meaning: 'emergency' },
      { word: 'remèdes', meaning: 'remedies' },
    ],
    comprehensionQuestion: {
      question: 'Quel jour le cabinet est-il fermé?',
      questionTranslation: 'Which day is the practice closed?',
      options: ['Le lundi', 'Le samedi', 'Le dimanche'],
      correctIndex: 2,
    },
  },
  // ── Teacher / Scholar (advanced) ──
  {
    occupations: ['teacher', 'scholar', 'professor', 'librarian', 'tutor'],
    titleFn: (npc) => `Cours dispensés par ${npc.name}`,
    titleTransFn: (npc) => `Lessons by ${npc.name}`,
    bodyFn: (npc, s) => `${npc.name} propose des cours de lecture et d'écriture aux habitants de ${s}. Les leçons sont adaptées à tous les niveaux, des débutants aux plus avancés. L'éducation est la clé de notre prospérité commune.`,
    bodyTransFn: (npc, s) => `${npc.name} offers reading and writing lessons to the inhabitants of ${s}. Lessons are adapted to all levels, from beginners to advanced. Education is the key to our shared prosperity.`,
    difficulty: 'advanced',
    noticeType: 'advertisement',
    vocabularyWords: [
      { word: 'cours', meaning: 'lessons/classes' },
      { word: 'écriture', meaning: 'writing' },
      { word: 'niveaux', meaning: 'levels' },
      { word: 'éducation', meaning: 'education' },
      { word: 'prospérité', meaning: 'prosperity' },
    ],
    comprehensionQuestion: {
      question: 'À qui sont destinés les cours?',
      questionTranslation: 'Who are the lessons for?',
      options: ['Seulement les enfants', 'Tous les niveaux', 'Les experts uniquement'],
      correctIndex: 1,
    },
  },
  // ── Priest / Religious (advanced) ──
  {
    occupations: ['priest', 'cleric', 'monk', 'nun', 'chaplain', 'prêtre'],
    titleFn: () => 'Appel à la Communauté',
    titleTransFn: () => 'Call to the Community',
    bodyFn: (npc, s) => `${npc.name} invite les habitants de ${s} à se rassembler pour une cérémonie de bénédiction des récoltes. Cette tradition ancienne renforce les liens de notre communauté et honore le travail de nos agriculteurs. Chacun est le bienvenu.`,
    bodyTransFn: (npc, s) => `${npc.name} invites the inhabitants of ${s} to gather for a harvest blessing ceremony. This ancient tradition strengthens the bonds of our community and honors the work of our farmers. Everyone is welcome.`,
    difficulty: 'advanced',
    noticeType: 'official',
    vocabularyWords: [
      { word: 'cérémonie', meaning: 'ceremony' },
      { word: 'bénédiction', meaning: 'blessing' },
      { word: 'récoltes', meaning: 'harvests' },
      { word: 'tradition', meaning: 'tradition' },
      { word: 'communauté', meaning: 'community' },
    ],
    comprehensionQuestion: {
      question: 'Quel est le but de la cérémonie?',
      questionTranslation: 'What is the purpose of the ceremony?',
      options: ['Élire un nouveau maire', 'Bénir les récoltes', 'Célébrer un mariage'],
      correctIndex: 1,
    },
  },
  // ── Innkeeper / Tavern (beginner) ──
  {
    occupations: ['innkeeper', 'bartender', 'tavern keeper', 'aubergiste'],
    titleFn: (npc) => `Auberge de ${npc.name}`,
    titleTransFn: (npc) => `${npc.name}'s Inn`,
    bodyFn: (npc) => `L'auberge de ${npc.name} a des chambres et des repas chauds. Le prix est de deux pièces par nuit. Le dîner est servi à sept heures.`,
    bodyTransFn: (npc) => `${npc.name}'s inn has rooms and hot meals. The price is two coins per night. Dinner is served at seven o'clock.`,
    difficulty: 'beginner',
    noticeType: 'advertisement',
    vocabularyWords: [
      { word: 'auberge', meaning: 'inn' },
      { word: 'chambres', meaning: 'rooms' },
      { word: 'repas', meaning: 'meals' },
      { word: 'nuit', meaning: 'night' },
    ],
    comprehensionQuestion: {
      question: "Combien coûte une nuit à l'auberge?",
      questionTranslation: 'How much is one night at the inn?',
      options: ['Une pièce', 'Deux pièces', 'Cinq pièces'],
      correctIndex: 1,
    },
  },
  // ── Carpenter / Builder (advanced) ──
  {
    occupations: ['carpenter', 'builder', 'mason', 'architect', 'charpentier'],
    titleFn: () => 'Travaux de Construction',
    titleTransFn: () => 'Construction Work',
    bodyFn: (npc, s) => `${npc.name} entreprend des travaux de construction dans le quartier est de ${s}. Les résidents concernés sont priés de déplacer temporairement leurs affaires. Les travaux devraient durer environ trois semaines. Nous remercions chacun pour sa compréhension.`,
    bodyTransFn: (npc, s) => `${npc.name} is undertaking construction work in the eastern quarter of ${s}. Affected residents are asked to temporarily move their belongings. The work should last approximately three weeks. We thank everyone for their understanding.`,
    difficulty: 'advanced',
    noticeType: 'official',
    vocabularyWords: [
      { word: 'construction', meaning: 'construction' },
      { word: 'résidents', meaning: 'residents' },
      { word: 'temporairement', meaning: 'temporarily' },
      { word: 'affaires', meaning: 'belongings' },
      { word: 'compréhension', meaning: 'understanding' },
    ],
    comprehensionQuestion: {
      question: 'Combien de temps dureront les travaux?',
      questionTranslation: 'How long will the work last?',
      options: ['Une semaine', 'Environ trois semaines', 'Deux mois'],
      correctIndex: 1,
    },
  },
];

/** Universal fallback templates for NPCs without a matching occupation */
const FALLBACK_TEMPLATES: NoticeTemplate[] = [
  {
    occupations: [],
    titleFn: (npc) => `Message de ${npc.name}`,
    titleTransFn: (npc) => `Message from ${npc.name}`,
    bodyFn: (npc, s) => `${npc.name} cherche de l'aide à ${s}. Si vous êtes disponible, venez parler à ${npc.name} en personne.`,
    bodyTransFn: (npc, s) => `${npc.name} is looking for help in ${s}. If you are available, come speak with ${npc.name} in person.`,
    difficulty: 'beginner',
    noticeType: 'flyer',
    vocabularyWords: [
      { word: 'aide', meaning: 'help' },
      { word: 'disponible', meaning: 'available' },
      { word: 'parler', meaning: 'to speak' },
      { word: 'personne', meaning: 'person/in person' },
    ],
    comprehensionQuestion: {
      question: 'Que cherche cette personne?',
      questionTranslation: 'What is this person looking for?',
      options: ['Un animal', "De l'aide", 'Un livre'],
      correctIndex: 1,
    },
  },
  {
    occupations: [],
    titleFn: (_npc, s) => `Nouvelles de ${s}`,
    titleTransFn: (_npc, s) => `News from ${s}`,
    bodyFn: (_npc, s) => `Le temps est beau à ${s} cette semaine. Les récoltes se portent bien. Les habitants profitent du soleil pour travailler dans les champs et les jardins.`,
    bodyTransFn: (_npc, s) => `The weather is nice in ${s} this week. The crops are doing well. The inhabitants are taking advantage of the sun to work in the fields and gardens.`,
    difficulty: 'intermediate',
    noticeType: 'flyer',
    vocabularyWords: [
      { word: 'temps', meaning: 'weather' },
      { word: 'récoltes', meaning: 'crops/harvests' },
      { word: 'soleil', meaning: 'sun' },
      { word: 'champs', meaning: 'fields' },
      { word: 'jardins', meaning: 'gardens' },
    ],
    comprehensionQuestion: {
      question: 'Comment est le temps?',
      questionTranslation: 'How is the weather?',
      options: ['Il pleut', 'Il fait beau', 'Il neige'],
      correctIndex: 1,
    },
  },
];

// ── Generator functions ─────────────────────────────────────────────────────

/**
 * Find the best matching template for an NPC based on their occupation.
 * Falls back to a universal template if no occupation match is found.
 */
function findTemplatesForNPC(npc: NPCAuthorInfo): NoticeTemplate[] {
  if (!npc.occupation) return FALLBACK_TEMPLATES;

  const norm = normalizeOccupation(npc.occupation);
  const matches = OCCUPATION_TEMPLATES.filter(t =>
    t.occupations.some(o => norm.includes(o) || o.includes(norm)),
  );

  return matches.length > 0 ? matches : FALLBACK_TEMPLATES;
}

/**
 * Generate notice board articles for a settlement using its NPC data.
 * Each NPC produces one notice based on their occupation, ensuring
 * contextual content rather than generic filler.
 */
export function generateSettlementNotices(
  settlementId: string,
  settlementName: string,
  npcs: NPCAuthorInfo[],
): NoticeArticle[] {
  if (npcs.length === 0) return [];

  const articles: NoticeArticle[] = [];
  const xpByDifficulty = { beginner: 10, intermediate: 15, advanced: 25 };

  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    const templates = findTemplatesForNPC(npc);
    const template = templates[i % templates.length];

    const article: NoticeArticle = {
      id: `notice_${settlementId}_${i}`,
      title: template.titleFn(npc, settlementName),
      titleTranslation: template.titleTransFn(npc, settlementName),
      body: template.bodyFn(npc, settlementName),
      bodyTranslation: template.bodyTransFn(npc, settlementName),
      difficulty: template.difficulty,
      vocabularyWords: template.vocabularyWords,
      comprehensionQuestion: template.comprehensionQuestion,
      author: {
        characterId: npc.characterId,
        name: npc.name,
        occupation: npc.occupation,
      },
      settlementId,
      noticeType: template.noticeType,
      readingXp: xpByDifficulty[template.difficulty],
      documentType: 'notice',
    };

    if (template.questHook) {
      article.questHook = {
        ...template.questHook,
        questId: `${template.questHook.questId}_${settlementId}`,
      };
    }

    articles.push(article);
  }

  return articles;
}

/**
 * Convert settlement-generated NoticeArticles to GameText objects
 * for integration with the Texts system Library.
 */
export function noticesToGameTexts(articles: NoticeArticle[]): GameText[] {
  return articles.map(noticeArticleToGameText);
}
