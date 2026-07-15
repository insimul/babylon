/**
 * PuzzleSystem — Manages in-game puzzles including riddles, combination locks,
 * environmental puzzles, translation challenges, and word puzzles.
 *
 * Puzzles can be embedded in quests via quest_objective(QuestId, solve_puzzle, PuzzleId, 1).
 * Language-learning puzzles scale difficulty with player proficiency.
 */

export type PuzzleType = 'riddle' | 'combination' | 'environmental' | 'translation' | 'word_puzzle';
export type PuzzleStatus = 'locked' | 'available' | 'in_progress' | 'solved' | 'failed';

export interface PuzzleHint {
  text: string;
  cost: number; // penalty to score for using this hint
}

export interface PuzzleDefinition {
  id: string;
  type: PuzzleType;
  title: string;
  description: string;
  difficulty: number; // 1-10
  setupData: Record<string, any>; // type-specific setup
  solution: string | string[]; // accepted answer(s)
  hints: PuzzleHint[];
  timeLimit?: number; // seconds, optional
  xpReward: number;
  questId?: string; // linked quest
}

export interface PuzzleAttemptResult {
  correct: boolean;
  message: string;
  hintsUsed: number;
  timeSpent: number;
  score: number; // 0-100
}

export interface ActivePuzzle {
  definition: PuzzleDefinition;
  status: PuzzleStatus;
  startTime: number;
  hintsUsed: number;
  attempts: number;
  maxAttempts: number;
}

export class PuzzleSystem {
  private puzzles: Map<string, PuzzleDefinition> = new Map();
  private activePuzzle: ActivePuzzle | null = null;
  private eventBus: any;

  constructor(eventBus?: any) {
    this.eventBus = eventBus;
  }

  /** Register a puzzle definition */
  registerPuzzle(puzzle: PuzzleDefinition): void {
    this.puzzles.set(puzzle.id, puzzle);
  }

  /** Register multiple puzzles */
  registerPuzzles(puzzles: PuzzleDefinition[]): void {
    puzzles.forEach(p => this.registerPuzzle(p));
  }

  /** Start a puzzle */
  startPuzzle(puzzleId: string): ActivePuzzle | null {
    const def = this.puzzles.get(puzzleId);
    if (!def) return null;

    this.activePuzzle = {
      definition: def,
      status: 'in_progress',
      startTime: Date.now(),
      hintsUsed: 0,
      attempts: 0,
      maxAttempts: def.type === 'riddle' ? 3 : def.type === 'combination' ? 10 : 5,
    };

    this.eventBus?.emit('puzzle_attempted', {
      puzzleId, puzzleType: def.type, attempt: 0
    });

    return this.activePuzzle;
  }

  /** Submit an answer to the active puzzle */
  submitAnswer(answer: string): PuzzleAttemptResult {
    if (!this.activePuzzle || this.activePuzzle.status !== 'in_progress') {
      return { correct: false, message: 'No active puzzle', hintsUsed: 0, timeSpent: 0, score: 0 };
    }

    const puzzle = this.activePuzzle;
    const def = puzzle.definition;
    puzzle.attempts++;

    const timeSpent = (Date.now() - puzzle.startTime) / 1000;

    // Check time limit
    if (def.timeLimit && timeSpent > def.timeLimit) {
      puzzle.status = 'failed';
      this.emitFailed(def, puzzle, 'Time expired');
      return { correct: false, message: 'Time expired!', hintsUsed: puzzle.hintsUsed, timeSpent, score: 0 };
    }

    // Validate answer based on puzzle type
    const correct = this.validateAnswer(def, answer);

    if (correct) {
      puzzle.status = 'solved';
      const score = this.calculateScore(puzzle, timeSpent);

      this.eventBus?.emit('puzzle_solved', {
        puzzleId: def.id, puzzleType: def.type,
        hintsUsed: puzzle.hintsUsed, timeSpent: Math.round(timeSpent),
      });

      this.activePuzzle = null;
      return { correct: true, message: 'Correct!', hintsUsed: puzzle.hintsUsed, timeSpent, score };
    }

    // Check max attempts
    if (puzzle.attempts >= puzzle.maxAttempts) {
      puzzle.status = 'failed';
      this.emitFailed(def, puzzle, 'Max attempts reached');
      this.activePuzzle = null;
      return { correct: false, message: `Incorrect. No more attempts.`, hintsUsed: puzzle.hintsUsed, timeSpent, score: 0 };
    }

    return {
      correct: false,
      message: `Incorrect. ${puzzle.maxAttempts - puzzle.attempts} attempts remaining.`,
      hintsUsed: puzzle.hintsUsed,
      timeSpent,
      score: 0,
    };
  }

