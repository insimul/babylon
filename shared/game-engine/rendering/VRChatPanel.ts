/**
 * VR Chat Panel
 *
 * World-space chat panel for NPC conversations in VR.
 * Floats near the NPC being spoken to, supports:
 * - Speech-to-text input (primary in VR)
 * - Scrollable message history
 * - Action buttons for dialogue choices
 * - NPC speech shown as text with TTS audio
 */

import {
  Scene,
  Vector3,
  Mesh,
  Observer,
} from '@babylonjs/core';
import { Color3 } from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { VRUIPanel } from './VRUIPanel';
import { VRManager } from './VRManager';
import { SpeechRecognitionService, isSpeechRecognitionSupported, serverSideSTT } from '@/lib/speech-recognition';
import { processRecordedAudio } from '@/lib/audio-utils';
import { HandsFreeController } from '@/lib/hands-free-controller';

interface VRChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface VRChatCharacter {
  id: string;
  worldId: string;
  firstName: string;
  lastName: string;
  occupation?: string | null;
  personality?: Record<string, any>;
  [key: string]: any;
}

interface VRChatTruth {
  id: string;
  content: string;
  entryType: string;
  [key: string]: any;
}

export class VRChatPanel {
  private scene: Scene;
  private vrManager: VRManager;

  // Main chat panel
  private chatPanel: VRUIPanel | null = null;
  private headerText: GUI.TextBlock | null = null;
  private messagesStack: GUI.StackPanel | null = null;
  private statusText: GUI.TextBlock | null = null;

  // Action buttons panel (separate, below chat)
  private actionsPanel: VRUIPanel | null = null;
  private actionsStack: GUI.StackPanel | null = null;

  // State
  private character: VRChatCharacter | null = null;
  private truths: VRChatTruth[] = [];
  private npcMesh: Mesh | null = null;
  private messages: VRChatMessage[] = [];
  private isVisible: boolean = false;
  private isProcessing: boolean = false;
  private isRecording: boolean = false;

  // Speech-to-text
  private speechService: SpeechRecognitionService | null = null;
  private serverSTTHandle: { stop: () => void } | null = null;
  private currentAudio: HTMLAudioElement | null = null;

  // Hands-free mode (VAD auto-start/stop)
  private handsFreeController: HandsFreeController | null = null;
  private isHandsFreeMode: boolean = false;
  private volumeIndicator: GUI.Rectangle | null = null;
  private volumeBar: GUI.Rectangle | null = null;

  // Render observer for panel positioning
  private positionObserver: Observer<Scene> | null = null;

  // Callbacks
  private onClose: (() => void) | null = null;
  private onConversationTurn: ((keywords: string[]) => void) | null = null;
  private onQuestAssigned: ((questData: any) => void) | null = null;
  private onVocabularyUsed: ((word: string) => void) | null = null;

  // Injectable SDK functions — set from BabylonGame to route through @insimul/typescript
  private _sendTextFn: ((text: string, characterId: string, worldId: string) => Promise<string>) | null = null;
  private _synthesizeSpeechFn: ((text: string) => Promise<ArrayBuffer | null>) | null = null;

  constructor(scene: Scene, vrManager: VRManager) {
    this.scene = scene;
    this.vrManager = vrManager;
  }

  /** Set SDK chat function (routes through InsimulClient.sendText) */
  public setSendTextFn(fn: (text: string, characterId: string, worldId: string) => Promise<string>): void {
    this._sendTextFn = fn;
  }

  /** Set SDK TTS function (routes through InsimulClient.synthesizeSpeech) */
  public setSynthesizeSpeechFn(fn: (text: string) => Promise<ArrayBuffer | null>): void {
    this._synthesizeSpeechFn = fn;
  }

