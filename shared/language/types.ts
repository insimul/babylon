// Shared types for in-world languages (real and constructed) and language-aware chat.

export type LanguageScopeType = 'world' | 'country' | 'state' | 'settlement';

export type LanguageKind = 'real' | 'constructed';

export interface LanguageFeatures {
  wordOrder: 'SOV' | 'SVO' | 'VSO' | 'VOS' | 'OSV' | 'OVS';
  hasGender: boolean;
  hasCase: boolean;
  hasTones: boolean;
  agglutinative: boolean;
  fusional: boolean;
  isolating: boolean;
  hasEvidentiality?: boolean;
  hasAspect?: boolean;
  hasHonorific?: boolean;
  hasClassifiers?: boolean;
  hasIncorporation?: boolean;
  hasSerialVerbs?: boolean;
}

export interface Phonemes {
  consonants: string[];
  vowels: string[];
  clusters: string[];
  tones?: string[];
  stress?: 'initial' | 'final' | 'penultimate' | 'free';
  phonotactics?: string[];
}

export interface GrammarRules {
  nounCases?: string[];
  verbTenses: string[];
  genders?: string[];
  pluralization: string;
  articles?: string[];
  wordFormation?: string[];
  syntaxRules?: string[];
  alignment?: 'nominative-accusative' | 'ergative-absolutive' | 'tripartite' | 'active-stative';
  verbAgreement?: string[];
  questionFormation?: string;
}

export interface WritingSystem {
  type: 'alphabetic' | 'syllabic' | 'logographic' | 'mixed' | 'featural';
  direction: 'ltr' | 'rtl' | 'ttb' | 'boustrophedon';
  hasSpaces: boolean;
  characters?: string[];
  numerals?: string[];
  punctuation?: string[];
  specialFeatures?: string[];
}

export interface CulturalContext {
  region: string;
  speakers: number;
  status: 'living' | 'endangered' | 'extinct' | 'constructed';
  culturalNotes?: string[];
  historicalPeriod?: string;
  geographicalFeatures?: string[];
  socialStructure?: string;
}

export interface PhoneticInventory {
  consonantChart: { [key: string]: string[] };
  vowelChart: { [key: string]: string[] };
  phonotactics: string[];
  allophoneRules?: string[];
  prosody?: ProsodicFeatures;
}

export interface ProsodicFeatures {
  stressPattern: string;
  intonationPatterns: string[];
  rhythmType: 'stress-timed' | 'syllable-timed' | 'mora-timed';
}

export interface SampleText {
  english: string;
  language: string;
  transliteration?: string;
  grammaticalAnalysis?: string[];
  type: 'greeting' | 'question' | 'statement' | 'poem' | 'proverb';
}

export interface Etymology {
  word: string;
  meaning: string;
  origin: string;
  evolution: string[];
  cognates?: { [language: string]: string };
}

export interface DialectVariation {
  name: string;
  region: string;
  differences: {
    phonological?: string[];
    lexical?: { [word: string]: string };
    grammatical?: string[];
  };
}

/**
 * Systematic sound alternation that occurs when morphemes combine
 * (vowel harmony, consonant gradation, ablaut, sandhi, mutation, umlaut).
 */
export interface MorphophonologicalRule {
  name: string;
  type: 'vowel-harmony' | 'consonant-gradation' | 'ablaut' | 'umlaut' | 'sandhi' | 'mutation';
  description: string;
  environment: string;
  examples: Array<{
    base: string;
    modified: string;
    context: string;
    meaning: string;
  }>;
  frequency: 'systematic' | 'common' | 'lexicalized';
}

/**
 * Synchronic phonological process applying within the language
 * (assimilation, lenition, deletion, etc.).
 */
export interface PhonologicalProcess {
  name: string;
  type: 'assimilation' | 'dissimilation' | 'deletion' | 'insertion' | 'metathesis' | 'lenition' | 'fortition';
  description: string;
  examples: Array<{ input: string; output: string; context: string }>;
  frequency: 'common' | 'occasional' | 'rare';
}

/** A sociolinguistic variety of the language (register, age-group, profession, etc.). */
export interface SociolinguisticVariation {
  dimension: 'register' | 'age' | 'gender' | 'class' | 'profession' | 'region';
  name: string;
  description: string;
  features: {
    phonological?: string[];
    lexical?: { [standard: string]: string };
    grammatical?: string[];
    pragmatic?: string[];
  };
  examples: Array<{
    context: string;
    standard: string;
    variant: string;
    explanation: string;
  }>;
}