  /** Get next available hint */
  getHint(): PuzzleHint | null {
    if (!this.activePuzzle) return null;
    const hints = this.activePuzzle.definition.hints;
    if (this.activePuzzle.hintsUsed >= hints.length) return null;
    const hint = hints[this.activePuzzle.hintsUsed];
    this.activePuzzle.hintsUsed++;
    return hint;
  }

  /** Get active puzzle state */
  getActivePuzzle(): ActivePuzzle | null {
    return this.activePuzzle;
  }

  /** Cancel active puzzle */
  cancelPuzzle(): void {
    if (this.activePuzzle) {
      this.activePuzzle.status = 'failed';
      this.activePuzzle = null;
    }
  }

  /** Validate answer based on puzzle type */
  private validateAnswer(def: PuzzleDefinition, answer: string): boolean {
    const normalized = answer.trim().toLowerCase();
    const solutions = Array.isArray(def.solution) ? def.solution : [def.solution];

    switch (def.type) {
      case 'riddle':
      case 'translation':
        // Exact match (case insensitive) or fuzzy match for translations
        return solutions.some(s => {
          const normalizedSolution = s.trim().toLowerCase();
          if (normalized === normalizedSolution) return true;
          // Fuzzy: allow minor typos (Levenshtein distance <= 2 for short answers)
          if (normalizedSolution.length <= 10) {
            return this.levenshtein(normalized, normalizedSolution) <= 1;
          }
          return this.levenshtein(normalized, normalizedSolution) <= 2;
        });

      case 'combination':
        // Exact sequence match
        return solutions.some(s => normalized === s.trim().toLowerCase());

      case 'environmental':
        // Check if answer matches any accepted interaction sequence
        return solutions.some(s => normalized === s.trim().toLowerCase());

      case 'word_puzzle':
        // Unscramble/fill-in: exact match
        return solutions.some(s => normalized === s.trim().toLowerCase());

      default:
        return solutions.some(s => normalized === s.trim().toLowerCase());
    }
  }

  /** Calculate score (0-100) based on hints used, time, and attempts */
  private calculateScore(puzzle: ActivePuzzle, timeSpent: number): number {
    let score = 100;
    // Deduct for hints
    for (let i = 0; i < puzzle.hintsUsed; i++) {
      score -= puzzle.definition.hints[i]?.cost || 10;
    }
    // Deduct for extra attempts (first attempt is free)
    score -= (puzzle.attempts - 1) * 10;
    // Deduct for time (if time limit set)
    if (puzzle.definition.timeLimit) {
      const timeRatio = timeSpent / puzzle.definition.timeLimit;
      if (timeRatio > 0.75) score -= 10;
      if (timeRatio > 0.9) score -= 10;
    }
    return Math.max(0, Math.min(100, score));
  }

  /** Levenshtein distance for fuzzy matching */
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
      for (let j = 1; j <= b.length; j++) {
        if (i === 0) { matrix[i][j] = j; continue; }
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return matrix[a.length][b.length];
  }

  private emitFailed(def: PuzzleDefinition, puzzle: ActivePuzzle, reason: string): void {
    this.eventBus?.emit('puzzle_failed', {
      puzzleId: def.id, puzzleType: def.type, attempts: puzzle.attempts,
    });
  }

