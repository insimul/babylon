/**
 * Babylon Notice Board Panel
 *
 * In-game panel (N key) showing short articles in the target language.
 * Articles scale with player proficiency. Clicking words adds them
 * to vocabulary, and comprehension questions earn bonus XP.
 */

import * as GUI from '@babylonjs/gui';

export interface NoticeArticle {
  id: string;
  title: string;
  titleTranslation: string;
  body: string;
  bodyTranslation: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  vocabularyWords: { word: string; meaning: string }[];
  comprehensionQuestion?: {
    question: string;
    questionTranslation: string;
    options: string[];
    correctIndex: number;
  };
  /** NPC who "wrote" this notice */
  author?: {
    characterId: string;
    name: string;
    occupation?: string;
  };
  /** Settlement this notice belongs to */
  settlementId?: string;
  /** Quest unlocked by reading this notice */
  questHook?: {
    questId: string;
    questTitle: string;
    questTitleTranslation: string;
  };
  /** Style of the notice on the board */
  noticeType?: 'letter' | 'flyer' | 'official' | 'wanted' | 'advertisement';
  /** Reading skill XP awarded when first read */
  readingXp?: number;
  /** Category of text content */
  documentType?: 'notice' | 'story' | 'poem' | 'document' | 'book' | 'journal' | 'letter' | 'recipe';
  /** Assessment hook — clicking this notice launches an assessment */
  assessmentHook?: {
    assessmentType: 'arrival' | 'departure' | 'periodic';
    buttonLabel: string;
    buttonLabelTranslation: string;
  };
}


export class BabylonNoticeBoardPanel {
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle | null = null;
  private contentStack: GUI.StackPanel | null = null;
  private scrollViewer: GUI.ScrollViewer | null = null;
  private isVisible: boolean = false;

  private playerFluency: number = 0;
  private showTranslations: boolean = true;
  private articles: NoticeArticle[] = [];
  private answeredQuestions: Set<string> = new Set();

  private readArticles: Set<string> = new Set();

  private onClose: (() => void) | null = null;
  private onWordClicked: ((word: string, meaning: string) => void) | null = null;
  private onQuestionAnswered: ((correct: boolean, articleId: string) => void) | null = null;
  private onArticleRead: ((article: NoticeArticle) => void) | null = null;
  private onQuestAccepted: ((questId: string, questTitle: string) => void) | null = null;
  private onAssessmentClicked: ((assessmentType: 'arrival' | 'departure' | 'periodic') => void) | null = null;

  constructor(advancedTexture: GUI.AdvancedDynamicTexture) {
    this.advancedTexture = advancedTexture;
    this.articles = [];
    this.createPanel();
  }

