/**
 * Offline Assessment Content Bank
 *
 * Pre-bundled reading passages, listening passages, writing prompts, and
 * comprehension questions for use when the server (LLM) is unavailable.
 * Each entry includes an expected-answer rubric so the client can score
 * responses without an LLM.
 *
 * Content is organized by target language and difficulty level.
 * The AssessmentEngine picks a random entry from the matching pool.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface OfflineQuestion {
  id: string;
  questionText: string;
  maxPoints: number;
  /** Keywords / acceptable answers for client-side scoring */
  expectedKeywords: string[];
  /** If any single phrase here appears in the answer, award full points */
  acceptPhrases?: string[];
}

export interface OfflinePassageEntry {
  passage: string;
  questions: OfflineQuestion[];
}

export interface OfflineWritingEntry {
  writingPrompts: string[];
  /** Per-prompt rubric: keywords that indicate task completion */
  rubrics: Array<{
    promptIndex: number;
    /** Keywords expected in a good response */
    expectedKeywords: string[];
    /** Minimum word count for full marks */
    minWords: number;
  }>;
}

export interface OfflineContentPool {
  reading: OfflinePassageEntry[];
  listening: OfflinePassageEntry[];
  writing: OfflineWritingEntry[];
}

// ── Content Pools ────────────────────────────────────────────────────────────