  /** Return 25+ built-in puzzle templates covering all five types */
  static getBuiltInTemplates(): PuzzleDefinition[] {
    return [
      // ===================== RIDDLES (6) =====================
      {
        id: 'riddle_river',
        type: 'riddle',
        title: 'The Flowing Riddle',
        description: 'I have a mouth but never speak, I have a bed but never sleep. What am I?',
        difficulty: 2,
        setupData: {},
        solution: ['river', 'a river'],
        hints: [
          { text: 'Think about nature and water.', cost: 15 },
          { text: 'It flows through the landscape.', cost: 20 },
        ],
        xpReward: 10,
      },
      {
        id: 'riddle_shadow',
        type: 'riddle',
        title: 'The Silent Follower',
        description: 'I follow you everywhere but can never be caught. I disappear in the dark. What am I?',
        difficulty: 2,
        setupData: {},
        solution: ['shadow', 'a shadow', 'your shadow'],
        hints: [
          { text: 'You need light to see me.', cost: 15 },
          { text: 'I copy everything you do.', cost: 20 },
        ],
        xpReward: 10,
      },
      {
        id: 'riddle_fire',
        type: 'riddle',
        title: 'The Living Consumer',
        description: 'I eat everything I touch, yet I am never full. Give me water and I die. What am I?',
        difficulty: 3,
        setupData: {},
        solution: ['fire', 'a fire', 'flame'],
        hints: [
          { text: 'I produce heat and light.', cost: 15 },
          { text: 'Fireplaces contain me.', cost: 25 },
        ],
        xpReward: 15,
      },
      {
        id: 'riddle_echo',
        type: 'riddle',
        title: 'The Copycat Voice',
        description: 'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?',
        difficulty: 5,
        setupData: {},
        solution: ['echo', 'an echo'],
        hints: [
          { text: 'Shout in a canyon and you will find me.', cost: 15 },
          { text: 'I repeat your words back to you.', cost: 20 },
          { text: 'The answer starts with "e".', cost: 30 },
        ],
        xpReward: 20,
      },
      {
        id: 'riddle_silence',
        type: 'riddle',
        title: 'The Fragile Thing',
        description: 'What is so fragile that saying its name breaks it?',
        difficulty: 4,
        setupData: {},
        solution: ['silence'],
        hints: [
          { text: 'It is the absence of something.', cost: 15 },
          { text: 'Libraries demand it.', cost: 25 },
        ],
        xpReward: 15,
      },
      {
        id: 'riddle_stairs',
        type: 'riddle',
        title: 'The Unmoving Climber',
        description: 'I go up and down but never move. What am I?',
        difficulty: 3,
        setupData: {},
        solution: ['stairs', 'staircase', 'a staircase'],
        hints: [
          { text: 'Buildings have them between floors.', cost: 15 },
          { text: 'You walk on me to change elevation.', cost: 20 },
        ],
        xpReward: 12,
      },

      // ===================== COMBINATION (5) =====================
      {
        id: 'combo_sundial',
        type: 'combination',
        title: 'Sundial Sequence',
        description: 'The sundial casts shadows at dawn, noon, and dusk. Enter the hours: dawn (6), noon (12), dusk (6). Combine them.',
        difficulty: 3,
        setupData: { digits: 3, clue: 'dawn-noon-dusk hours' },
        solution: ['6126'],
        hints: [
          { text: 'Dawn is 6 AM, noon is 12, dusk is 6 PM.', cost: 10 },
          { text: 'Concatenate the numbers: 6, 12, 6.', cost: 20 },
        ],
        xpReward: 15,
      },
      {
        id: 'combo_bells',
        type: 'combination',
        title: 'The Bell Tower Code',
        description: 'The bells ring 3 times at morning prayer, 7 at vespers, and 1 at midnight. What is the code?',
        difficulty: 2,
        setupData: { digits: 3, clue: 'bell counts' },
        solution: ['371'],
        hints: [
          { text: 'Morning: 3, Vespers: 7, Midnight: 1.', cost: 10 },
          { text: 'Simply write the numbers in order.', cost: 15 },
        ],
        xpReward: 10,
      },
      {
        id: 'combo_seasons',
        type: 'combination',
        title: 'Seasonal Lock',
        description: 'Four seasons, four numbers. Spring has 5 petals, Summer has 8 rays, Autumn has 3 leaves, Winter has 0 blooms.',
        difficulty: 4,
        setupData: { digits: 4, clue: 'seasonal counts' },
        solution: ['5830'],
        hints: [
          { text: 'Count what each season offers.', cost: 10 },
          { text: 'Order: Spring, Summer, Autumn, Winter.', cost: 15 },
          { text: 'The code is 5-8-3-0.', cost: 40 },
        ],
        xpReward: 18,
      },
      {
        id: 'combo_roman',
        type: 'combination',
        title: 'The Roman Vault',
        description: 'Above the vault door you see: IV - IX - II - VII. Enter the Arabic numerals.',
        difficulty: 5,
        setupData: { digits: 4, clue: 'Roman numeral conversion' },
        solution: ['4927'],
        hints: [
          { text: 'IV = 4, IX = 9.', cost: 10 },
          { text: 'II = 2, VII = 7.', cost: 15 },
        ],
        xpReward: 20,
      },
      {
        id: 'combo_fibonacci',
        type: 'combination',
        title: 'The Mathematician\'s Safe',
        description: 'A plaque reads: "The first six numbers of the golden sequence." Enter just the 5th and 6th numbers.',
        difficulty: 6,
        setupData: { digits: 2, clue: 'Fibonacci 5th and 6th' },
        solution: ['58'],
        hints: [
          { text: 'The golden sequence: 1, 1, 2, 3, ...', cost: 10 },
          { text: '5th is 5, 6th is 8.', cost: 25 },
        ],
        xpReward: 25,
      },

      // ===================== ENVIRONMENTAL (5) =====================
      {
        id: 'env_mirror',
        type: 'environmental',
        title: 'Mirror Reflection',
        description: 'A beam of light enters the room from the east window. Rotate the mirror to direct the beam to the crystal on the north wall. Which direction should the mirror face?',
        difficulty: 4,
        setupData: { lightSource: 'east', target: 'north' },
        solution: ['northeast', 'north-east', 'ne'],
        hints: [
          { text: 'Light reflects at equal angles.', cost: 15 },
          { text: 'The mirror must face between east and north.', cost: 20 },
        ],
        xpReward: 18,
      },
      {
        id: 'env_pressure_plates',
        type: 'environmental',
        title: 'Pressure Plates',
        description: 'Three pressure plates labeled A, B, C. A sign reads: "Step on the plates in alphabetical order, but skip the middle." Which plates do you press?',
        difficulty: 2,
        setupData: { plates: ['A', 'B', 'C'] },
        solution: ['ac', 'a c', 'a,c'],
        hints: [
          { text: 'Alphabetical is A, B, C. The middle is B.', cost: 15 },
        ],
        xpReward: 10,
      },
      {
        id: 'env_water_level',
        type: 'environmental',
        title: 'The Rising Water',
        description: 'You have a 5-gallon bucket and a 3-gallon bucket. How do you measure exactly 4 gallons? Enter the final amount in the 5-gallon bucket.',
        difficulty: 7,
        setupData: { buckets: [5, 3], target: 4 },
        solution: ['4'],
        hints: [
          { text: 'Fill the 5-gallon bucket first.', cost: 10 },
          { text: 'Pour from the 5 into the 3 to leave 2. Then empty the 3, pour the 2 in, fill the 5 again, pour into the 3.', cost: 30 },
        ],
        xpReward: 30,
      },
      {
        id: 'env_bridge',
        type: 'environmental',
        title: 'The Weighted Bridge',
        description: 'The bridge holds exactly 100 kg. You weigh 80 kg and carry three items: a 10 kg sword, a 15 kg shield, and a 5 kg potion. Which item must you leave behind?',
        difficulty: 3,
        setupData: { limit: 100, playerWeight: 80, items: { sword: 10, shield: 15, potion: 5 } },
        solution: ['shield', 'the shield'],
        hints: [
          { text: '80 + 10 + 15 + 5 = 110 kg, which is 10 kg over.', cost: 10 },
          { text: 'You need to drop at least 10 kg. The 5 kg potion is not enough.', cost: 15 },
        ],
        xpReward: 15,
      },
      {
        id: 'env_lever_order',
        type: 'environmental',
        title: 'The Three Levers',
        description: 'Three levers are labeled Red, Blue, Green. A poem reads: "First the sky, then the forest, last the rose." Pull them in the correct order.',
        difficulty: 2,
        setupData: { levers: ['red', 'blue', 'green'] },
        solution: ['blue green red', 'blue,green,red', 'blue, green, red'],
        hints: [
          { text: 'Sky = blue, forest = green, rose = red.', cost: 20 },
        ],
        xpReward: 10,
      },

      // ===================== TRANSLATION (5) =====================
      {
        id: 'trans_greet_latin',
        type: 'translation',
        title: 'Ancient Greeting',
        description: 'The inscription on the door reads "Salve, viator." What is the English translation?',
        difficulty: 3,
        setupData: { sourceLanguage: 'Latin', targetLanguage: 'English', sourceTerm: 'Salve, viator' },
        solution: ['hello traveler', 'hello, traveler', 'greetings traveler', 'greetings, traveler', 'hail traveler', 'hail, traveler'],
        hints: [
          { text: '"Salve" is a Latin greeting.', cost: 10 },
          { text: '"Viator" means traveler.', cost: 15 },
        ],
        xpReward: 15,
      },
      {
        id: 'trans_water_french',
        type: 'translation',
        title: 'Market French',
        description: 'The merchant says: "Avez-vous de l\'eau?" What is he asking?',
        difficulty: 3,
        setupData: { sourceLanguage: 'French', targetLanguage: 'English', sourceTerm: "Avez-vous de l'eau?" },
        solution: ['do you have water', 'do you have any water', 'have you got water'],
        hints: [
          { text: '"Eau" means water.', cost: 10 },
          { text: '"Avez-vous" means "do you have."', cost: 15 },
        ],
        xpReward: 15,
      },
      {
        id: 'trans_thank_japanese',
        type: 'translation',
        title: 'Eastern Gratitude',
        description: 'The elder bows and says "Arigatou gozaimasu." What does it mean?',
        difficulty: 2,
        setupData: { sourceLanguage: 'Japanese', targetLanguage: 'English', sourceTerm: 'Arigatou gozaimasu' },
        solution: ['thank you', 'thank you very much'],
        hints: [
          { text: 'It expresses gratitude.', cost: 10 },
          { text: 'The short form is "arigatou."', cost: 15 },
        ],
        xpReward: 10,
      },
      {
        id: 'trans_friend_spanish',
        type: 'translation',
        title: 'A Friendly Word',
        description: 'Translate "amigo" from Spanish to English.',
        difficulty: 1,
        setupData: { sourceLanguage: 'Spanish', targetLanguage: 'English', sourceTerm: 'amigo' },
        solution: ['friend'],
        hints: [
          { text: 'It describes a close companion.', cost: 15 },
        ],
        xpReward: 8,
      },
      {
        id: 'trans_star_german',
        type: 'translation',
        title: 'Celestial German',
        description: 'The astronomer points to the sky and says "Stern." What does it mean in English?',
        difficulty: 3,
        setupData: { sourceLanguage: 'German', targetLanguage: 'English', sourceTerm: 'Stern' },
        solution: ['star', 'a star'],
        hints: [
          { text: 'It shines at night.', cost: 10 },
          { text: 'The English word also has 4 letters.', cost: 15 },
        ],
        xpReward: 12,
      },

      // ===================== WORD PUZZLES (6) =====================
      {
        id: 'word_anagram_listen',
        type: 'word_puzzle',
        title: 'Anagram: LISTEN',
        description: 'Rearrange the letters in "LISTEN" to form a word meaning "not speaking."',
        difficulty: 3,
        setupData: { scrambled: 'LISTEN', hint: 'not speaking' },
        solution: ['silent'],
        hints: [
          { text: 'The answer means quiet, making no sound.', cost: 10 },
          { text: 'It starts with "S."', cost: 15 },
        ],
        xpReward: 12,
      },
      {
        id: 'word_anagram_earth',
        type: 'word_puzzle',
        title: 'Anagram: EARTH',
        description: 'Rearrange the letters in "EARTH" to form a word meaning the center of something.',
        difficulty: 4,
        setupData: { scrambled: 'EARTH', hint: 'center' },
        solution: ['heart'],
        hints: [
          { text: 'It pumps blood.', cost: 10 },
          { text: 'It starts with "H."', cost: 20 },
        ],
        xpReward: 15,
      },
      {
        id: 'word_missing_letter',
        type: 'word_puzzle',
        title: 'Missing Letters',
        description: 'Fill in the blanks: _N_H_NT (a magical effect placed on something)',
        difficulty: 5,
        setupData: { pattern: '_N_H_NT', category: 'magic' },
        solution: ['enchant'],
        hints: [
          { text: 'Wizards do this to objects.', cost: 10 },
          { text: 'It means to cast a spell on.', cost: 20 },
        ],
        xpReward: 20,
      },
      {
        id: 'word_compound',
        type: 'word_puzzle',
        title: 'Compound Word',
        description: 'Combine two words: Something that falls from the sky + an arched shape = a colorful phenomenon.',
        difficulty: 2,
        setupData: { word1: 'rain', word2: 'bow', category: 'weather' },
        solution: ['rainbow'],
        hints: [
          { text: 'The first word is a type of precipitation.', cost: 10 },
          { text: 'The second word is what an archer uses.', cost: 15 },
        ],
        xpReward: 10,
      },
      {
        id: 'word_reverse',
        type: 'word_puzzle',
        title: 'Backwards Word',
        description: 'Read this word backwards: "DESSERTS." What common word do you get?',
        difficulty: 3,
        setupData: { reversed: 'DESSERTS' },
        solution: ['stressed'],
        hints: [
          { text: 'It describes how you feel under pressure.', cost: 10 },
          { text: 'It starts with "STR."', cost: 15 },
        ],
        xpReward: 12,
      },
      {
        id: 'word_cipher',
        type: 'word_puzzle',
        title: 'Caesar Cipher',
        description: 'Decode this message shifted by 1 letter forward: "TXFTU" (each letter in the answer is one before the cipher letter).',
        difficulty: 6,
        setupData: { cipher: 'TXFTU', shift: 1 },
        solution: ['quest'],
        hints: [
          { text: 'T shifted back by 1 = S... wait, try shifting each letter back.', cost: 10 },
          { text: 'T->S, X->W, F->E, T->S, U->T... that gives SWEST. Try the other way: T->Q...', cost: 15 },
          { text: 'The answer is a 5-letter word meaning an adventure or mission.', cost: 30 },
        ],
        xpReward: 25,
      },
    ];
  }

