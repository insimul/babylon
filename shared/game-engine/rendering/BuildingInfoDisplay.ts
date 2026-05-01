/**
 * Building Info Display
 *
 * Displays building information (name, type, occupants) when player hovers
 * or interacts with buildings in the 3D world.
 */

import { Scene, Mesh, ActionManager, ExecuteCodeAction, Vector3 } from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import type { CEFRLevel } from '@shared/language/cefr';
import { getBilingualDisplay, getGameString, type UIImmersionMode, shouldTranslateUIKey } from '@shared/language/ui-localization';
import { buildBilingualBuildingPrompt } from '@shared/language/in-world-text';
import type { TranslationLookupFn } from '@shared/language/action-labels';

export class BuildingInfoDisplay {
  private scene: Scene;
  private advancedTexture: GUI.AdvancedDynamicTexture;
  private infoLabel: GUI.Rectangle | null = null;
  private currentBuilding: Mesh | null = null;
  private _cefrLevel: CEFRLevel = 'A1';
  private _immersionMode: UIImmersionMode = 'auto';
  private _tooltipLabel: GUI.Rectangle | null = null;
  private _translationLookup: TranslationLookupFn | undefined;

  constructor(scene: Scene, advancedTexture: GUI.AdvancedDynamicTexture) {
    this.scene = scene;
    this.advancedTexture = advancedTexture;
  }

  /** Update the CEFR level for immersion-aware building labels. */
  setCEFRLevel(level: CEFRLevel): void {
    this._cefrLevel = level;
  }

  /** Update the UI immersion mode preference. */
  setImmersionMode(mode: UIImmersionMode): void {
    this._immersionMode = mode;
  }

  /** Set a translation lookup function for building type labels. */
  setTranslationLookup(fn: TranslationLookupFn): void {
    this._translationLookup = fn;
  }

