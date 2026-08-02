/**
 * Conversational Action Detector
 *
 * Detects specific conversational action patterns from player messages during
 * NPC dialogue. These actions map to quest objective completion criteria,
 * enabling quests to require specific conversational behaviors (asking about
 * topics, using target language, answering questions, etc.).
 *
 * Separated from BabylonChatPanel to keep pattern matching logic testable
 * and decoupled from UI concerns.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ConversationalActionType =
  | 'asked_about_topic'
  | 'used_target_language'
  | 'answered_question'
  | 'requested_information'
  | 'made_introduction';

export interface ConversationalAction {
  action: ConversationalActionType;
  /** Topic slug for asked_about_topic (e.g. 'missing_writer', 'local_history') */
  topic?: string;
  /** NPC being spoken to */
  npcId: string;
  /** Quest ID if determinable from context */
  questId?: string;
}

export interface DetectorContext {
  npcId: string;
  /** The NPC's last message (to detect if player is answering a question) */
  npcMessage: string;
  /** The player's message */
  playerMessage: string;
  /** Target language code (e.g. 'fr', 'es') */
  targetLanguage?: string;
  /** Active quest IDs with their topic keywords */
  questTopics?: Array<{ questId: string; keywords: string[] }>;
}

export type NPCSpeechActType =
  | 'gave_information'
  | 'refused_request'
  | 'asked_question'
  | 'offered_item'
  | 'completed_transaction'
  | 'taught_vocabulary'
  | 'gave_directions'
  | 'told_story'
  | 'assigned_quest';

export interface NPCSpeechAct {
  type: NPCSpeechActType;
  /** Confidence score from 0 to 1 based on number of pattern matches */
  confidence: number;
  /** Extracted data such as directions text, vocabulary word, item name */
  extractedData?: Record<string, string>;
}

/** Per-NPC conversation turn counter state */
export interface NpcConversationTurnState {
  npcId: string;
  totalTurns: number;
  meaningfulTurns: number;
}

// ── Topic keyword dictionaries ───────────────────────────────────────────────

const INFORMATION_REQUEST_PATTERNS = [
  /where\s+(is|are|can|do)/i,
  /how\s+(do|can|does|to)/i,
  /can\s+you\s+(tell|show|help|direct)/i,
  /could\s+you\s+(tell|show|help|direct)/i,
  /do\s+you\s+know\s+(where|how|what|who)/i,
  /what\s+(is|are|does)/i,
  /who\s+(is|are|knows)/i,
  /which\s+way/i,
  /point\s+me/i,
  /looking\s+for/i,
  /need\s+(to\s+find|help|directions)/i,
];