  /**
   * Show chat panel for a character
   */
  public show(character: VRChatCharacter, truths: VRChatTruth[], npcMesh?: Mesh): void {
    this.character = character;
    this.truths = truths;
    this.npcMesh = npcMesh || null;
    this.messages = [];
    this.isVisible = true;

    this.createChatPanel();
    this.createActionsPanel();

    // Position near NPC
    this.updatePanelPosition();

    // Start following NPC position
    this.positionObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.updatePanelPosition();
    });

    // Show greeting
    this.addAssistantMessage(`${character.firstName} nods at you.`);
  }

  /**
   * Hide and clean up panels
   */
  public hide(): void {
    this.isVisible = false;
    this.disableHandsFreeMode();
    this.stopRecording();
    this.stopAudio();

    if (this.positionObserver) {
      this.scene.onBeforeRenderObservable.remove(this.positionObserver);
      this.positionObserver = null;
    }

    this.chatPanel?.dispose();
    this.chatPanel = null;
    this.actionsPanel?.dispose();
    this.actionsPanel = null;

    this.headerText = null;
    this.messagesStack = null;
    this.statusText = null;
    this.actionsStack = null;

    this.onClose?.();
  }

  public isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * Create the main chat panel
   */
  private createChatPanel(): void {
    this.chatPanel = new VRUIPanel(this.scene, 'vr_chat', {
      width: 0.8,
      height: 0.6,
      resolution: 512,
      backgroundColor: new Color3(0.03, 0.03, 0.08),
    });

    const texture = this.chatPanel.getGUITexture();

    const container = new GUI.StackPanel('chat_container');
    container.isVertical = true;
    container.spacing = 4;
    container.paddingTopInPixels = 8;
    container.paddingLeftInPixels = 10;
    container.paddingRightInPixels = 10;
    container.paddingBottomInPixels = 8;
    texture.addControl(container);

    // Header with NPC name
    this.headerText = new GUI.TextBlock('chat_header', '');
    this.headerText.color = '#ffcc44';
    this.headerText.fontSize = 20;
    this.headerText.height = '28px';
    this.headerText.fontWeight = 'bold';
    this.headerText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(this.headerText);

    if (this.character) {
      this.headerText.text = `${this.character.firstName} ${this.character.lastName}`;
      if (this.character.occupation) {
        this.headerText.text += ` — ${this.character.occupation}`;
      }
    }

    // Separator
    const sep = new GUI.Rectangle('chat_sep');
    sep.width = '100%';
    sep.height = '2px';
    sep.background = '#333355';
    sep.thickness = 0;
    container.addControl(sep);

    // Messages area
    this.messagesStack = new GUI.StackPanel('chat_messages');
    this.messagesStack.isVertical = true;
    this.messagesStack.spacing = 6;
    this.messagesStack.adaptHeightToChildren = false;
    this.messagesStack.height = '320px';
    container.addControl(this.messagesStack);

    // Status bar (recording/processing indicator)
    this.statusText = new GUI.TextBlock('chat_status', 'Press trigger to speak');
    this.statusText.color = '#888888';
    this.statusText.fontSize = 14;
    this.statusText.height = '20px';
    this.statusText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(this.statusText);

    // Volume indicator (visible in hands-free mode)
    this.volumeIndicator = new GUI.Rectangle('vr_volume_indicator');
    this.volumeIndicator.width = '200px';
    this.volumeIndicator.height = '6px';
    this.volumeIndicator.background = '#222222';
    this.volumeIndicator.cornerRadius = 3;
    this.volumeIndicator.thickness = 0;
    this.volumeIndicator.isVisible = false;

    this.volumeBar = new GUI.Rectangle('vr_volume_bar');
    this.volumeBar.width = '0%';
    this.volumeBar.height = '100%';
    this.volumeBar.background = '#4CAF50';
    this.volumeBar.cornerRadius = 3;
    this.volumeBar.thickness = 0;
    this.volumeBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.volumeIndicator.addControl(this.volumeBar);
    container.addControl(this.volumeIndicator);

    // Hands-free toggle button
    const hfBtn = GUI.Button.CreateSimpleButton('vr_hf_btn', 'Hands-Free: Off');
    hfBtn.width = '140px';
    hfBtn.height = '30px';
    hfBtn.color = '#ffffff';
    hfBtn.background = '#334466';
    hfBtn.cornerRadius = 4;
    hfBtn.fontSize = 14;
    hfBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    hfBtn.onPointerUpObservable.add(() => {
      this.toggleHandsFreeMode();
      const label = this.isHandsFreeMode ? 'Hands-Free: On' : 'Hands-Free: Off';
      const bg = this.isHandsFreeMode ? '#336633' : '#334466';
      (hfBtn.children[0] as GUI.TextBlock).text = label;
      hfBtn.background = bg;
    });
    container.addControl(hfBtn);

    // Close button
    const closeBtn = GUI.Button.CreateSimpleButton('chat_close', 'Close (Grip)');
    closeBtn.width = '100px';
    closeBtn.height = '30px';
    closeBtn.color = '#ffffff';
    closeBtn.background = '#663333';
    closeBtn.cornerRadius = 4;
    closeBtn.fontSize = 14;
    closeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.onPointerUpObservable.add(() => {
      this.hide();
    });
    container.addControl(closeBtn);

    this.chatPanel.show();

    // Wire VR inputs for recording
    this.vrManager.setOnTriggerPressed((hand) => {
      if (hand === 'right' && this.isVisible && !this.isProcessing) {
        this.startRecording();
      }
    });

    this.vrManager.setOnTriggerReleased((hand) => {
      if (hand === 'right' && this.isRecording) {
        this.stopRecording();
      }
    });

    this.vrManager.setOnGripPressed((hand) => {
      if (hand === 'left' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Create the actions panel (dialogue choices)
   */
  private createActionsPanel(): void {
    this.actionsPanel = new VRUIPanel(this.scene, 'vr_chat_actions', {
      width: 0.8,
      height: 0.2,
      resolution: 512,
      backgroundColor: new Color3(0.05, 0.03, 0.08),
    });

    const texture = this.actionsPanel.getGUITexture();

    this.actionsStack = new GUI.StackPanel('actions_stack');
    this.actionsStack.isVertical = false;
    this.actionsStack.spacing = 8;
    this.actionsStack.paddingTopInPixels = 8;
    this.actionsStack.paddingLeftInPixels = 8;
    texture.addControl(this.actionsStack);

    this.actionsPanel.show();
  }

  /**
   * Set dialogue action buttons
   */
  public setDialogueActions(actions: { id: string; name: string; description?: string }[]): void {
    if (!this.actionsStack) return;

    this.actionsStack.clearControls();

    for (const action of actions.slice(0, 4)) {
      const btn = GUI.Button.CreateSimpleButton(`action_${action.id}`, action.name);
      btn.width = '120px';
      btn.height = '36px';
      btn.color = '#ffffff';
      btn.background = '#334466';
      btn.cornerRadius = 4;
      btn.fontSize = 14;
      btn.onPointerUpObservable.add(() => {
        this.handleActionSelect(action.id);
      });
      this.actionsStack.addControl(btn);
    }
  }

  private handleActionSelect(actionId: string): void {
    // Send as a chat message
    this.addUserMessage(`[Action: ${actionId}]`);
    this.sendMessageToNPC(`[Action: ${actionId}]`);
  }

  /**
   * Update panel position to float near NPC
   */
  private updatePanelPosition(): void {
    if (!this.npcMesh) return;

    const npcPos = this.npcMesh.position;
    const camera = this.scene.activeCamera;
    if (!camera) return;

    // Position the chat panel above and slightly in front of the NPC,
    // facing the player
    const chatPos = new Vector3(
      npcPos.x,
      npcPos.y + 2.2,
      npcPos.z
    );

    this.chatPanel?.setPosition(chatPos);
    this.chatPanel?.lookAt(camera.position);

    // Actions panel below the chat panel
    const actionsPos = new Vector3(
      npcPos.x,
      npcPos.y + 1.5,
      npcPos.z
    );
    this.actionsPanel?.setPosition(actionsPos);
    this.actionsPanel?.lookAt(camera.position);
  }

  // -- Messages --

  private addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content, timestamp: new Date() });
    this.renderMessages();
  }

  private addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content, timestamp: new Date() });
    this.renderMessages();
  }

  private renderMessages(): void {
    if (!this.messagesStack) return;

    this.messagesStack.clearControls();

    // Show last 6 messages
    const recent = this.messages.slice(-6);
    for (const msg of recent) {
      const text = new GUI.TextBlock();
      text.textWrapping = true;
      text.resizeToFit = true;
      text.paddingBottomInPixels = 4;

      if (msg.role === 'user') {
        text.text = `You: ${msg.content}`;
        text.color = '#88bbff';
      } else {
        text.text = `${this.character?.firstName || 'NPC'}: ${msg.content}`;
        text.color = '#ffffff';
      }

      text.fontSize = 15;
      text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.messagesStack.addControl(text);
    }
  }

  // -- Speech-to-Text --

  private async startRecording(): Promise<void> {
    if (this.isRecording || this.isProcessing) return;

    this.isRecording = true;
    this.vrManager.triggerHapticPulse('right', 0.2, 50);

    if (this.statusText) {
      this.statusText.text = 'Listening... Release to send';
      this.statusText.color = '#ff4444';
    }

    if (isSpeechRecognitionSupported()) {
      this.speechService = new SpeechRecognitionService({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        onInterimResult: (text) => {
          if (this.statusText) {
            this.statusText.text = text;
            this.statusText.color = '#ffcc44';
          }
        },
        onFinalResult: (transcript) => {
          this.handleVoiceResult(transcript);
        },
        onError: (err) => {
          console.warn('[VRChatPanel] Speech recognition error:', err);
          this.resetVRRecordingState();
        },
        onEnd: () => {
          this.isRecording = false;
        },
      });
      this.speechService.start();
    } else {
      // Fallback to server-side STT
      try {
        this.serverSTTHandle = await serverSideSTT(
          (transcript) => this.handleVoiceResult(transcript),
          (err) => {
            console.error('[VRChatPanel] Server STT error:', err);
            this.resetVRRecordingState();
          },
        );
      } catch (err) {
        console.error('[VRChatPanel] Failed to start recording:', err);
        this.resetVRRecordingState();
      }
    }
  }

  private stopRecording(): void {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.speechService) {
      this.speechService.stop();
    }
    if (this.serverSTTHandle) {
      this.serverSTTHandle.stop();
      this.serverSTTHandle = null;
    }

    if (this.statusText) {
      this.statusText.text = 'Processing...';
      this.statusText.color = '#ffcc44';
    }
  }

  private resetVRRecordingState(): void {
    this.isRecording = false;
    this.isProcessing = false;
    if (this.statusText && this.isVisible) {
      this.statusText.text = 'Press trigger to speak';
      this.statusText.color = '#888888';
    }
  }

  private async handleVoiceResult(transcript: string): Promise<void> {
    if (!transcript.trim()) {
      this.resetVRRecordingState();
      return;
    }

    this.isProcessing = true;

    try {
      this.addUserMessage(transcript);
      await this.sendMessageToNPC(transcript);
    } catch (err) {
      console.error('[VRChatPanel] STT error:', err);
      if (this.statusText) {
        this.statusText.text = 'Speech recognition failed';
        this.statusText.color = '#ff4444';
      }
    } finally {
      this.resetVRRecordingState();
    }
  }

  // -- NPC Communication --

  private async sendMessageToNPC(userMessage: string): Promise<void> {
    if (!this.character) return;

    try {
      let npcResponse = '';

      if (this._sendTextFn) {
        // Route through SDK
        npcResponse = await this._sendTextFn(userMessage, this.character.id, this.character.worldId);
      } else {
        // Direct fetch fallback
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: this.character.id,
            worldId: this.character.worldId,
            message: userMessage,
            conversationHistory: this.messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!response.ok) throw new Error('Chat API failed');
        const result = await response.json();
        npcResponse = result.message || result.response || '';
      }

      if (npcResponse) {
        this.addAssistantMessage(npcResponse);

        // Extract keywords for quest tracking
        const keywords = npcResponse.split(/\s+/).filter((w: string) => w.length > 4).slice(0, 5);
        this.onConversationTurn?.(keywords);

        // Check for quest data
        if (result.quest) {
          this.onQuestAssigned?.(result.quest);
        }

        // TTS for NPC response
        this.speakText(npcResponse);
      }
    } catch (err) {
      console.error('[VRChatPanel] Chat error:', err);
      this.addAssistantMessage('...');
    }
  }

  private async speakText(text: string): Promise<void> {
    try {
      let audioBlob: Blob | null = null;

      if (this._synthesizeSpeechFn) {
        // Route through SDK
        const buffer = await this._synthesizeSpeechFn(text);
        if (buffer) {
          audioBlob = new Blob([buffer], { type: 'audio/mp3' });
        }
      } else {
        // Direct fetch fallback
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (response.ok) {
          audioBlob = await response.blob();
        }
      }

      if (!audioBlob) return;
      const audioUrl = URL.createObjectURL(audioBlob);

      this.stopAudio();
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.play();

      this.currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };
    } catch {
      // Fallback: use browser speech synthesis
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
      }
    }
  }

  private stopAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  // -- Callback Setters --

  public setOnClose(cb: () => void): void { this.onClose = cb; }
  public setOnConversationTurn(cb: (keywords: string[]) => void): void { this.onConversationTurn = cb; }
  public setOnQuestAssigned(cb: (questData: any) => void): void { this.onQuestAssigned = cb; }
  public setOnVocabularyUsed(cb: (word: string) => void): void { this.onVocabularyUsed = cb; }

  // -- Hands-free mode (VAD auto-start/stop) --

  private toggleHandsFreeMode(): void {
    if (this.isHandsFreeMode) {
      this.disableHandsFreeMode();
    } else {
      this.enableHandsFreeMode();
    }
  }

  private enableHandsFreeMode(): void {
    if (this.isHandsFreeMode) return;

    // Stop any manual recording in progress
    if (this.isRecording) {
      this.stopRecording();
    }

    this.handsFreeController = new HandsFreeController(
      {
        onTranscript: (transcript) => {
          this.handleVoiceResult(transcript);
        },
        onInterimTranscript: (text) => {
          if (this.statusText) {
            this.statusText.text = text;
            this.statusText.color = '#ffcc44';
          }
        },
        onEnergyChange: (energy) => {
          if (this.volumeBar) {
            const pct = Math.min(100, Math.round(energy * 1000));
            this.volumeBar.width = `${pct}%`;
            this.volumeBar.background = energy >= 0.015 ? '#4CAF50' : '#666';
          }
        },
        onSpeechStart: () => {
          if (this.statusText) {
            this.statusText.text = 'Listening...';
            this.statusText.color = '#ff4444';
          }
          this.vrManager.triggerHapticPulse('right', 0.1, 30);
        },
        onSpeechEnd: () => {
          if (this.statusText && !this.isProcessing) {
            this.statusText.text = 'Hands-free: speak to chat...';
            this.statusText.color = '#88cc88';
          }
        },
        onError: (err) => {
          console.error('[VRChatPanel] Hands-free error:', err);
        },
      },
      { lang: 'en-US' },
    );

    this.isHandsFreeMode = true;

    if (this.volumeIndicator) {
      this.volumeIndicator.isVisible = true;
    }
    if (this.statusText) {
      this.statusText.text = 'Hands-free: speak to chat...';
      this.statusText.color = '#88cc88';
    }

    this.handsFreeController.start();
  }

  private disableHandsFreeMode(): void {
    if (!this.isHandsFreeMode) return;

    this.isHandsFreeMode = false;

    if (this.handsFreeController) {
      this.handsFreeController.stop();
      this.handsFreeController = null;
    }

    if (this.volumeIndicator) {
      this.volumeIndicator.isVisible = false;
    }
    if (this.volumeBar) {
      this.volumeBar.width = '0%';
    }
    if (this.statusText) {
      this.statusText.text = 'Press trigger to speak';
      this.statusText.color = '#888888';
    }
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this.disableHandsFreeMode();
    this.hide();
    this.onClose = null;
    this.onConversationTurn = null;
    this.onQuestAssigned = null;
    this.onVocabularyUsed = null;
  }
}