  /** Generate puzzle templates for language learning */
  static generateLanguagePuzzles(targetLanguage: string, vocabulary: Array<{word: string; meaning: string}>): PuzzleDefinition[] {
    const puzzles: PuzzleDefinition[] = [];

    // Translation puzzles from vocabulary
    for (let i = 0; i < Math.min(vocabulary.length, 5); i++) {
      const item = vocabulary[i];
      puzzles.push({
        id: `translation_${item.word}`,
        type: 'translation',
        title: `Translate: "${item.meaning}"`,
        description: `How do you say "${item.meaning}" in ${targetLanguage}?`,
        difficulty: 3,
        setupData: { sourceLanguage: 'English', targetLanguage, sourceTerm: item.meaning },
        solution: [item.word],
        hints: [
          { text: `It starts with "${item.word[0]}"`, cost: 15 },
          { text: `It has ${item.word.length} letters`, cost: 10 },
          { text: `The answer is "${item.word}"`, cost: 50 },
        ],
        xpReward: 10,
      });
    }

    // Word unscramble puzzles
    for (let i = 0; i < Math.min(vocabulary.length, 3); i++) {
      const item = vocabulary[i];
      const scrambled = item.word.split('').sort(() => Math.random() - 0.5).join('');
      puzzles.push({
        id: `unscramble_${item.word}`,
        type: 'word_puzzle',
        title: `Unscramble: "${scrambled}"`,
        description: `Unscramble this ${targetLanguage} word. Hint: it means "${item.meaning}"`,
        difficulty: 2,
        setupData: { scrambled, meaning: item.meaning },
        solution: [item.word],
        hints: [
          { text: `It means "${item.meaning}"`, cost: 10 },
          { text: `First letter is "${item.word[0]}"`, cost: 15 },
        ],
        xpReward: 8,
      });
    }

    return puzzles;
  }
}