/** A single inflected form within a paradigm, tagged by its morphosyntactic features. */
export interface InflectedForm {
  /** e.g. { tense: 'past', person: '1', number: 'singular' } or { case: 'genitive', number: 'plural' } */
  features: { [feature: string]: string };
  form: string;
}

/** A complete inflectional paradigm for a representative verb or noun. */
export interface InflectionalParadigm {
  kind: 'verb' | 'noun';
  /** Base/citation form in the constructed language. */
  lemma: string;
  /** English gloss of the lemma. */
  gloss: string;
  forms: InflectedForm[];
}

export interface LanguageStatistics {
  totalLanguages: number;
  familyDistribution: { [key: string]: number };
  featureFrequency: { [key: string]: number };
  complexityAnalysis: {
    phonemeCount: number;
    morphologicalComplexity: number;
    syntacticComplexity: number;
  };
}

export interface LearningModule {
  id: string;
  title: string;
  type: 'vocabulary' | 'grammar' | 'pronunciation' | 'writing';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  content: LearningContent[];
}

export interface LearningContent {
  instruction: string;
  examples: string[];
  exercises?: Exercise[];
}

export interface Exercise {
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  type: 'multiple-choice' | 'fill-blank' | 'translation' | 'pronunciation';
}

export interface ConlangConfig {
  selectedLanguages: string[];
  name: string;
  emphasis: {
    phonology: number;
    grammar: number;
    vocabulary: number;
  };
  complexity: 'simple' | 'moderate' | 'complex';
  purpose: 'artistic' | 'auxiliary' | 'experimental' | 'fictional';
  includeWritingSystem: boolean;
  includeCulturalContext: boolean;
  includeAdvancedPhonetics: boolean;
  generateSampleTexts: boolean;
}

export interface WorldLanguage {
  id: string;
  worldId: string;
  scopeType: LanguageScopeType;
  scopeId: string;
  name: string;
  description?: string | null;

  kind: LanguageKind;
  realCode?: string | null;

  isPrimary: boolean;
  isLearningTarget?: boolean;

  parentLanguageId?: string | null;
  influenceLanguageIds?: string[];
  realInfluenceCodes?: string[];

  config?: ConlangConfig | null;

  features?: LanguageFeatures | null;
  phonemes?: Phonemes | null;
  grammar?: GrammarRules | null;
  writingSystem?: WritingSystem | null;
  culturalContext?: CulturalContext | null;
  phoneticInventory?: PhoneticInventory | null;
  sampleWords?: { [key: string]: string } | null;
  sampleTexts?: SampleText[] | null;
  etymology?: Etymology[] | null;
  dialectVariations?: DialectVariation[] | null;
  learningModules?: LearningModule[] | null;
  morphophonology?: MorphophonologicalRule[] | null;
  phonologicalProcesses?: PhonologicalProcess[] | null;
  sociolinguisticVariations?: SociolinguisticVariation[] | null;
  inflectionalParadigms?: InflectionalParadigm[] | null;

  relatedTruthIds?: string[];
  culturalTruthIds?: string[];
  historicalTruthIds?: string[];
  idiomsAndProverbs?: Array<{
    phrase: string;
    meaning: string;
    culturalContext: string;
    difficulty: string;
  }>;

  uiTranslations?: Record<string, unknown> | null;
  uiTranslationsVersion?: number;
  uiTranslationsGeneratedAt?: Date | null;

  wordTranslationCache?: Record<string, WordCacheEntry> | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface WordCacheEntry {
  translation: string;
  partOfSpeech?: string | null;
  context?: string | null;
  lookupCount: number;
  createdAt: Date;
}

export type InsertWorldLanguage = Omit<WorldLanguage, 'id' | 'createdAt' | 'updatedAt'>;

export interface LanguageChatMessage {
  id: string;
  languageId: string;
  worldId: string;
  scopeType?: LanguageScopeType | null;
  scopeId?: string | null;
  userId?: string | null;
  role: 'user' | 'assistant';
  content: string;
  inLanguage?: string | null;
  createdAt: Date;
}

export type InsertLanguageChatMessage = Omit<LanguageChatMessage, 'id' | 'createdAt'>;
