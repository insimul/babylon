/**
 * DocumentReadingPanel — Babylon.js GUI panel for reading text documents.
 *
 * Displays multi-page documents with:
 *  - Target language text with word-level hover translations
 *  - Page navigation (Previous/Next)
 *  - Full translation toggle
 *  - Comprehension quiz after reading all pages
 *  - Clue discovery notifications
 *  - XP awards scaled by CEFR level
 */

import * as GUI from '@babylonjs/gui';

export interface ReadableDocument {
  id: string;
  title: string;
  titleTranslation: string;
  textCategory: string;
  cefrLevel: string;
  pages: { content: string; contentTranslation: string }[];
  vocabularyHighlights: { word: string; translation: string; partOfSpeech?: string }[];
  comprehensionQuestions: { question: string; options: string[]; correctIndex: number }[];
  authorName?: string | null;
  clueText?: string | null;
  spawnLocationHint?: string;
}

const CEFR_XP: Record<string, number> = { A1: 10, A2: 15, B1: 25, B2: 40 };

const CATEGORY_ICONS: Record<string, string> = {
  book: '\u{1F4D6}',
  journal: '\u{1F4D3}',
  letter: '\u{2709}',
  flyer: '\u{1F4E2}',
  recipe: '\u{1F373}',
  notice: '\u{1F4CB}',
};