  /**
   * Register hover events for a building mesh
   */
  public registerBuilding(building: Mesh): void {
    if (!building.metadata) return;

    // Ensure the building has an action manager
    if (!building.actionManager) {
      building.actionManager = new ActionManager(this.scene);
    }

    // Register pointer over action
    building.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnPointerOverTrigger,
        () => {
          this.showBuildingInfo(building);
        }
      )
    );

    // Register pointer out action
    building.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnPointerOutTrigger,
        () => {
          this.hideBuildingInfo();
        }
      )
    );

    // Make building pickable
    building.isPickable = true;
  }

  /**
   * Show building information label
   */
  private showBuildingInfo(building: Mesh): void {
    if (!building.metadata) return;

    this.currentBuilding = building;
    const metadata = building.metadata;

    // Create info label if it doesn't exist
    if (!this.infoLabel) {
      this.infoLabel = new GUI.Rectangle('buildingInfo');
      this.infoLabel.width = '300px';
      this.infoLabel.height = '120px';
      this.infoLabel.cornerRadius = 8;
      this.infoLabel.color = 'white';
      this.infoLabel.thickness = 2;
      this.infoLabel.background = 'rgba(0, 0, 0, 0.8)';
      this.advancedTexture.addControl(this.infoLabel);

      // Position at top center of screen
      this.infoLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.infoLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
      this.infoLabel.top = '80px';
    }

    // Clear previous content
    this.infoLabel.clearControls();

    // Create content stack
    const stack = new GUI.StackPanel('buildingInfoStack');
    stack.width = '280px';
    stack.paddingTop = '10px';
    stack.paddingBottom = '10px';
    stack.spacing = 5;
    this.infoLabel.addControl(stack);

    // Building name/type header — CEFR-aware bilingual display
    let englishName: string;
    if (metadata.buildingType === 'business') {
      englishName = metadata.businessName || metadata.businessType || 'Business';
    } else if (metadata.buildingType === 'residence') {
      englishName = 'Residence';
    } else {
      englishName = 'Building';
    }
    const translatedName: string | undefined = metadata.translatedName;
    const bilingual = buildBilingualBuildingPrompt(englishName, translatedName, this._cefrLevel);

    const nameText = new GUI.TextBlock('buildingName');
    nameText.text = bilingual.primary;
    nameText.height = '24px';
    nameText.fontSize = 18;
    nameText.fontWeight = 'bold';
    nameText.color = 'white';
    stack.addControl(nameText);

    // Show subtitle if bilingual display provides one
    if (bilingual.subtitle) {
      const subtitleText = new GUI.TextBlock('buildingNameSub');
      subtitleText.text = bilingual.subtitle;
      subtitleText.height = '18px';
      subtitleText.fontSize = 12;
      subtitleText.color = '#AAAAAA';
      subtitleText.fontStyle = 'italic';
      stack.addControl(subtitleText);
    }

    // Hover-to-reveal tooltip for translated labels
    if (bilingual.showTooltip && translatedName) {
      nameText.isPointerBlocker = true;
      nameText.onPointerEnterObservable.add(() => {
        this._showTooltip(englishName);
      });
      nameText.onPointerOutObservable.add(() => {
        this._hideTooltip();
      });
    }

    // Building type subtitle — CEFR-aware translated label
    const englishType = metadata.buildingType === 'business'
      ? (metadata.businessType || 'Business')
      : 'Residence';
    const translatedType = this._translationLookup?.(englishType);
    const typeDisplay = getGameString(englishType, translatedType, 'locations.type', this._cefrLevel, this._immersionMode);

    const typeText = new GUI.TextBlock('buildingType');
    typeText.text = typeDisplay;
    typeText.color = metadata.buildingType === 'business' ? '#FFA500' : '#87CEEB';
    typeText.height = '20px';
    typeText.fontSize = 14;
    stack.addControl(typeText);

    // Separator
    const separator = new GUI.Rectangle('separator');
    separator.height = '2px';
    separator.width = '260px';
    separator.background = 'rgba(255, 255, 255, 0.3)';
    separator.thickness = 0;
    stack.addControl(separator);

    // Occupants/Employees info
    const infoText = new GUI.TextBlock('buildingOccupants');
    if (metadata.buildingType === 'business') {
      const employeeCount = metadata.employees?.length || 0;
      infoText.text = `${employeeCount} employee${employeeCount !== 1 ? 's' : ''}`;
      if (metadata.ownerId) {
        infoText.text += '\nOwner-operated';
      }
    } else if (metadata.buildingType === 'residence') {
      const occupantCount = metadata.occupants?.length || 0;
      infoText.text = `${occupantCount} resident${occupantCount !== 1 ? 's' : ''}`;
    }
    infoText.height = '40px';
    infoText.fontSize = 13;
    infoText.color = '#CCCCCC';
    infoText.textWrapping = true;
    stack.addControl(infoText);

    // Show the label
    this.infoLabel.isVisible = true;
  }

  /**
   * Hide building information label
   */
  private hideBuildingInfo(): void {
    if (this.infoLabel) {
      this.infoLabel.isVisible = false;
    }
    this.currentBuilding = null;
  }

  /**
   * Update label position if it's visible
   * Call this from render loop if you want the label to follow the building
   */
  public update(): void {
    // Currently using fixed position at top of screen
    // Could be enhanced to follow building position in world space
  }

  /** Show a hover-to-reveal tooltip with the English text. */
  private _showTooltip(text: string): void {
    this._hideTooltip();
    const tip = new GUI.Rectangle('buildingTooltip');
    tip.width = '200px';
    tip.height = '28px';
    tip.cornerRadius = 4;
    tip.background = 'rgba(0, 0, 0, 0.9)';
    tip.thickness = 1;
    tip.color = '#666';
    tip.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    tip.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    tip.top = '70px';
    this.advancedTexture.addControl(tip);

    const tipText = new GUI.TextBlock('buildingTooltipText', text);
    tipText.fontSize = 12;
    tipText.color = '#CCCCCC';
    tipText.fontStyle = 'italic';
    tip.addControl(tipText);

    this._tooltipLabel = tip;
  }

  /** Hide the hover tooltip. */
  private _hideTooltip(): void {
    if (this._tooltipLabel) {
      this.advancedTexture.removeControl(this._tooltipLabel);
      this._tooltipLabel.dispose();
      this._tooltipLabel = null;
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this._hideTooltip();
    if (this.infoLabel) {
      this.advancedTexture.removeControl(this.infoLabel);
      this.infoLabel.dispose();
      this.infoLabel = null;
    }
    this.currentBuilding = null;
  }
}