const FRENCH_BEGINNER: OfflineContentPool = {
  reading: [
    {
      passage:
        "Bienvenue à la gare de Lyon. Le train pour Marseille part à 14h30 du quai numéro 5. " +
        "Les toilettes sont au sous-sol, à côté du café. Le bureau d'information est ouvert de 8h à 20h. " +
        "Vous pouvez acheter des billets au guichet ou à la machine automatique près de l'entrée.",
      questions: [
        {
          id: 'r1q1', questionText: "What time does the train to Marseille depart?", maxPoints: 5,
          expectedKeywords: ['14h30', '14:30', '2:30', 'two thirty', 'half past two', 'quatorze heures trente'],
          acceptPhrases: ['14h30', '2:30 pm'],
        },
        {
          id: 'r1q2', questionText: "Where is the information desk?", maxPoints: 5,
          expectedKeywords: ['bureau', 'information', 'open', '8', '20', 'ouvert'],
          acceptPhrases: ['bureau d\'information', 'information desk'],
        },
        {
          id: 'r1q3', questionText: "Where can you buy tickets?", maxPoints: 5,
          expectedKeywords: ['guichet', 'machine', 'automatique', 'counter', 'ticket', 'window', 'entrance', 'entrée'],
          acceptPhrases: ['guichet', 'machine automatique', 'ticket counter', 'automatic machine'],
        },
      ],
    },
    {
      passage:
        "La boulangerie « Chez Pierre » ouvre à 7h du matin et ferme à 19h. " +
        "On y trouve du pain frais, des croissants et des tartes aux fruits. " +
        "Le pain coûte 1 euro 20. Les croissants sont à 1 euro 50. " +
        "La boulangerie est fermée le lundi. Elle se trouve rue de la Paix, à côté de la pharmacie.",
      questions: [
        {
          id: 'r2q1', questionText: "What time does the bakery open?", maxPoints: 5,
          expectedKeywords: ['7h', '7:00', 'seven', 'sept heures', '7 am'],
          acceptPhrases: ['7h', '7:00', '7 am'],
        },
        {
          id: 'r2q2', questionText: "How much does a croissant cost?", maxPoints: 5,
          expectedKeywords: ['1', '50', 'euro', '1.50', 'one fifty', 'un euro cinquante'],
          acceptPhrases: ['1 euro 50', '1.50', '€1.50'],
        },
        {
          id: 'r2q3', questionText: "When is the bakery closed?", maxPoints: 5,
          expectedKeywords: ['lundi', 'monday', 'fermée'],
          acceptPhrases: ['lundi', 'monday', 'closed on monday'],
        },
      ],
    },
    {
      passage:
        "L'hôtel du Parc est situé au centre-ville, près de la place principale. " +
        "Il y a 30 chambres. Le petit-déjeuner est servi de 7h à 10h dans la salle du restaurant. " +
        "Le Wi-Fi est gratuit. La réception est ouverte 24 heures sur 24. " +
        "Pour réserver, appelez le 01 23 45 67 89 ou visitez le site internet.",
      questions: [
        {
          id: 'r3q1', questionText: "Where is the hotel located?", maxPoints: 5,
          expectedKeywords: ['centre', 'ville', 'center', 'city', 'place', 'principale', 'main', 'square', 'downtown'],
          acceptPhrases: ['centre-ville', 'city center', 'main square'],
        },
        {
          id: 'r3q2', questionText: "When is breakfast served?", maxPoints: 5,
          expectedKeywords: ['7h', '10h', '7', '10', 'seven', 'ten'],
          acceptPhrases: ['7h à 10h', '7 to 10', '7am to 10am'],
        },
        {
          id: 'r3q3', questionText: "Is the Wi-Fi free?", maxPoints: 5,
          expectedKeywords: ['gratuit', 'free', 'yes', 'oui'],
          acceptPhrases: ['gratuit', 'free', 'yes'],
        },
      ],
    },
  ],

  listening: [
    {
      passage:
        "Bonjour et bienvenue au centre d'accueil des visiteurs. " +
        "Notre bureau est ouvert du lundi au samedi, de 9h à 17h. " +
        "Nous proposons des cartes gratuites de la ville et des informations sur les musées. " +
        "Le musée d'art moderne est ouvert tous les jours sauf le mardi. " +
        "L'entrée coûte 8 euros pour les adultes et 4 euros pour les enfants.",
      questions: [
        {
          id: 'l1q1', questionText: "What are the opening hours of the visitor center?", maxPoints: 5,
          expectedKeywords: ['9h', '17h', '9', '5', 'monday', 'saturday', 'lundi', 'samedi'],
          acceptPhrases: ['9h à 17h', '9 to 5', 'monday to saturday'],
        },
        {
          id: 'l1q2', questionText: "When is the modern art museum closed?", maxPoints: 5,
          expectedKeywords: ['mardi', 'tuesday', 'closed', 'fermé'],
          acceptPhrases: ['mardi', 'tuesday'],
        },
        {
          id: 'l1q3', questionText: "How much is admission for adults?", maxPoints: 3,
          expectedKeywords: ['8', 'huit', 'euro'],
          acceptPhrases: ['8 euros', '8€', 'huit euros'],
        },
      ],
    },
    {
      passage:
        "Attention, voyageurs. Le train numéro 742 à destination de Bordeaux partira avec un retard de 15 minutes. " +
        "Le départ est maintenant prévu à 11h45 au lieu de 11h30. " +
        "Nous nous excusons pour ce désagrément. " +
        "Le train arrivera à Bordeaux à 14h15. " +
        "Les passagers de première classe peuvent attendre dans le salon au premier étage.",
      questions: [
        {
          id: 'l2q1', questionText: "How long is the train delayed?", maxPoints: 5,
          expectedKeywords: ['15', 'quinze', 'minutes', 'fifteen'],
          acceptPhrases: ['15 minutes', 'quinze minutes', 'fifteen minutes'],
        },
        {
          id: 'l2q2', questionText: "What is the new departure time?", maxPoints: 5,
          expectedKeywords: ['11h45', '11:45', 'quarter to twelve', 'onze heures quarante-cinq'],
          acceptPhrases: ['11h45', '11:45'],
        },
        {
          id: 'l2q3', questionText: "What time will the train arrive in Bordeaux?", maxPoints: 3,
          expectedKeywords: ['14h15', '14:15', '2:15', 'quatorze heures quinze'],
          acceptPhrases: ['14h15', '14:15', '2:15 pm'],
        },
      ],
    },
  ],

  writing: [
    {
      writingPrompts: [
        "Write a short message to a friend telling them you have arrived safely in a new city. Mention how you traveled and what you can see.",
        "Describe your hotel room or accommodation. What does it look like? What furniture is there?",
      ],
      rubrics: [
        { promptIndex: 0, expectedKeywords: ['arrived', 'arrivé', 'train', 'bus', 'avion', 'city', 'ville', 'see', 'voir', 'travel'], minWords: 15 },
        { promptIndex: 1, expectedKeywords: ['room', 'chambre', 'bed', 'lit', 'window', 'fenêtre', 'table', 'hotel', 'hôtel'], minWords: 15 },
      ],
    },
    {
      writingPrompts: [
        "Write a message asking for directions to the train station. Include a greeting and say thank you.",
        "Describe what you ate for breakfast this morning. Did you enjoy it?",
      ],
      rubrics: [
        { promptIndex: 0, expectedKeywords: ['gare', 'station', 'train', 'direction', 'où', 'where', 'merci', 'thank', 'bonjour', 'hello'], minWords: 12 },
        { promptIndex: 1, expectedKeywords: ['breakfast', 'petit-déjeuner', 'ate', 'mangé', 'coffee', 'café', 'bread', 'pain', 'croissant'], minWords: 12 },
      ],
    },
  ],
};

