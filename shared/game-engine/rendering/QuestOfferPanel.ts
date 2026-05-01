/**
 * Quest Offer Panel
 *
 * Displays a modal quest offer when the player interacts with a quest-giving NPC.
 * Shows quest title, description, objectives, difficulty, and reward info with
 * Accept / Decline buttons. Fires callbacks so BabylonGame can create the quest
 * or emit a decline event.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
  TextWrapping,
} from '@babylonjs/gui';
import { Scene } from '@babylonjs/core';
import type { CEFRLevel } from '@shared/language/cefr';
import { getLocalizedQuestText } from '@shared/language/quest-localization';

export interface QuestOfferData {
  npcId: string;
  npcName: string;
  questTitle: string;
  questDescription: string;
  questType: string;
  difficulty: string;
  objectives: string;
  category: string;
  rewards?: string;
  /** Translation of the quest title (English when title is in target language) */
  questTitleTranslation?: string;
  /** Translation of the quest description */
  questDescriptionTranslation?: string;
  /** Translation of objectives text */
  objectivesTranslation?: string;
  /** Player's current CEFR level for localized display */
  cefrLevel?: CEFRLevel;
}

export type QuestOfferResult = 'accepted' | 'declined';

export class QuestOfferPanel {
  private gui: AdvancedDynamicTexture;
  private backdrop: Rectangle;
  private panel: Rectangle;
  private visible = false;
  private currentOffer: QuestOfferData | null = null;
  private onResult: ((result: QuestOfferResult, offer: QuestOfferData) => void) | null = null;

  constructor(private scene: Scene) {
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('quest_offer_ui', true, scene);
    this.gui.idealWidth = 1280;

    // Semi-transparent backdrop
    this.backdrop = new Rectangle('quest_offer_backdrop');
    this.backdrop.width = '100%';
    this.backdrop.height = '100%';
    this.backdrop.background = 'rgba(0, 0, 0, 0.55)';
    this.backdrop.thickness = 0;
    this.backdrop.isVisible = false;
    this.backdrop.isPointerBlocker = true;
    this.gui.addControl(this.backdrop);

    // Main panel
    this.panel = new Rectangle('quest_offer_panel');
    this.panel.width = '420px';
    this.panel.height = '400px';
    this.panel.cornerRadius = 12;
    this.panel.background = 'rgba(20, 25, 40, 0.95)';
    this.panel.color = '#FFD700';
    this.panel.thickness = 2;
    this.panel.isVisible = false;
    this.panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.gui.addControl(this.panel);
  }

  setOnResult(callback: (result: QuestOfferResult, offer: QuestOfferData) => void): void {
    this.onResult = callback;
  }

  show(offer: QuestOfferData): void {
    if (this.visible) this.hide();
    this.currentOffer = offer;
    this.visible = true;
    this.buildUI(offer);
    this.backdrop.isVisible = true;
    this.panel.isVisible = true;
  }