  private createPanel(): void {
    this.container = new GUI.Rectangle('noticeBoardContainer');
    this.container.width = '580px';
    this.container.height = '560px';
    this.container.cornerRadius = 10;
    this.container.color = '#c9a14a';
    this.container.thickness = 3;
    this.container.background = 'rgba(40, 30, 20, 0.95)';
    this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.zIndex = 50;
    this.advancedTexture.addControl(this.container);

    // Title bar
    const titleBar = new GUI.Rectangle('noticeTitleBar');
    titleBar.width = '580px';
    titleBar.height = '50px';
    titleBar.cornerRadius = 10;
    titleBar.background = 'rgba(80, 60, 30, 1)';
    titleBar.thickness = 0;
    titleBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.container.addControl(titleBar);

    const titleText = new GUI.TextBlock('noticeTitle');
    titleText.text = 'Notice Board';
    titleText.fontSize = 20;
    titleText.fontWeight = 'bold';
    titleText.color = '#f5e6c8';
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = '14px';
    this.container.addControl(titleText);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('noticeClose', 'X');
    closeBtn.width = '36px';
    closeBtn.height = '36px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(200, 50, 50, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 16;
    closeBtn.fontWeight = 'bold';
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    closeBtn.top = '7px';
    closeBtn.left = '-8px';
    closeBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onClose?.();
    });
    this.container.addControl(closeBtn);

    // Toggle translations button
    const toggleBtn = GUI.Button.CreateSimpleButton('noticeToggleTrans', 'Show/Hide Translations');
    toggleBtn.width = '160px';
    toggleBtn.height = '26px';
    toggleBtn.color = '#c9a14a';
    toggleBtn.background = 'rgba(60, 50, 30, 0.8)';
    toggleBtn.cornerRadius = 4;
    toggleBtn.fontSize = 11;
    toggleBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggleBtn.top = '56px';
    toggleBtn.left = '10px';
    toggleBtn.onPointerUpObservable.add(() => {
      this.showTranslations = !this.showTranslations;
      this.refreshContent();
    });
    this.container.addControl(toggleBtn);

    // Scroll area
    this.scrollViewer = new GUI.ScrollViewer('noticeScroll');
    this.scrollViewer.width = '560px';
    this.scrollViewer.height = '460px';
    this.scrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scrollViewer.top = '90px';
    this.scrollViewer.thickness = 0;
    this.scrollViewer.barColor = 'rgba(200, 160, 80, 0.8)';
    this.scrollViewer.barBackground = 'rgba(50, 40, 20, 0.5)';
    this.container.addControl(this.scrollViewer);

    this.contentStack = new GUI.StackPanel('noticeContent');
    this.contentStack.width = '540px';
    this.contentStack.spacing = 8;
    this.scrollViewer.addControl(this.contentStack);

    this.container.isVisible = false;
  }

  private getFilteredArticles(): NoticeArticle[] {
    // Assessment notices always appear first, regardless of fluency
    const assessmentArticles = this.articles.filter(a => a.assessmentHook);
    // Filter remaining by difficulty based on fluency
    const regularArticles = this.articles.filter(a => {
      if (a.assessmentHook) return false;
      if (a.difficulty === 'beginner') return true;
      if (a.difficulty === 'intermediate') return this.playerFluency >= 25;
      if (a.difficulty === 'advanced') return this.playerFluency >= 55;
      return true;
    });
    // Reverse so newest articles appear first (most recent at top)
    return [...assessmentArticles, ...regularArticles.reverse()];
  }

  private refreshContent(): void {
    if (!this.contentStack) return;

    const children = this.contentStack.children.slice();
    for (const child of children) {
      this.contentStack.removeControl(child);
      child.dispose();
    }

    const articles = this.getFilteredArticles();

    if (articles.length === 0) {
      const emptyText = new GUI.TextBlock('noticeEmpty');
      emptyText.text = 'No notices available yet.';
      emptyText.fontSize = 14;
      emptyText.color = 'rgba(200, 180, 140, 0.8)';
      emptyText.height = '40px';
      this.contentStack.addControl(emptyText);
      return;
    }

    for (const article of articles) {
      const card = this.createArticleCard(article);
      this.contentStack.addControl(card);
    }
  }

  private getNoticeTypeStyle(noticeType?: string): { border: string; bg: string; icon: string } {
    switch (noticeType) {
      case 'letter': return { border: '#8b7355', bg: 'rgba(60, 45, 25, 0.9)', icon: '\u2709' };
      case 'flyer': return { border: '#c9a14a', bg: 'rgba(55, 45, 20, 0.9)', icon: '\u2606' };
      case 'official': return { border: '#a86832', bg: 'rgba(50, 35, 20, 0.9)', icon: '\u2691' };
      case 'wanted': return { border: '#c44', bg: 'rgba(60, 30, 30, 0.9)', icon: '!' };
      case 'advertisement': return { border: '#4a9', bg: 'rgba(30, 50, 40, 0.9)', icon: '\u2605' };
      default: return { border: 'rgba(200, 160, 80, 0.4)', bg: 'rgba(50, 40, 25, 0.8)', icon: '' };
    }
  }

  private createArticleCard(article: NoticeArticle): GUI.Rectangle {
    // Mark article as read and fire callback on first view
    if (!this.readArticles.has(article.id)) {
      this.readArticles.add(article.id);
      this.onArticleRead?.(article);
    }

    const hasQuestion = article.comprehensionQuestion && !this.answeredQuestions.has(article.id);
    const bodyLines = Math.ceil(article.body.length / 55);
    const translationLines = this.showTranslations ? Math.ceil(article.bodyTranslation.length / 60) : 0;
    const vocabHeight = article.vocabularyWords.length > 0 ? 30 : 0;
    const questionHeight = hasQuestion ? 90 : 0;
    const authorHeight = article.author ? 18 : 0;
    const questHeight = article.questHook ? 34 : 0;
    const assessHeight = article.assessmentHook ? 44 : 0;
    const cardHeight = 50 + authorHeight + bodyLines * 16 + translationLines * 14 + vocabHeight + questionHeight + questHeight + assessHeight + 20;

    const style = this.getNoticeTypeStyle(article.noticeType);

    const card = new GUI.Rectangle(`article_${article.id}`);
    card.width = '530px';
    card.height = `${cardHeight}px`;
    card.cornerRadius = 6;
    card.thickness = 2;
    card.color = style.border;
    card.background = style.bg;

    const diffColor = article.difficulty === 'beginner' ? '#6bbd5b' : (article.difficulty === 'intermediate' ? '#f39c12' : '#e74c3c');

    // Notice type icon + Title
    const titleText = new GUI.TextBlock(`articleTitle_${article.id}`);
    titleText.text = style.icon ? `${style.icon} ${article.title}` : article.title;
    titleText.fontSize = 15;
    titleText.fontWeight = 'bold';
    titleText.color = '#f5e6c8';
    titleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    titleText.left = '12px';
    titleText.top = '8px';
    titleText.height = '20px';
    card.addControl(titleText);

    // Difficulty badge
    const diffBadge = new GUI.Rectangle(`articleDiff_${article.id}`);
    diffBadge.width = '80px';
    diffBadge.height = '18px';
    diffBadge.cornerRadius = 9;
    diffBadge.background = `rgba(${diffColor === '#6bbd5b' ? '107,189,91' : (diffColor === '#f39c12' ? '243,156,18' : '231,76,60')}, 0.3)`;
    diffBadge.thickness = 0;
    diffBadge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    diffBadge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    diffBadge.top = '8px';
    diffBadge.left = '-12px';
    card.addControl(diffBadge);

    const diffText = new GUI.TextBlock(`articleDiffText_${article.id}`);
    diffText.text = article.difficulty;
    diffText.fontSize = 10;
    diffText.fontWeight = 'bold';
    diffText.color = diffColor;
    diffBadge.addControl(diffText);

    let yOffset = 28;

    // Author line
    if (article.author) {
      const authorLine = new GUI.TextBlock(`articleAuthor_${article.id}`);
      const occupation = article.author.occupation ? ` (${article.author.occupation})` : '';
      authorLine.text = `\u2014 ${article.author.name}${occupation}`;
      authorLine.fontSize = 10;
      authorLine.color = 'rgba(200, 180, 140, 0.7)';
      authorLine.fontStyle = 'italic';
      authorLine.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      authorLine.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      authorLine.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      authorLine.left = '12px';
      authorLine.top = `${yOffset}px`;
      authorLine.height = '14px';
      card.addControl(authorLine);
      yOffset += 16;
    }

    // Title translation
    if (this.showTranslations) {
      const titleTrans = new GUI.TextBlock(`articleTitleTrans_${article.id}`);
      titleTrans.text = `(${article.titleTranslation})`;
      titleTrans.fontSize = 11;
      titleTrans.color = 'rgba(180, 160, 120, 0.7)';
      titleTrans.fontStyle = 'italic';
      titleTrans.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      titleTrans.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      titleTrans.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      titleTrans.left = '12px';
      titleTrans.top = `${yOffset}px`;
      titleTrans.height = '16px';
      card.addControl(titleTrans);
      yOffset += 18;
    }
    const bodyText = new GUI.TextBlock(`articleBody_${article.id}`);
    bodyText.text = article.body;
    bodyText.fontSize = 13;
    bodyText.color = '#d0c4a8';
    bodyText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bodyText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bodyText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    bodyText.left = '12px';
    bodyText.top = `${yOffset}px`;
    bodyText.height = `${bodyLines * 16 + 4}px`;
    bodyText.width = '510px';
    bodyText.textWrapping = true;
    card.addControl(bodyText);
    yOffset += bodyLines * 16 + 6;

    // Body translation
    if (this.showTranslations) {
      const bodyTrans = new GUI.TextBlock(`articleBodyTrans_${article.id}`);
      bodyTrans.text = article.bodyTranslation;
      bodyTrans.fontSize = 11;
      bodyTrans.color = 'rgba(160, 150, 120, 0.7)';
      bodyTrans.fontStyle = 'italic';
      bodyTrans.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      bodyTrans.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      bodyTrans.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      bodyTrans.left = '12px';
      bodyTrans.top = `${yOffset}px`;
      bodyTrans.height = `${translationLines * 14 + 4}px`;
      bodyTrans.width = '510px';
      bodyTrans.textWrapping = true;
      card.addControl(bodyTrans);
      yOffset += translationLines * 14 + 6;
    }

    // Vocabulary words as clickable badges
    if (article.vocabularyWords.length > 0) {
      const vocabRow = new GUI.Rectangle(`articleVocab_${article.id}`);
      vocabRow.width = '510px';
      vocabRow.height = '24px';
      vocabRow.thickness = 0;
      vocabRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      vocabRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      vocabRow.left = '12px';
      vocabRow.top = `${yOffset}px`;
      card.addControl(vocabRow);

      let xOff = 0;
      for (const vw of article.vocabularyWords) {
        const wordBtn = GUI.Button.CreateSimpleButton(`vocabBtn_${article.id}_${vw.word}`, vw.word);
        wordBtn.width = `${Math.max(50, vw.word.length * 8 + 16)}px`;
        wordBtn.height = '22px';
        wordBtn.fontSize = 10;
        wordBtn.color = '#c9a14a';
        wordBtn.background = 'rgba(100, 80, 40, 0.5)';
        wordBtn.cornerRadius = 11;
        wordBtn.thickness = 1;
        wordBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        wordBtn.left = `${xOff}px`;
        wordBtn.onPointerUpObservable.add(() => {
          this.onWordClicked?.(vw.word, vw.meaning);
        });
        vocabRow.addControl(wordBtn);
        xOff += Math.max(50, vw.word.length * 8 + 16) + 4;
      }
      yOffset += 28;
    }

    // Comprehension question
    if (hasQuestion && article.comprehensionQuestion) {
      const q = article.comprehensionQuestion;

      const qText = new GUI.TextBlock(`articleQ_${article.id}`);
      qText.text = this.showTranslations ? `${q.question} (${q.questionTranslation})` : q.question;
      qText.fontSize = 12;
      qText.fontWeight = 'bold';
      qText.color = '#e8d8b0';
      qText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      qText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      qText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      qText.left = '12px';
      qText.top = `${yOffset + 4}px`;
      qText.height = '18px';
      qText.width = '510px';
      qText.textWrapping = true;
      card.addControl(qText);

      let optXOff = 0;
      const optRow = new GUI.Rectangle(`articleOpts_${article.id}`);
      optRow.width = '510px';
      optRow.height = '28px';
      optRow.thickness = 0;
      optRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      optRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      optRow.left = '12px';
      optRow.top = `${yOffset + 26}px`;
      card.addControl(optRow);

      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const optBtn = GUI.Button.CreateSimpleButton(`optBtn_${article.id}_${i}`, opt);
        optBtn.width = `${Math.max(80, opt.length * 8 + 20)}px`;
        optBtn.height = '24px';
        optBtn.fontSize = 11;
        optBtn.color = 'white';
        optBtn.background = 'rgba(60, 80, 60, 0.6)';
        optBtn.cornerRadius = 4;
        optBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        optBtn.left = `${optXOff}px`;
        const isCorrect = i === q.correctIndex;
        optBtn.onPointerUpObservable.add(() => {
          this.answeredQuestions.add(article.id);
          this.onQuestionAnswered?.(isCorrect, article.id);
          this.refreshContent();
        });
        optRow.addControl(optBtn);
        optXOff += Math.max(80, opt.length * 8 + 20) + 6;
      }
    }

    // Assessment hook button
    if (article.assessmentHook) {
      const assessBtn = GUI.Button.CreateSimpleButton(
        `assessBtn_${article.id}`,
        this.showTranslations
          ? `${article.assessmentHook.buttonLabel} (${article.assessmentHook.buttonLabelTranslation})`
          : article.assessmentHook.buttonLabel
      );
      assessBtn.width = '510px';
      assessBtn.height = '34px';
      assessBtn.fontSize = 13;
      assessBtn.fontWeight = 'bold';
      assessBtn.color = '#fff';
      assessBtn.background = 'rgba(180, 120, 40, 0.8)';
      assessBtn.cornerRadius = 6;
      assessBtn.thickness = 2;
      assessBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      assessBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      assessBtn.left = '12px';
      assessBtn.top = `${yOffset + 4}px`;
      const assessType = article.assessmentHook.assessmentType;
      assessBtn.onPointerUpObservable.add(() => {
        this.hide();
        this.onAssessmentClicked?.(assessType);
      });
      assessBtn.onPointerEnterObservable.add(() => { assessBtn.background = 'rgba(200, 140, 50, 0.9)'; });
      assessBtn.onPointerOutObservable.add(() => { assessBtn.background = 'rgba(180, 120, 40, 0.8)'; });
      card.addControl(assessBtn);
      yOffset += 40;
    }

    // Quest hook button — clearly labeled as "Accept Quest" so users know
    // clicking starts the quest rather than being a quiz
    if (article.questHook) {
      const questLabel = this.showTranslations
        ? `Accept Quest: ${article.questHook.questTitle} (${article.questHook.questTitleTranslation})`
        : `Accept Quest: ${article.questHook.questTitle}`;
      const questBtn = GUI.Button.CreateSimpleButton(
        `questBtn_${article.id}`,
        questLabel
      );
      questBtn.width = '510px';
      questBtn.height = '28px';
      questBtn.fontSize = 11;
      questBtn.fontWeight = 'bold';
      questBtn.color = '#f5e6c8';
      questBtn.background = 'rgba(80, 120, 60, 0.6)';
      questBtn.cornerRadius = 4;
      questBtn.thickness = 1;
      questBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      questBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      questBtn.left = '12px';
      questBtn.top = `${yOffset + 4}px`;
      questBtn.onPointerUpObservable.add(() => {
        this.onQuestAccepted?.(article.questHook!.questId, article.questHook!.questTitle);
      });
      card.addControl(questBtn);
    }

    return card;
  }

  // --- Public API ---

  public setPlayerFluency(fluency: number): void {
    this.playerFluency = fluency;
  }

  public getArticles(): NoticeArticle[] {
    return [...this.articles];
  }

  public setArticles(articles: NoticeArticle[]): void {
    this.articles = articles;
    if (this.isVisible) this.refreshContent();
  }

  public addArticle(article: NoticeArticle): void {
    this.articles.push(article);
    if (this.isVisible) this.refreshContent();
  }

  public removeArticle(articleId: string): void {
    this.articles = this.articles.filter(a => a.id !== articleId);
    if (this.isVisible) this.refreshContent();
  }

  public show(): void {
    if (this.container) {
      this.container.isVisible = true;
      this.isVisible = true;
      this.refreshContent();
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.isVisible = false;
      this.isVisible = false;
    }
  }

  public toggle(): void {
    if (this.isVisible) this.hide(); else this.show();
  }

  public getIsVisible(): boolean { return this.isVisible; }

  public setOnClose(cb: () => void): void { this.onClose = cb; }
  public setOnWordClicked(cb: (word: string, meaning: string) => void): void { this.onWordClicked = cb; }
  public setOnQuestionAnswered(cb: (correct: boolean, articleId: string) => void): void { this.onQuestionAnswered = cb; }
  public setOnArticleRead(cb: (article: NoticeArticle) => void): void { this.onArticleRead = cb; }
  public setOnQuestAccepted(cb: (questId: string, questTitle: string) => void): void { this.onQuestAccepted = cb; }
  public setOnAssessmentClicked(cb: (assessmentType: 'arrival' | 'departure' | 'periodic') => void): void { this.onAssessmentClicked = cb; }

  public dispose(): void {
    if (this.container) {
      this.advancedTexture.removeControl(this.container);
      this.container.dispose();
      this.container = null;
    }
  }
}