const SPANISH_BEGINNER: OfflineContentPool = {
  reading: [
    {
      passage:
        "Bienvenido a la estación de tren de Madrid. El tren a Barcelona sale a las 15h00 del andén número 3. " +
        "Los servicios están en la planta baja, al lado de la cafetería. " +
        "La oficina de información está abierta de 8h a 21h. " +
        "Puede comprar billetes en la taquilla o en la máquina automática cerca de la entrada principal.",
      questions: [
        {
          id: 'r1q1', questionText: "What time does the train to Barcelona depart?", maxPoints: 5,
          expectedKeywords: ['15h00', '15:00', '3:00', 'three', 'quince', '3 pm', '3pm'],
          acceptPhrases: ['15h00', '3:00 pm', '3 pm'],
        },
        {
          id: 'r1q2', questionText: "Where are the restrooms located?", maxPoints: 5,
          expectedKeywords: ['planta', 'baja', 'ground', 'floor', 'cafetería', 'café', 'bajo'],
          acceptPhrases: ['planta baja', 'ground floor'],
        },
        {
          id: 'r1q3', questionText: "Where can you buy tickets?", maxPoints: 5,
          expectedKeywords: ['taquilla', 'máquina', 'automática', 'counter', 'ticket', 'machine', 'entrance'],
          acceptPhrases: ['taquilla', 'máquina automática', 'ticket counter'],
        },
      ],
    },
  ],

  listening: [
    {
      passage:
        "Buenos días y bienvenidos al centro de visitantes. " +
        "Nuestras oficinas están abiertas de lunes a sábado, de 9h a 18h. " +
        "Ofrecemos mapas gratuitos de la ciudad y folletos sobre los monumentos. " +
        "El museo de arte está abierto todos los días excepto el miércoles. " +
        "La entrada cuesta 10 euros para adultos y 5 euros para niños.",
      questions: [
        {
          id: 'l1q1', questionText: "What are the opening hours of the visitor center?", maxPoints: 5,
          expectedKeywords: ['9h', '18h', '9', '6', 'monday', 'saturday', 'lunes', 'sábado'],
          acceptPhrases: ['9h a 18h', '9 to 6', 'lunes a sábado'],
        },
        {
          id: 'l1q2', questionText: "When is the art museum closed?", maxPoints: 5,
          expectedKeywords: ['miércoles', 'wednesday', 'closed', 'cerrado'],
          acceptPhrases: ['miércoles', 'wednesday'],
        },
        {
          id: 'l1q3', questionText: "How much is admission for children?", maxPoints: 3,
          expectedKeywords: ['5', 'cinco', 'euro'],
          acceptPhrases: ['5 euros', '5€', 'cinco euros'],
        },
      ],
    },
  ],

  writing: [
    {
      writingPrompts: [
        "Write a short message to a friend telling them you have arrived in a new Spanish-speaking city. Mention your journey and first impressions.",
        "Describe the neighborhood around your hotel. What shops or landmarks can you see?",
      ],
      rubrics: [
        { promptIndex: 0, expectedKeywords: ['arrived', 'llegado', 'city', 'ciudad', 'train', 'tren', 'bus', 'avión', 'viaje', 'journey'], minWords: 15 },
        { promptIndex: 1, expectedKeywords: ['hotel', 'shop', 'tienda', 'street', 'calle', 'park', 'parque', 'church', 'iglesia', 'restaurant'], minWords: 15 },
      ],
    },
  ],
};