  hide(): void {
    this.visible = false;
    this.currentOffer = null;
    this.backdrop.isVisible = false;
    this.panel.isVisible = false;
    // Clear children from the panel so next show starts fresh
    const children = this.panel.children.slice();
    for (const child of children) {
      this.panel.removeControl(child);
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  private buildUI(offer: QuestOfferData): void {
    const stack = new StackPanel('quest_offer_stack');
    stack.width = '100%';
    stack.isVertical = true;
    stack.adaptHeight = true;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    stack.paddingTop = '20px';
    stack.paddingBottom = '20px';
    stack.paddingLeft = '18px';
    stack.paddingRight = '18px';
    this.panel.addControl(stack);

    // NPC name header
    const npcLabel = new TextBlock('qo_npc');
    npcLabel.text = `${offer.npcName} offers you a quest`;
    npcLabel.color = '#C0C0C0';
    npcLabel.fontSize = 13;
    npcLabel.height = '22px';
    npcLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(npcLabel);

    // Quest title — CEFR-aware localization
    const titleDisplay = offer.cefrLevel
      ? getLocalizedQuestText(
          { targetText: offer.questTitle, englishText: offer.questTitleTranslation },
          offer.cefrLevel,
          'title',
        )
      : { primary: offer.questTitle, secondary: undefined, showHoverTranslation: false, showToggleButton: false };

    const title = new TextBlock('qo_title');
    title.text = titleDisplay.primary;
    title.color = '#FFD700';
    title.fontSize = 20;
    title.fontWeight = 'bold';
    title.height = '32px';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    title.paddingTop = '4px';
    stack.addControl(title);

    // Secondary title text (e.g. A1 shows English primary + target subtitle)
    if (titleDisplay.secondary) {
      const titleSub = new TextBlock('qo_title_sub');
      titleSub.text = titleDisplay.secondary;
      titleSub.color = '#A0A8C0';
      titleSub.fontSize = 14;
      titleSub.height = '22px';
      titleSub.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(titleSub);
    }

    // Type + Difficulty row
    const metaRow = new TextBlock('qo_meta');
    const diffLabel = this.formatDifficulty(offer.difficulty);
    metaRow.text = `${this.capitalizeFirst(offer.questType)}  •  ${diffLabel}`;
    metaRow.color = '#A0A8C0';
    metaRow.fontSize = 13;
    metaRow.height = '22px';
    metaRow.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.addControl(metaRow);

    // Separator
    stack.addControl(this.makeSeparator('24px'));

    // Description — CEFR-aware localization
    const descDisplay = offer.cefrLevel
      ? getLocalizedQuestText(
          { targetText: offer.questDescription, englishText: offer.questDescriptionTranslation },
          offer.cefrLevel,
          'description',
        )
      : { primary: offer.questDescription, secondary: undefined, showHoverTranslation: false, showToggleButton: false };

    const desc = new TextBlock('qo_desc');
    desc.text = descDisplay.primary;
    desc.color = '#E0E0E0';
    desc.fontSize = 14;
    desc.textWrapping = TextWrapping.WordWrap;
    desc.resizeToFit = true;
    desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(desc);

    // Secondary description (subtitle for A1)
    if (descDisplay.secondary) {
      const descSub = new TextBlock('qo_desc_sub');
      descSub.text = descDisplay.secondary;
      descSub.color = '#A0A8C0';
      descSub.fontSize = 12;
      descSub.textWrapping = TextWrapping.WordWrap;
      descSub.resizeToFit = true;
      descSub.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(descSub);
    }

    // Spacer after description
    const descSpacer = new Rectangle('qo_desc_spacer');
    descSpacer.width = '100%';
    descSpacer.height = '24px';
    descSpacer.thickness = 0;
    descSpacer.background = 'transparent';
    stack.addControl(descSpacer);

    // Objectives header
    if (offer.objectives) {
      const objHeader = new TextBlock('qo_obj_header');
      objHeader.text = 'Objectives';
      objHeader.color = '#FFD700';
      objHeader.fontSize = 14;
      objHeader.fontWeight = 'bold';
      objHeader.height = '22px';
      objHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(objHeader);

      // Objectives — CEFR-aware localization
      const objDisplay = offer.cefrLevel
        ? getLocalizedQuestText(
            { targetText: offer.objectives, englishText: offer.objectivesTranslation },
            offer.cefrLevel,
            'objective',
          )
        : { primary: offer.objectives, secondary: undefined, showHoverTranslation: false, showToggleButton: false };

      const objText = new TextBlock('qo_obj');
      objText.text = objDisplay.primary;
      objText.color = '#D0D0D0';
      objText.fontSize = 13;
      objText.textWrapping = TextWrapping.WordWrap;
      objText.resizeToFit = true;
      objText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(objText);

      // Secondary objectives (A1 subtitle)
      if (objDisplay.secondary) {
        const objSub = new TextBlock('qo_obj_sub');
        objSub.text = objDisplay.secondary;
        objSub.color = '#A0A8C0';
        objSub.fontSize = 11;
        objSub.textWrapping = TextWrapping.WordWrap;
        objSub.resizeToFit = true;
        objSub.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        stack.addControl(objSub);
      }

      // Spacer after objectives
      const objSpacer = new Rectangle('qo_obj_spacer');
      objSpacer.width = '100%';
      objSpacer.height = '24px';
      objSpacer.thickness = 0;
      objSpacer.background = 'transparent';
      stack.addControl(objSpacer);
    }

    // Rewards
    if (offer.rewards) {
      const rwdHeader = new TextBlock('qo_rwd_header');
      rwdHeader.text = 'Rewards';
      rwdHeader.color = '#32CD32';
      rwdHeader.fontSize = 14;
      rwdHeader.fontWeight = 'bold';
      rwdHeader.height = '22px';
      rwdHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      stack.addControl(rwdHeader);

      const rwdText = new TextBlock('qo_rwd');
      rwdText.text = offer.rewards;
      rwdText.color = '#D0D0D0';
      rwdText.fontSize = 13;
      rwdText.textWrapping = TextWrapping.WordWrap;
      rwdText.resizeToFit = true;
      rwdText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      rwdText.paddingBottom = '24px';
      stack.addControl(rwdText);
    }

    // Separator before buttons
    stack.addControl(this.makeSeparator('24px'));

    // Button row
    const btnRow = new StackPanel('qo_btn_row');
    btnRow.isVertical = false;
    btnRow.height = '44px';
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    btnRow.adaptWidth = true;
    stack.addControl(btnRow);

    // Decline button
    const declineBtn = Button.CreateSimpleButton('qo_decline', 'Decline');
    declineBtn.width = '140px';
    declineBtn.height = '36px';
    declineBtn.color = '#FFFFFF';
    declineBtn.background = 'rgba(180, 60, 60, 0.8)';
    declineBtn.cornerRadius = 8;
    declineBtn.fontSize = 14;
    declineBtn.fontWeight = 'bold';
    declineBtn.thickness = 1;
    declineBtn.hoverCursor = 'pointer';
    declineBtn.paddingRight = '12px';
    declineBtn.onPointerClickObservable.addOnce(() => {
      this.onResult?.('declined', offer);
      this.hide();
    });
    btnRow.addControl(declineBtn);

    // Accept button
    const acceptBtn = Button.CreateSimpleButton('qo_accept', 'Accept Quest');
    acceptBtn.width = '140px';
    acceptBtn.height = '36px';
    acceptBtn.color = '#000000';
    acceptBtn.background = 'rgba(255, 215, 0, 0.9)';
    acceptBtn.cornerRadius = 8;
    acceptBtn.fontSize = 14;
    acceptBtn.fontWeight = 'bold';
    acceptBtn.thickness = 1;
    acceptBtn.hoverCursor = 'pointer';
    acceptBtn.paddingLeft = '12px';
    acceptBtn.onPointerClickObservable.addOnce(() => {
      this.onResult?.('accepted', offer);
      this.hide();
    });
    btnRow.addControl(acceptBtn);
  }

  private makeSeparator(verticalMargin = '4px'): Rectangle {
    const sep = new Rectangle();
    sep.width = '100%';
    sep.height = '1px';
    sep.background = 'rgba(255, 215, 0, 0.3)';
    sep.thickness = 0;
    sep.paddingTop = verticalMargin;
    sep.paddingBottom = verticalMargin;
    return sep;
  }

  private formatDifficulty(diff: string): string {
    const d = diff?.toLowerCase() || 'normal';
    if (d === 'easy' || d === '1') return 'Easy';
    if (d === 'hard' || d === '3') return 'Hard';
    return 'Normal';
  }

  private capitalizeFirst(s: string): string {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  dispose(): void {
    this.hide();
    this.gui.dispose();
  }
}