const INTRODUCTION_PATTERNS = [
  /\bmy\s+name\s+is\b/i,
  /\bi\s*(?:am|'m)\s+[A-Z]/,
  /\bcall\s+me\b/i,
  /\bje\s+m'appelle\b/i,    // French
  /\bme\s+llamo\b/i,        // Spanish
  /\bich\s+hei[sß]e\b/i,    // German
  /\bnice\s+to\s+meet\b/i,
  /\bpleased\s+to\s+meet\b/i,
  /\benchanté/i,             // French
  /\bmucho\s+gusto\b/i,     // Spanish
];

const QUESTION_INDICATORS = [
  /\?\s*$/,
  /^(who|what|where|when|why|how|which|do|does|did|is|are|was|were|can|could|will|would|shall|should|have|has|had)\b/i,
];

// Common target-language word patterns (French-focused but extensible)
const TARGET_LANGUAGE_INDICATORS: Record<string, RegExp[]> = {
  fr: [
    /\b(je|tu|il|elle|nous|vous|ils|elles)\b/i,
    /\b(le|la|les|un|une|des)\b/i,
    /\b(est|suis|sont|avez|avons|ont|fait)\b/i,
    /\b(oui|non|merci|bonjour|salut|au revoir|s'il vous plaît|pardon)\b/i,
    /[àâäéèêëïîôùûüÿçœæ]/,
  ],
  es: [
    /\b(yo|tú|él|ella|nosotros|ustedes|ellos|ellas)\b/i,
    /\b(el|la|los|las|un|una|unos|unas)\b/i,
    /\b(es|soy|son|tiene|tienen|hace|hacen)\b/i,
    /\b(sí|no|gracias|hola|adiós|por favor|perdón)\b/i,
    /[áéíóúñ¿¡ü]/,
  ],
};

// ── NPC Speech Act Patterns ─────────────────────────────────────────────────

const NPC_SPEECH_ACT_PATTERNS: Record<NPCSpeechActType, RegExp[]> = {
  gave_information: [
    /\b(left|right|north|south|east|west|near|behind|across|between)\b/i,
    /\b(it('s| is)|they('re| are)|that('s| is)|this is|because|the reason)\b/i,
    /\b(you('ll| will) find|located|situated|known as)\b/i,
    /\b(let me explain|the thing is|what you need to know)\b/i,
  ],
  refused_request: [
    /\bcan'?t\b/i,
    /\bwon'?t\b/i,
    /\bsorry\b/i,
    /\bnot possible\b/i,
    /\b(I |we )?refuse\b/i,
    /\bunable to\b/i,
    /\bI'?m afraid\b/i,
    /\b(no,|^no\b)/i,
  ],
  asked_question: [
    /\?\s*$/,
    /\bdo you\b/i,
    /\bhave you\b/i,
    /\bwould you\b/i,
    /\bcan you\b/i,
    /\bcould you\b/i,
    /\bwill you\b/i,
  ],
  offered_item: [
    /\bhere,?\s*take\b/i,
    /\bI'?ll give you\b/i,
    /\bfor you\b/i,
    /\boffering\b/i,
    /\btake this\b/i,
    /\ba gift\b/i,
    /\bhave this\b/i,
  ],
  completed_transaction: [
    /\bsold\b/i,
    /\bpurchased\b/i,
    /\bhere'?s your\b/i,
    /\bgold\b/i,
    /\bcoins?\b/i,
    /\bthat'?ll be\b/i,
    /\btotal comes to\b/i,
    /\bpayment\b/i,
  ],
  taught_vocabulary: [
    /\bthe word for\b/i,
    /\bmeans\b/i,
    /\bin \w+(?:ish|ese|ch|an|ic)\b/i,
    /\bis called\b/i,
    /\btranslates to\b/i,
    /\bwe say\b/i,
    /\bpronounced\b/i,
  ],
  gave_directions: [
    /\b(go|head|walk|turn|follow)\s+(left|right|north|south|east|west|straight)\b/i,
    /\b(past|beyond|until you reach|you'?ll see)\b/i,
    /\b(the path|the road|the street|the bridge|the building)\b/i,
    /\b(next to|across from|in front of|behind the)\b/i,
  ],
  told_story: [
    /\bonce upon\b/i,
    /\blong ago\b/i,
    /\bthe story\b/i,
    /\blegend\b/i,
    /\bthere was\b/i,
    /\bthey say that\b/i,
    /\bin the old days\b/i,
    /\bmy (grand)?[a-z]+ used to\b/i,
  ],
  assigned_quest: [
    /\bcan you find\b/i,
    /\bI need you to\b/i,
    /\bplease bring\b/i,
    /\bmission\b/i,
    /\btask for you\b/i,
    /\bwould you be willing\b/i,
    /\bI have a (favor|job|request)\b/i,
    /\bif you could\b/i,
  ],
};

// ── Detector ─────────────────────────────────────────────────────────────────

export class ConversationalActionDetector {
  private npcTurnCounts = new Map<string, NpcConversationTurnState>();

  /**
   * Detect all conversational actions from a single exchange.
   * Returns zero or more actions detected from the player's message.
   */
  detect(ctx: DetectorContext): ConversationalAction[] {
    const actions: ConversationalAction[] = [];
    const { playerMessage, npcMessage, npcId, targetLanguage, questTopics } = ctx;

    // 1. asked_about_topic — player message contains quest-relevant keywords
    if (questTopics) {
      for (const qt of questTopics) {
        if (this.matchesTopic(playerMessage, qt.keywords)) {
          actions.push({
            action: 'asked_about_topic',
            topic: qt.keywords[0], // use first keyword as topic slug
            npcId,
            questId: qt.questId,
          });
        }
      }
    }

    // 2. used_target_language — player wrote in the target language
    if (targetLanguage && this.isTargetLanguage(playerMessage, targetLanguage)) {
      actions.push({ action: 'used_target_language', npcId });
    }

    // 3. answered_question — player responded to NPC's question
    if (this.isAnsweringQuestion(npcMessage, playerMessage)) {
      actions.push({ action: 'answered_question', npcId });
    }

    // 4. requested_information — player asked for directions/help
    if (this.isRequestingInformation(playerMessage)) {
      actions.push({ action: 'requested_information', npcId });
    }

    // 5. made_introduction — player introduced themselves
    if (this.isIntroduction(playerMessage)) {
      actions.push({ action: 'made_introduction', npcId });
    }

    return actions;
  }

  /**
   * Record a conversation turn and return updated state for the NPC.
   * A turn is "meaningful" if the player message has > 5 words in the
   * target language.
   */
  recordTurn(
    npcId: string,
    playerMessage: string,
    targetLanguage?: string,
  ): NpcConversationTurnState {
    let state = this.npcTurnCounts.get(npcId);
    if (!state) {
      state = { npcId, totalTurns: 0, meaningfulTurns: 0 };
      this.npcTurnCounts.set(npcId, state);
    }

    state.totalTurns++;

    const words = playerMessage.trim().split(/\s+/).filter(w => w.length > 0);
    const isMeaningful = words.length > 5 &&
      (!targetLanguage || this.isTargetLanguage(playerMessage, targetLanguage));
    if (isMeaningful) {
      state.meaningfulTurns++;
    }

    return { ...state };
  }

  /** Get conversation turn state for an NPC. */
  getTurnState(npcId: string): NpcConversationTurnState | undefined {
    const state = this.npcTurnCounts.get(npcId);
    return state ? { ...state } : undefined;
  }

  /** Reset turn counts (e.g. on new playthrough). */
  resetTurnCounts(): void {
    this.npcTurnCounts.clear();
  }

  // ── Static NPC speech act detection ────────────────────────────────────

  /**
   * Detect speech acts from an NPC's message using keyword and pattern matching.
   * Returns all detected speech acts sorted by confidence (highest first).
   */
  static detectNPCSpeechActs(npcMessage: string, npcName: string): NPCSpeechAct[] {
    const results: NPCSpeechAct[] = [];

    for (const [actType, patterns] of Object.entries(NPC_SPEECH_ACT_PATTERNS) as [NPCSpeechActType, RegExp[]][]) {
      let matchCount = 0;
      const extractedData: Record<string, string> = {};

      for (const pattern of patterns) {
        const match = npcMessage.match(pattern);
        if (match) {
          matchCount++;

          // Extract relevant data based on act type
          if (actType === 'taught_vocabulary') {
            // Try to extract the vocabulary word/phrase
            const wordForMatch = npcMessage.match(/the word for ["']?(\w+)["']?\s+is\s+["']?(\w+)["']?/i);
            const meansMatch = npcMessage.match(/["'](\w+)["']\s+means\s+["']?([^"'.]+)["']?/i);
            const calledMatch = npcMessage.match(/is called\s+["']?([^"'.]+)["']?/i);
            const translatesMatch = npcMessage.match(/translates to\s+["']?([^"'.]+)["']?/i);
            if (wordForMatch) {
              extractedData['source_word'] = wordForMatch[1];
              extractedData['target_word'] = wordForMatch[2];
            } else if (meansMatch) {
              extractedData['vocabulary_word'] = meansMatch[1];
              extractedData['meaning'] = meansMatch[2].trim();
            } else if (calledMatch) {
              extractedData['vocabulary_word'] = calledMatch[1].trim();
            } else if (translatesMatch) {
              extractedData['translation'] = translatesMatch[1].trim();
            }
          } else if (actType === 'offered_item') {
            const itemMatch = npcMessage.match(/(?:take|give you|offering)\s+(?:this\s+)?(?:a\s+)?["']?([^"'.!,]+)["']?/i);
            if (itemMatch) {
              extractedData['item_name'] = itemMatch[1].trim();
            }
          } else if (actType === 'gave_directions') {
            const dirMatch = npcMessage.match(/(?:go|head|walk|turn|follow)\s+((?:left|right|north|south|east|west|straight)(?:\s+[^.!?]+)?)/i);
            if (dirMatch) {
              extractedData['directions'] = dirMatch[1].trim();
            }
          } else if (actType === 'assigned_quest') {
            const questMatch = npcMessage.match(/(?:I need you to|can you find|please bring)\s+([^.!?]+)/i);
            if (questMatch) {
              extractedData['quest_description'] = questMatch[1].trim();
            }
          }
        }
      }

      if (matchCount > 0) {
        // Confidence: scale based on matches vs total patterns, capped at 1.0
        // 1 match = base 0.3, each additional adds 0.15, max 1.0
        const confidence = Math.min(1.0, 0.3 + (matchCount - 1) * 0.15);

        const act: NPCSpeechAct = {
          type: actType,
          confidence: parseFloat(confidence.toFixed(2)),
        };

        if (Object.keys(extractedData).length > 0) {
          act.extractedData = extractedData;
        }

        // Include npcName in extracted data for context
        act.extractedData = { ...act.extractedData, npcName };

        results.push(act);
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  // ── Private detection methods ──────────────────────────────────────────

  private matchesTopic(message: string, keywords: string[]): boolean {
    const lowerMsg = message.toLowerCase();
    const words = new Set(
      lowerMsg.replace(/[^\wà-ÿ\s]/gi, '').split(/\s+/),
    );
    let matchCount = 0;
    for (const kw of keywords) {
      if (words.has(kw.toLowerCase()) || lowerMsg.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }
    // Require at least 1 keyword match for topic detection
    return matchCount >= 1;
  }

  private isTargetLanguage(message: string, langCode: string): boolean {
    const patterns = TARGET_LANGUAGE_INDICATORS[langCode];
    if (!patterns) {
      // Fallback: check for accented characters common in non-English
      return /[à-ÿÀ-ŸœŒæÆçÇñÑ¿¡]/.test(message);
    }
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) matchCount++;
    }
    // Require at least 2 indicator matches to confirm target language
    return matchCount >= 2;
  }

  private isAnsweringQuestion(npcMessage: string, playerMessage: string): boolean {
    // NPC asked a question if their message ends with ? or starts with question word
    const npcAskedQuestion = QUESTION_INDICATORS.some(p => p.test(npcMessage));
    if (!npcAskedQuestion) return false;

    // Player's response should be substantive (more than just a single word)
    const words = playerMessage.trim().split(/\s+/);
    return words.length >= 2;
  }

  private isRequestingInformation(message: string): boolean {
    return INFORMATION_REQUEST_PATTERNS.some(p => p.test(message));
  }

  private isIntroduction(message: string): boolean {
    return INTRODUCTION_PATTERNS.some(p => p.test(message));
  }
}