/**
 * Generic English fallback content — used when no target-language-specific
 * content is available. Questions are in English about a generic city arrival.
 */
const GENERIC_BEGINNER: OfflineContentPool = {
  reading: [
    {
      passage:
        "Welcome to the city visitor center. We are open Monday through Saturday from 9 AM to 5 PM. " +
        "Free city maps are available at the front desk. The nearest bus stop is on Main Street, " +
        "about a two-minute walk from here. The city museum is open every day except Tuesday. " +
        "Admission is $10 for adults and $5 for children under 12.",
      questions: [
        {
          id: 'r1q1', questionText: "What days is the visitor center open?", maxPoints: 5,
          expectedKeywords: ['monday', 'saturday', 'mon', 'sat'],
          acceptPhrases: ['monday through saturday', 'monday to saturday'],
        },
        {
          id: 'r1q2', questionText: "Where is the nearest bus stop?", maxPoints: 5,
          expectedKeywords: ['main', 'street', 'two', 'minute', 'walk'],
          acceptPhrases: ['main street', 'two-minute walk'],
        },
        {
          id: 'r1q3', questionText: "When is the museum closed?", maxPoints: 5,
          expectedKeywords: ['tuesday'],
          acceptPhrases: ['tuesday'],
        },
      ],
    },
  ],

  listening: [
    {
      passage:
        "Attention please. The downtown shuttle bus departs every 20 minutes from stop number 4. " +
        "The last bus of the evening leaves at 11 PM. A single ticket costs $2. " +
        "Day passes are available for $7 and can be purchased from the driver. " +
        "Please have exact change ready.",
      questions: [
        {
          id: 'l1q1', questionText: "How often does the shuttle bus depart?", maxPoints: 5,
          expectedKeywords: ['20', 'twenty', 'minutes'],
          acceptPhrases: ['every 20 minutes', '20 minutes'],
        },
        {
          id: 'l1q2', questionText: "How much is a day pass?", maxPoints: 5,
          expectedKeywords: ['7', 'seven', 'dollar'],
          acceptPhrases: ['$7', '7 dollars'],
        },
        {
          id: 'l1q3', questionText: "What time is the last bus?", maxPoints: 3,
          expectedKeywords: ['11', 'pm', 'eleven'],
          acceptPhrases: ['11 pm', '11 PM', '11:00 PM'],
        },
      ],
    },
  ],

  writing: [
    {
      writingPrompts: [
        "Write a short message to a friend about your arrival in a new city. How did you get there and what do you see?",
        "Describe your room or the place where you are staying.",
      ],
      rubrics: [
        { promptIndex: 0, expectedKeywords: ['arrived', 'city', 'travel', 'see', 'bus', 'train', 'plane', 'walk'], minWords: 15 },
        { promptIndex: 1, expectedKeywords: ['room', 'bed', 'window', 'hotel', 'house', 'stay', 'nice', 'small', 'big'], minWords: 15 },
      ],
    },
  ],
};

// ── Lookup ────────────────────────────────────────────────────────────────────

const CONTENT_BY_LANGUAGE: Record<string, Record<string, OfflineContentPool>> = {
  french: { beginner: FRENCH_BEGINNER },
  spanish: { beginner: SPANISH_BEGINNER },
};

/**
 * Get the offline content pool for a target language and difficulty.
 * Falls back to generic English content if no match found.
 */
export function getOfflineContentPool(targetLanguage: string, difficulty: string = 'beginner'): OfflineContentPool {
  const lang = targetLanguage.toLowerCase();
  const diff = difficulty.toLowerCase();
  return CONTENT_BY_LANGUAGE[lang]?.[diff] ?? GENERIC_BEGINNER;
}

/**
 * Pick a random entry from an array using a simple seeded selection.
 */
export function pickRandom<T>(entries: T[]): T {
  return entries[Math.floor(Math.random() * entries.length)];
}
