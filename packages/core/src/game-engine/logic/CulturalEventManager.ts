/**
 * Cultural Event Manager
 *
 * Manages periodic in-game cultural events tied to the target language's culture.
 * Events trigger special NPC dialogue, quests, and decorations.
 */

export interface CulturalEvent {
  id: string;
  name: string;
  targetLanguageName: string;
  description: string;
  culturalVocabulary: { word: string; meaning: string }[];
  npcDialogueHints: string[];  // Phrases NPCs might say during the event
  durationMinutes: number;
}

const CULTURAL_EVENTS: Record<string, CulturalEvent[]> = {
  french: [
    {
      id: 'bastille_day',
      name: 'Bastille Day',
      targetLanguageName: 'La Fête Nationale',
      description: 'The village celebrates France\'s national day with fireworks and festivities.',
      culturalVocabulary: [
        { word: 'fête', meaning: 'celebration' },
        { word: 'feu d\'artifice', meaning: 'fireworks' },
        { word: 'liberté', meaning: 'liberty' },
        { word: 'égalité', meaning: 'equality' },
        { word: 'fraternité', meaning: 'brotherhood' },
        { word: 'drapeau', meaning: 'flag' },
      ],
      npcDialogueHints: [
        'Vive la France!',
        'Joyeuse Fête Nationale!',
        'Les feux d\'artifice commencent ce soir!',
      ],
      durationMinutes: 30,
    },
    {
      id: 'fete_de_la_musique',
      name: 'Music Festival',
      targetLanguageName: 'Fête de la Musique',
      description: 'Musicians perform in the streets for the annual music festival.',
      culturalVocabulary: [
        { word: 'musique', meaning: 'music' },
        { word: 'chanson', meaning: 'song' },
        { word: 'danser', meaning: 'to dance' },
        { word: 'chanter', meaning: 'to sing' },
        { word: 'instrument', meaning: 'instrument' },
      ],
      npcDialogueHints: [
        'Quelle belle musique!',
        'Voulez-vous danser?',
        'Chantez avec nous!',
      ],
      durationMinutes: 25,
    },
    {
      id: 'marche',
      name: 'Market Day',
      targetLanguageName: 'Jour de Marché',
      description: 'The weekly market brings vendors selling local specialties.',
      culturalVocabulary: [
        { word: 'marché', meaning: 'market' },
        { word: 'fromage', meaning: 'cheese' },
        { word: 'pain', meaning: 'bread' },
        { word: 'vendeur', meaning: 'seller' },
        { word: 'acheter', meaning: 'to buy' },
        { word: 'prix', meaning: 'price' },
      ],
      npcDialogueHints: [
        'Regardez ces belles pommes!',
        'Combien ça coûte?',
        'C\'est le meilleur fromage du village!',
      ],
      durationMinutes: 20,
    },
  ],
  spanish: [
    {
      id: 'fiesta',
      name: 'Village Fiesta',
      targetLanguageName: 'La Fiesta del Pueblo',
      description: 'The village celebrates with music, dancing, and traditional food.',
      culturalVocabulary: [
        { word: 'fiesta', meaning: 'party/celebration' },
        { word: 'bailar', meaning: 'to dance' },
        { word: 'comida', meaning: 'food' },
        { word: 'alegría', meaning: 'joy' },
        { word: 'tradición', meaning: 'tradition' },
      ],
      npcDialogueHints: [
        '¡Vamos a bailar!',
        '¡Qué fiesta tan bonita!',
        '¡Bienvenidos a la fiesta!',
      ],
      durationMinutes: 25,
    },
    {
      id: 'mercado',
      name: 'Market Day',
      targetLanguageName: 'Día de Mercado',
      description: 'The weekly market features local produce and crafts.',
      culturalVocabulary: [
        { word: 'mercado', meaning: 'market' },
        { word: 'comprar', meaning: 'to buy' },
        { word: 'vender', meaning: 'to sell' },
        { word: 'fruta', meaning: 'fruit' },
        { word: 'precio', meaning: 'price' },
      ],
      npcDialogueHints: [
        '¿Cuánto cuesta?',
        '¡Las frutas están muy frescas!',
        '¡Venga a ver!',
      ],
      durationMinutes: 20,
    },
  ],
  // Generic fallback for any language
  generic: [
    {
      id: 'harvest_festival',
      name: 'Harvest Festival',
      targetLanguageName: 'Harvest Festival',
      description: 'The village celebrates the harvest with feasting and gratitude.',
      culturalVocabulary: [
        { word: 'harvest', meaning: 'harvest' },
        { word: 'feast', meaning: 'feast' },
        { word: 'celebrate', meaning: 'celebrate' },
      ],
      npcDialogueHints: [
        'The harvest was bountiful this year!',
        'Come join the celebration!',
      ],
      durationMinutes: 20,
    },
  ],
};

export class CulturalEventManager {
  private language: string = 'generic';
  private activeEvent: CulturalEvent | null = null;
  private eventStartTime: number = 0;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private eventCooldownEnd: number = 0;

  // Callbacks
  private onEventStart: ((event: CulturalEvent) => void) | null = null;
  private onEventEnd: ((event: CulturalEvent) => void) | null = null;

  constructor() {}

  public setLanguage(language: string): void {
    this.language = language.toLowerCase();
  }

  public start(): void {
    if (this.checkIntervalId) return;

    // Check every 5 minutes if we should trigger an event
    this.checkIntervalId = setInterval(() => {
      this.maybeStartEvent();
    }, 5 * 60 * 1000);

    // Also check immediately after a short delay
    setTimeout(() => this.maybeStartEvent(), 30000);
  }

  public stop(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  private maybeStartEvent(): void {
    if (this.activeEvent) {
      // Check if current event should end
      const elapsed = Date.now() - this.eventStartTime;
      if (elapsed >= this.activeEvent.durationMinutes * 60 * 1000) {
        this.endEvent();
      }
      return;
    }

    // Cooldown between events (10 minutes)
    if (Date.now() < this.eventCooldownEnd) return;

    // 20% chance per check
    if (Math.random() > 0.2) return;

    const events = CULTURAL_EVENTS[this.language] || CULTURAL_EVENTS.generic;
    const event = events[Math.floor(Math.random() * events.length)];

    this.activeEvent = event;
    this.eventStartTime = Date.now();
    this.onEventStart?.(event);
  }

  private endEvent(): void {
    if (this.activeEvent) {
      this.onEventEnd?.(this.activeEvent);
      this.activeEvent = null;
      this.eventCooldownEnd = Date.now() + 10 * 60 * 1000;
    }
  }

  public getActiveEvent(): CulturalEvent | null {
    return this.activeEvent;
  }

  /**
   * Get NPC dialogue hints for the active event
   */
  public getEventDialogueHints(): string[] {
    return this.activeEvent?.npcDialogueHints || [];
  }

  /**
   * Get cultural vocabulary from the active event
   */
  public getEventVocabulary(): { word: string; meaning: string }[] {
    return this.activeEvent?.culturalVocabulary || [];
  }

  public setOnEventStart(cb: (event: CulturalEvent) => void): void { this.onEventStart = cb; }
  public setOnEventEnd(cb: (event: CulturalEvent) => void): void { this.onEventEnd = cb; }

  public dispose(): void {
    this.stop();
    this.onEventStart = null;
    this.onEventEnd = null;
  }
}