export class DocumentReadingPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private isVisible: boolean = false;

  private currentDoc: ReadableDocument | null = null;
  private currentPage: number = 0;
  private showTranslation: boolean = false;
  private quizAnswered: boolean = false;
  private allPagesRead: boolean = false;
  private maxPageReached: number = 0;

  // Callbacks
  private onClose: (() => void) | null = null;
  private onWordClicked: ((word: string, translation: string) => void) | null = null;
  private onQuestionAnswered: ((correct: boolean, docId: string, xp: number) => void) | null = null;
  private onDocumentRead: ((docId: string) => void) | null = null;
  private onClueDiscovered: ((docId: string, clueText: string) => void) | null = null;
  private onVocabularyAdded: ((words: { word: string; translation: string }[]) => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.createPanel();
  }

  // ── Callback setters ──────────────────────────────────

  setOnClose(cb: () => void): void { this.onClose = cb; }
  setOnWordClicked(cb: (word: string, translation: string) => void): void { this.onWordClicked = cb; }
  setOnQuestionAnswered(cb: (correct: boolean, docId: string, xp: number) => void): void { this.onQuestionAnswered = cb; }
  setOnDocumentRead(cb: (docId: string) => void): void { this.onDocumentRead = cb; }
  setOnClueDiscovered(cb: (docId: string, clueText: string) => void): void { this.onClueDiscovered = cb; }
  setOnVocabularyAdded(cb: (words: { word: string; translation: string }[]) => void): void { this.onVocabularyAdded = cb; }

  // ── Public API ─────────────────────────────────────────

  openDocument(doc: ReadableDocument): void {
    this.currentDoc = doc;
    this.currentPage = 0;
    this.showTranslation = false;
    this.quizAnswered = false;
    this.allPagesRead = false;
    this.maxPageReached = 0;
    this.renderContent();
    this.show();
  }

  show(): void {
    if (this.container) {
      this.container.isVisible = true;
      this.isVisible = true;
    }
  }

  hide(): void {
    if (this.container) {
      this.container.isVisible = false;
      this.isVisible = false;
    }
  }

  getIsVisible(): boolean { return this.isVisible; }

  dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
  }

  // ── Panel creation ─────────────────────────────────────

  private createPanel(): void {
    this.container = new GUI.Rectangle('docReadingContainer');
    this.container.width = '620px';
    this.container.height = '600px';
    this.container.cornerRadius = 10;
    this.container.color = '#8b7355';
    this.container.thickness = 3;
    this.container.background = 'rgba(35, 25, 15, 0.97)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 55;
    this.container.isVisible = false;
    this.advancedTexture.addControl(this.container);
  }

  // ── Content rendering ──────────────────────────────────

  private renderContent(): void {
    if (!this.container || !this.currentDoc) return;

    // Clear previous content
    const children = this.container.children.slice();
    for (const child of children) {
      this.container.removeControl(child);
      child.dispose();
    }

    const doc = this.currentDoc;
    const icon = CATEGORY_ICONS[doc.textCategory] || '\u{1F4C4}';

    // Title bar
    const titleBar = new GUI.Rectangle('docTitleBar');
    titleBar.width = '620px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(70, 50, 25, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    const titleText = new GUI.TextBlock('docTitle');
    titleText.text = `${icon} ${doc.title}`;
    titleText.fontSize = 18;
    titleText.fontWeight = 'bold';
    titleText.color = '#f5e6c8';
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = '8px';
    titleText.left = '15px';
    titleText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.container.addControl(titleText);

    // CEFR badge
    const cefrBadge = new GUI.TextBlock('cefrBadge');
    cefrBadge.text = doc.cefrLevel;
    cefrBadge.fontSize = 12;
    cefrBadge.fontWeight = 'bold';
    cefrBadge.color = '#fff';
    cefrBadge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    cefrBadge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    cefrBadge.top = '16px';
    cefrBadge.left = '-55px';
    this.container.addControl(cefrBadge);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('docClose', 'X');
    closeBtn.width = '32px';
    closeBtn.height = '32px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(200, 50, 50, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 14;
    closeBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.top = '9px';
    closeBtn.left = '-10px';
    closeBtn.onPointerClickObservable.add(() => this.close());
    this.container.addControl(closeBtn);

    // Main scroll area
    this.scrollViewer = new GUI.ScrollViewer('docScroll');
    this.scrollViewer.width = '590px';
    this.scrollViewer.height = '480px';
    this.scrollViewer.top = '55px';
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = '#c9a14a';
    this.scrollViewer.barSize = 8;
    this.scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('docContentStack');
    this.contentStack.isVertical = true;
    this.contentStack.width = '560px';
    this.scrollViewer.addControl(this.contentStack);

    // Author line
    if (doc.authorName) {
      const author = new GUI.TextBlock();
      author.text = `By ${doc.authorName}`;
      author.fontSize = 13;
      author.color = '#a89070';
      author.fontStyle = 'italic';
      author.height = '25px';
      author.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      author.paddingLeft = '10px';
      this.contentStack.addControl(author);
    }

    // Determine what to show
    const totalPages = doc.pages.length;
    const hasQuiz = doc.comprehensionQuestions?.length > 0;

    if (!this.allPagesRead || !hasQuiz) {
      // Show current page content
      this.renderPageContent(doc, this.currentPage);
    } else if (!this.quizAnswered && hasQuiz) {
      // Show quiz
      this.renderQuiz(doc);
    }

    // Bottom bar with navigation
    const bottomBar = new GUI.StackPanel('docBottomBar');
    bottomBar.isVertical = false;
    bottomBar.height = '45px';
    bottomBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    bottomBar.width = '600px';
    this.container.addControl(bottomBar);

    // Previous button
    if (!this.allPagesRead || !hasQuiz) {
      const prevBtn = GUI.Button.CreateSimpleButton('docPrev', '< Prev');
      prevBtn.width = '80px';
      prevBtn.height = '35px';
      prevBtn.color = 'white';
      prevBtn.background = this.currentPage > 0 ? 'rgba(100, 80, 50, 0.9)' : 'rgba(60, 50, 40, 0.5)';
      prevBtn.cornerRadius = 5;
      prevBtn.fontSize = 13;
      prevBtn.isEnabled = this.currentPage > 0;
      prevBtn.onPointerClickObservable.add(() => {
        if (this.currentPage > 0) {
          this.currentPage--;
          this.renderContent();
        }
      });
      bottomBar.addControl(prevBtn);

      // Page indicator
      const pageLabel = new GUI.TextBlock();
      pageLabel.text = `  ${this.currentPage + 1} / ${totalPages}  `;
      pageLabel.fontSize = 13;
      pageLabel.color = '#a89070';
      pageLabel.width = '80px';
      pageLabel.height = '35px';
      bottomBar.addControl(pageLabel);

      // Next button
      const nextBtn = GUI.Button.CreateSimpleButton('docNext', this.currentPage < totalPages - 1 ? 'Next >' : 'Done');
      nextBtn.width = '80px';
      nextBtn.height = '35px';
      nextBtn.color = 'white';
      nextBtn.background = 'rgba(100, 80, 50, 0.9)';
      nextBtn.cornerRadius = 5;
      nextBtn.fontSize = 13;
      nextBtn.onPointerClickObservable.add(() => {
        if (this.currentPage < totalPages - 1) {
          this.currentPage++;
          if (this.currentPage > this.maxPageReached) {
            this.maxPageReached = this.currentPage;
          }
          this.renderContent();
        } else {
          // Last page reached
          this.allPagesRead = true;
          this.finishReading();
        }
      });
      bottomBar.addControl(nextBtn);
    }

    // Translation toggle
    const toggleBtn = GUI.Button.CreateSimpleButton('docTransToggle', this.showTranslation ? 'Hide Translation' : 'Show Translation');
    toggleBtn.width = '140px';
    toggleBtn.height = '35px';
    toggleBtn.color = '#f5e6c8';
    toggleBtn.background = 'rgba(60, 80, 100, 0.8)';
    toggleBtn.cornerRadius = 5;
    toggleBtn.fontSize = 12;
    toggleBtn.onPointerClickObservable.add(() => {
      this.showTranslation = !this.showTranslation;
      this.renderContent();
    });
    bottomBar.addControl(toggleBtn);
  }

  private renderPageContent(doc: ReadableDocument, pageIdx: number): void {
    if (!this.contentStack) return;
    const page = doc.pages[pageIdx];
    if (!page) return;

    // Target language text — split into words for hover
    const words = page.content.split(/(\s+)/);
    const vocabMap = new Map<string, string>();
    for (const vh of doc.vocabularyHighlights) {
      vocabMap.set(vh.word.toLowerCase(), vh.translation);
    }

    // Wrap text using TextBlock with word wrapping
    const textBlock = new GUI.TextBlock('pageText');
    textBlock.text = page.content;
    textBlock.fontSize = 15;
    textBlock.color = '#e8d5b0';
    textBlock.textWrapping = GUI.TextWrapping.WordWrap;
    textBlock.resizeToFit = true;
    textBlock.width = '540px';
    textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    textBlock.paddingLeft = '10px';
    textBlock.paddingRight = '10px';
    textBlock.paddingTop = '10px';
    textBlock.lineSpacing = '6px';
    this.contentStack.addControl(textBlock);

    // Translation (if toggled on)
    if (this.showTranslation && page.contentTranslation) {
      const separator = new GUI.Rectangle();
      separator.width = '520px';
      separator.height = '1px';
      separator.background = 'rgba(200, 180, 150, 0.3)';
      separator.thickness = 0;
      separator.paddingTop = '8px';
      this.contentStack.addControl(separator);

      const transBlock = new GUI.TextBlock('pageTrans');
      transBlock.text = page.contentTranslation;
      transBlock.fontSize = 13;
      transBlock.color = '#8a7a65';
      transBlock.fontStyle = 'italic';
      transBlock.textWrapping = GUI.TextWrapping.WordWrap;
      transBlock.resizeToFit = true;
      transBlock.width = '540px';
      transBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      transBlock.paddingLeft = '10px';
      transBlock.paddingRight = '10px';
      transBlock.paddingTop = '8px';
      transBlock.lineSpacing = '4px';
      this.contentStack.addControl(transBlock);
    }

    // Vocabulary section for this page
    if (doc.vocabularyHighlights.length > 0 && pageIdx === doc.pages.length - 1) {
      const vocabHeader = new GUI.TextBlock();
      vocabHeader.text = 'Vocabulary';
      vocabHeader.fontSize = 14;
      vocabHeader.fontWeight = 'bold';
      vocabHeader.color = '#c9a14a';
      vocabHeader.height = '30px';
      vocabHeader.paddingTop = '15px';
      vocabHeader.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      vocabHeader.paddingLeft = '10px';
      this.contentStack.addControl(vocabHeader);

      for (const vh of doc.vocabularyHighlights) {
        const vocabLine = new GUI.TextBlock();
        vocabLine.text = `  ${vh.word}${vh.partOfSpeech ? ` (${vh.partOfSpeech})` : ''} — ${vh.translation}`;
        vocabLine.fontSize = 12;
        vocabLine.color = '#b8a888';
        vocabLine.height = '20px';
        vocabLine.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        vocabLine.paddingLeft = '15px';
        this.contentStack.addControl(vocabLine);
      }
    }
  }

  private renderQuiz(doc: ReadableDocument): void {
    if (!this.contentStack) return;
    const q = doc.comprehensionQuestions[0]; // Show first question
    if (!q) return;

    const qHeader = new GUI.TextBlock();
    qHeader.text = 'Comprehension Check';
    qHeader.fontSize = 16;
    qHeader.fontWeight = 'bold';
    qHeader.color = '#c9a14a';
    qHeader.height = '35px';
    qHeader.paddingTop = '10px';
    this.contentStack.addControl(qHeader);

    const qText = new GUI.TextBlock();
    qText.text = q.question;
    qText.fontSize = 14;
    qText.color = '#e8d5b0';
    qText.textWrapping = GUI.TextWrapping.WordWrap;
    qText.resizeToFit = true;
    qText.width = '520px';
    qText.paddingTop = '10px';
    qText.paddingLeft = '10px';
    this.contentStack.addControl(qText);

    // Answer options
    for (let i = 0; i < q.options.length; i++) {
      const optBtn = GUI.Button.CreateSimpleButton(`quizOpt${i}`, q.options[i]);
      optBtn.width = '500px';
      optBtn.height = '40px';
      optBtn.color = 'white';
      optBtn.background = 'rgba(80, 65, 40, 0.8)';
      optBtn.cornerRadius = 5;
      optBtn.fontSize = 13;
      optBtn.paddingTop = '5px';
      const isCorrect = i === q.correctIndex;
      optBtn.onPointerClickObservable.add(() => {
        this.quizAnswered = true;
        const xp = CEFR_XP[doc.cefrLevel] || 10;
        if (isCorrect) {
          this.onQuestionAnswered?.(true, doc.id, xp);
        } else {
          this.onQuestionAnswered?.(false, doc.id, 0);
        }
        this.renderContent();
      });
      this.contentStack.addControl(optBtn);
    }
  }

  private finishReading(): void {
    if (!this.currentDoc) return;
    const doc = this.currentDoc;

    // Emit document read
    this.onDocumentRead?.(doc.id);

    // Emit vocabulary
    if (doc.vocabularyHighlights.length > 0) {
      this.onVocabularyAdded?.(doc.vocabularyHighlights);
    }

    // Check for clue
    if (doc.clueText) {
      this.onClueDiscovered?.(doc.id, doc.clueText);
    }

    // If there's a quiz, render it; otherwise close
    const hasQuiz = doc.comprehensionQuestions?.length > 0;
    if (hasQuiz) {
      this.renderContent();
    } else {
      this.close();
    }
  }

  private close(): void {
    this.hide();
    this.onClose?.();
  }
}
