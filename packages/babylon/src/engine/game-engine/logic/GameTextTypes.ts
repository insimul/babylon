/**
 * Game Text Types
 *
 * Types for the Texts system — reading content collected from the world.
 * Extends the NoticeArticle interface with text categories (book, journal,
 * letter, flyer, recipe) and CEFR levels for the Library.
 */

import type { NoticeArticle } from '@shared/game-engine/types';

/** Text categories for the Library */
export type TextCategory = 'book' | 'journal' | 'letter' | 'flyer' | 'recipe' | 'notice';

/** CEFR language proficiency levels */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** A page of multi-page text content */
export interface TextPage {
  content: string;
  contentTranslation: string;
}

/**
 * GameText represents a collectible reading text in the world.
 * Short notices use body/bodyTranslation directly; longer texts
 * (books, journals) use the pages array for multi-page content.
 */
export interface GameText extends NoticeArticle {
  textCategory: TextCategory;
  cefrLevel?: CefrLevel;
  /** Multi-page content for longer texts */
  pages?: TextPage[];
  /** Where this text was found */
  spawnLocation?: string;
  /** Whether this text has been collected by the player */
  collected?: boolean;
  /** Main quest clue revealed by reading this text */
  clueText?: string;
  /** Tags for filtering/search */
  tags?: string[];
}

/** Maps CEFR levels to difficulty for backward compatibility */
export function cefrToDifficulty(cefr: CefrLevel): 'beginner' | 'intermediate' | 'advanced' {
  switch (cefr) {
    case 'A1': return 'beginner';
    case 'A2': return 'intermediate';
    case 'B1': return 'intermediate';
    case 'B2': return 'advanced';
    case 'C1': return 'advanced';
    case 'C2': return 'advanced';
  }
}

/** Maps difficulty to a default CEFR level */
export function difficultyToCefr(difficulty: 'beginner' | 'intermediate' | 'advanced'): CefrLevel {
  switch (difficulty) {
    case 'beginner': return 'A1';
    case 'intermediate': return 'A2';
    case 'advanced': return 'B1';
  }
}

/** Category display info for the Library UI */
export const TEXT_CATEGORY_INFO: Record<TextCategory, { label: string; icon: string }> = {
  book: { label: 'Books', icon: '\uD83D\uDCD5' },
  journal: { label: 'Journals', icon: '\uD83D\uDCD3' },
  letter: { label: 'Letters', icon: '\u2709\uFE0F' },
  flyer: { label: 'Flyers', icon: '\uD83D\uDCC4' },
  recipe: { label: 'Recipes', icon: '\uD83C\uDF73' },
  notice: { label: 'Notices', icon: '\uD83D\uDCCC' },
};

/** Convert a NoticeArticle to a GameText with notice category */
export function noticeArticleToGameText(article: NoticeArticle): GameText {
  return {
    ...article,
    textCategory: article.documentType === 'story' || article.documentType === 'poem' ? 'book' : 'notice',
    cefrLevel: difficultyToCefr(article.difficulty),
    collected: true,
  };
}

/** Convert a DB GameText (from texts collection) to a NoticeArticle for the notice board */
export function dbTextToNoticeArticle(text: {
  id: string;
  title: string;
  titleTranslation?: string;
  textCategory?: string;
  cefrLevel?: string;
  pages?: { content: string; contentTranslation: string }[];
  vocabularyHighlights?: { word: string; translation: string }[];
  comprehensionQuestions?: { question: string; options: string[]; correctIndex: number }[];
  authorName?: string;
}): NoticeArticle {
  const firstPage = text.pages?.[0];
  return {
    id: text.id,
    title: text.title,
    titleTranslation: text.titleTranslation || '',
    body: firstPage?.content || '',
    bodyTranslation: firstPage?.contentTranslation || '',
    difficulty: cefrToDifficulty((text.cefrLevel || 'A1') as CefrLevel),
    vocabularyWords: (text.vocabularyHighlights || []).map(v => ({ word: v.word, meaning: v.translation })),
    comprehensionQuestion: text.comprehensionQuestions?.[0] ? {
      question: text.comprehensionQuestions[0].question,
      questionTranslation: '',
      options: text.comprehensionQuestions[0].options,
      correctIndex: text.comprehensionQuestions[0].correctIndex,
    } : undefined,
    documentType: (text.textCategory || 'notice') as NoticeArticle['documentType'],
  };
}
