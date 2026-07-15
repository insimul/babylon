import {
  AdvancedDynamicTexture,
  Button,
  Container,
  Control,
  InputText,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock,
  TextWrapping
} from "@babylonjs/gui";
import { Scene, Mesh, Vector3 } from "@babylonjs/core";
import { BabylonDialogueActions } from "./BabylonDialogueActions";
import { BabylonGesturePanel } from "./BabylonGesturePanel";
import { HoverTranslationSystem } from "./HoverTranslationSystem";
import type { VocabHint } from "./HoverTranslationSystem";
import { Action } from "../types";
import { NPCTalkingIndicator } from "./NPCTalkingIndicator";
import { buildLanguageAwareSystemPrompt, buildWorldLanguageContext, extractLanguageFluencies, getLanguageBCP47 } from "@shared/language/language-utils";
import type { WorldLanguageContext } from "@shared/language/language-utils";
import { LanguageProgressTracker } from "../logic/LanguageProgressTracker";
import { scorePronunciation, formatPronunciationFeedback } from "@shared/language/pronunciation-scoring";
import { InsimulClient } from '@insimul/typescript';
import * as Sentry from '@sentry/react';
import type { ConversationQuestBridge } from '@shared/game-engine/logic/ConversationQuestBridge';
import type { ConversationState } from '@insimul/typescript';
import type { IDataSource as DataSource } from '@shared/game-engine/data-source';
import { ConversationalActionDetector, type ConversationalAction, type NpcConversationTurnState, type DetectorContext } from "../logic/ConversationalActionDetector";
import { ListenAndRepeatController, type RepeatAttemptResult } from "./ListenAndRepeatController";
import type { ListenAndRepeatPhrase } from "../logic/actions/ListenAndRepeatAction";
import { ConversationDifficultyMonitor, type TurnMetrics } from "../logic/ConversationDifficultyMonitor";
import { buildScaffoldingDirective } from "@shared/language/cefr-adaptation";
import { buildVocabularyRangeSummary } from "@shared/language/vocabulary-frequency";
import type { CEFRLevel } from "@shared/language/cefr";
import type { ChatProviderType, AudioChunkOutput, FacialData } from '@insimul/typescript';
import { StreamingAudioPlayer } from "./StreamingAudioPlayer";
import type { StreamingAudioChunk } from "./StreamingAudioPlayer";
import { LipSyncController } from "./LipSyncController";
import { logLLMChatExchange, logLLMError } from "./LLMDebugLogger";
import { detectHagglingIntent } from "@shared/language/haggling-detection";
import { SpeechRecognitionService, isSpeechRecognitionSupported, serverSideSTT } from "@shared/voice/speech-recognition";
import { processRecordedAudio } from "@shared/voice/audio-utils";
import { HandsFreeController } from "@shared/voice/hands-free-controller";
import { VoiceWebSocketClient } from "@shared/voice/voice-websocket-client";

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface Character {
  id: string;
  worldId: string;
  firstName: string;
  lastName: string;
  age?: number | null;
  gender?: string;
  occupation?: string | null;
  personality?: Record<string, any>;
  currentLocation?: string;
  friendIds?: string[];
  coworkerIds?: string[];
  spouseId?: string | null;
  [key: string]: any;
}

interface Truth {
  id: string;
  title?: string;
  content: string;
  entryType: string;
  timestep: number;
  characterId?: string;
  sourceData?: Record<string, any>;
  [key: string]: any;
}

interface World {
  id: string;
  name: string;
  worldType?: string;
  gameType?: string;
  targetLanguage?: string;
  description?: string;
  [key: string]: any;
}

export let chatInputFocused = false;

export class BabylonChatPanel {
  private _advancedTexture: AdvancedDynamicTexture;
  private scene: Scene;
  private chatContainer: Rectangle | null = null;
  private mainLayout: StackPanel | null = null;
  private messagesScrollViewer: ScrollViewer | null = null;
  private messagesStack: StackPanel | null = null;
  private inputText: InputText | null = null;
  private inputContainer: Container | null = null;
  private micButton: Rectangle | null = null; // Mic status indicator (non-interactive - hidden, used internally for state tracking)
  private inputArea: Rectangle | null = null; // Input area container (hidden during eavesdrop)
  private titleText: TextBlock | null = null; // Store reference to title text
  private _closeBtn: Button | null = null; // Store reference to close button
  private loadingIndicator: TextBlock | null = null; // Loading indicator
  /** Cached message TextBlock controls indexed by position — avoids full rebuild */
  private _messageControls: Map<number, TextBlock> = new Map();
  /** Smooth scroll animation frame handle */
  private _scrollAnimFrame: number | null = null;
  private streamingResponse: TextBlock | null = null; // Streaming response text
  private character: Character | null = null;
  private truths: Truth[] = [];
  private world: World | null = null;
  private playthroughId: string | null = null;
  private worldLanguageContext: WorldLanguageContext | null = null;
  private playerInventoryContext: string = '';
  private languageTracker: LanguageProgressTracker | null = null;
  private playerCefrLevel: CEFRLevel | null = null;
  /** Previous CEFR level when last conversation started — used to detect improvement */
  private _previousCefrLevel: CEFRLevel | null = null;
  private messages: Message[] = [];
  private isVisible = false;
  private nearbyNPCName: string | null = null;
  private _npcIndicator: Rectangle | null = null;
  private _npcIndicatorText: TextBlock | null = null;
  private _enterKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _inputFocused = false;
  private isProcessing = false;
  private _hintTimer: ReturnType<typeof setTimeout> | null = null;
  private _hintShown = false;
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private _copyOverlay: Rectangle | null = null;
  private _patienceTimer: ReturnType<typeof setTimeout> | null = null;
  private _sessionGrammarErrors: Map<string, number> = new Map(); // pattern -> error count this session
  private _grammarFocusShown: Set<string> = new Set(); // patterns already shown focus popup

  // Audio queue for sentence-level TTS playback
  private audioQueue: { index: number; blob: Blob; skipped?: boolean }[] = [];
  private isPlayingQueue = false;
  private expectedSentenceCount = -1; // set by server's totalSentences signal
  private _receivedStreamingAudio = false; // tracks whether streaming audio arrived during this response
  private _debugTimeToFirstChunk = 0; // captures time-to-first-chunk for LLM debug logging
  private _debugStreamStartTime = 0; // request start time for TTFC calculation

  // Voice locked at conversation start — prevents mid-conversation voice drift
  // if the character object is mutated by external systems (NPC scheduler, etc.)
  private _lockedVoice: string = 'Charon';
  private _lockedGender: string = 'neutral';

  // Audio / Speech Recognition
  private speechService: SpeechRecognitionService | null = null;
  private serverSTTHandle: { stop: () => void } | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isRecording = false;
  private isSpeaking = false;

  // AI provider setting: 'auto' | 'browser' | 'server'
  private _aiProvider: string = 'server';

  // Unified Insimul SDK client (replaces ConversationClient + BrowserAIClient + LocalAIClient)
  private insimulClient: InsimulClient | null = null;
  // Quest bridge — evaluates conversation objectives via metadata response
  private questBridge: ConversationQuestBridge | null = null;
  // Event bus for emitting quest-tracking events (grammar, translation, friendship)
  private _gameEventBus: any = null;
  // Per-NPC conversation counter for friendship tracking
  private _npcConversationCounts: Map<string, number> = new Map();
  // Player position for NPC-facing (set by BabylonGame before show())
  private _playerPosition: Vector3 | null = null;
  private streamingAudioPlayer: StreamingAudioPlayer | null = null;
  private lipSyncController: LipSyncController | null = null;
  private _grpcAvailable: boolean | null = null; // null = unchecked
  private _conversationState: ConversationState = 'idle';
  private _stateIndicator: TextBlock | null = null;

  // WebSocket voice chat
  private voiceWSClient: VoiceWebSocketClient | null = null;
  private voiceMode: 'push-to-talk' | 'always-on' = 'push-to-talk';
  private _voiceInputMode: 'push-to-talk' | 'auto-listen' = 'auto-listen';

  // Always-on mic (VAD auto-start/stop)
  private handsFreeController: HandsFreeController | null = null;
  private isHandsFreeMode = false;

  // Gemini Live session state
  private _liveResponsePlaceholder: Message | null = null;
  private _liveAudioStream: MediaStream | null = null;
  private _liveAudioContext: AudioContext | null = null;
  private _liveAudioProcessor: ScriptProcessorNode | null = null;

  // Dialogue Actions
  private dialogueActions: BabylonDialogueActions | null = null;
  private actionsContainer: Container | null = null;
  private availableActions: Action[] = [];
  private playerEnergy: number = 100;

  // Gesture Panel (non-verbal actions during conversation)
  private gesturePanel: BabylonGesturePanel | null = null;

  // Talking Indicator
  private talkingIndicator: NPCTalkingIndicator | null = null;
  private npcMesh: Mesh | null = null;

  // Callbacks
  private onClose: (() => void) | null = null;
  private onQuestAssigned: ((questData: any) => void) | null = null;
  private onQuestBranched: ((questId: string, choiceId: string, targetStageId: string) => void) | null = null;
  private onActionSelect: ((actionId: string) => void) | null = null;
  private onGesturePerformed: ((gestureId: string) => void) | null = null;
  private onVocabularyUsed: ((word: string) => void) | null = null;
  private onConversationTurn: ((keywords: string[]) => void) | null = null;
  private onNPCConversationStarted: ((npcId: string) => void) | null = null;
  private onQuestTurnedIn: ((questId: string, rewards: any) => void) | null = null;
  private onNPCSpeechUpdate: ((text: string) => void) | null = null;
  private onFluencyGain: ((fluency: number, gain: number) => void) | null = null;
  private onConversationSummary: ((result: any) => void) | null = null;
  private onDialogueRating: ((messageIndex: number, rating: number) => void) | null = null;
  private onChatExchange: ((npcId: string, playerMessage: string, npcResponse: string) => void) | null = null;
  private onTalkRequested: (() => void) | null = null;
  private onNpcConversationTurn: ((npcId: string, topicTag: string | undefined) => void) | null = null;
  private onWritingSubmitted: ((text: string, wordCount: number) => void) | null = null;
  private onConversationalAction: ((actions: ConversationalAction[], turnState: NpcConversationTurnState) => void) | null = null;
  private onListenAndRepeat: ((result: RepeatAttemptResult) => void) | null = null;
  private conversationalActionDetector = new ConversationalActionDetector();
  private listenAndRepeatController: ListenAndRepeatController | null = null;
  private _pendingListenAndRepeatPhrase: ListenAndRepeatPhrase | null = null;
  private _questTopics: Array<{ questId: string; keywords: string[] }> = [];
  private systemPromptAugmentation: ((npcId: string) => string | null) | null = null;
  private _relationshipManager: import('../logic/RelationshipManager').RelationshipManager | null = null;
  private pendingTurnInQuests: any[] = [];
  private questOfferingContext: { questTitle: string; questDescription: string; questType: string; difficulty: string; objectives: string; category: string } | null = null;
  private activeQuestFromNPC: { questTitle: string; questDescription: string; questId: string; isQuestGiver?: boolean } | null = null;
  private questGuidancePrompt: string | null = null;
  private _activeQuestObjectiveDetails: string | null = null;
  private _targetLanguage: string | null = null;
  private _timeOfDay: string | null = null;
  /** Recent proximity greeting text for conversation continuation (US-013). */
  private _recentGreeting: string | null = null;

  // Hover-to-translate system for target-language words
  private hoverTranslation: HoverTranslationSystem = new HoverTranslationSystem();
  private _translationTooltip: Rectangle | null = null;
  private _translationTooltipText: TextBlock | null = null;
  /** Message controls that have been rebuilt with interactive word hover */
  private _interactiveMessages: Set<number> = new Set();

  // Dynamic mid-conversation scaffolding monitor
  private _difficultyMonitor = new ConversationDifficultyMonitor();
  private _scaffoldingIndicator: TextBlock | null = null;

  // Listening mode — hides NPC text and shows audio waveform during listening exams
  private _listeningMode = false;
  private _listeningAudioElement: HTMLAudioElement | null = null;
  private _listeningWaveformBars: Rectangle[] = [];
  private _listeningWaveformContainer: StackPanel | null = null;
  private _listeningStatusText: TextBlock | null = null;
  private _listeningReplayBtn: Rectangle | null = null;
  private _listeningReplaysRemaining = 0;
  private _listeningOnReplay: (() => void) | null = null;
  private _listeningWaveformInterval: ReturnType<typeof setInterval> | null = null;

  // Expose advancedTexture for debugging
  public get advancedTexture() {
    return this._advancedTexture;
  }

  constructor(advancedTexture: AdvancedDynamicTexture, scene: Scene) {
    this._advancedTexture = advancedTexture;
    this.scene = scene;
    this.talkingIndicator = new NPCTalkingIndicator(scene);
    
    // Test if GUI texture is working
    
    // Add window resize listener
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Initialize the chat panel UI (hidden by default).
   * Call this once after construction so the NPC indicator is available.
   */
  public initialize(): void {
    if (!this.chatContainer) {
      this.createChatUI();
    }
    this.updateNPCIndicator();
  }

  /**
   * Called by BabylonGame each frame with the name of the nearest NPC within
   * interaction range, or null if none. Updates the NPC indicator.
   */
  public setNearbyNPC(npcName: string | null): void {
    if (this.nearbyNPCName === npcName) return;
    this.nearbyNPCName = npcName;
    this.updateNPCIndicator();
  }

  /** Update the NPC indicator widget visibility and text. */
  private updateNPCIndicator(): void {
    if (!this._npcIndicator || !this._npcIndicatorText) return;
    if (this.nearbyNPCName && !this.isVisible) {
      this._npcIndicatorText.text = `[G]: Talk to ${this.nearbyNPCName}`;
      this._npcIndicator.isVisible = true;
    } else {
      this._npcIndicator.isVisible = false;
    }
  }

  /** Reposition the NPC indicator to the given top offset (called when HUD layout changes). */
  public setNpcIndicatorTop(top: number): void {
    if (this._npcIndicator) {
      this._npcIndicator.top = `${top}px`;
    }
  }

  /**
   * Update the player's CEFR level. Invalidates cached system prompt so the next
   * conversation uses updated NPC language behavior.
   */
  public updateCefrLevel(level: CEFRLevel): void {
    if (level !== this.playerCefrLevel) {
      this._previousCefrLevel = this.playerCefrLevel;
      this.playerCefrLevel = level;
      this._cachedSystemPrompt = null;
    }
  }

  /**
   * Start push-to-talk recording (called on key down).
   */
  public startPushToTalk(): void {
    if (!this.isVisible || this.isProcessing) return;
    if (!this.isRecording) {
      this.startRecording();
    }
  }

  /**
   * Stop push-to-talk recording (called on key up).
   */
  public stopPushToTalk(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  public show(character: Character, truths: Truth[], npcMesh?: Mesh, cefrLevel?: CEFRLevel | null) {
    this.character = character;
    this.truths = truths;
    this.npcMesh = npcMesh || null;

    // Track CEFR level changes between conversations
    if (cefrLevel) {
      this._previousCefrLevel = this.playerCefrLevel;
      this.playerCefrLevel = cefrLevel;
      // Invalidate system prompt cache so NPC language mode reflects current level
      this._cachedSystemPrompt = null;
    }
    this.isVisible = true;

    // Lock voice/gender at conversation start so it never drifts mid-conversation
    this._lockedGender = (character.gender || 'neutral').toLowerCase();
    this._lockedVoice = this._lockedGender === 'female' ? 'Kore' : 'Charon';

    // Clear previous messages and translation state for new conversation
    this.messages = [];
    this.hoverTranslation.clear();
    this._interactiveMessages.clear();
    this._difficultyMonitor.reset();
    if (this._scaffoldingIndicator) this._scaffoldingIndicator.isVisible = false;

    // Initialize streaming conversation client
    this.initConversationClient(character, npcMesh);

    // Notify that conversation started with this NPC (for quest tracking)
    if (this.onNPCConversationStarted) {
      this.onNPCConversationStarted(character.id);
    }

    // Track per-NPC conversation count for friendship/rapport objectives
    const npcCount = (this._npcConversationCounts.get(character.id) || 0) + 1;
    this._npcConversationCounts.set(character.id, npcCount);
    if (this._gameEventBus) {
      (this._gameEventBus as any).emit({
        type: 'friendship_changed',
        npcId: character.id,
        relationshipStrength: Math.min(npcCount / 5, 1), // normalize: 5 conversations = max rapport
      });
    }

    // Fetch world data for context
    this.fetchWorldData(character.worldId);

    // Check for quests ready to turn in from this NPC
    this.checkQuestTurnIn(character.id, character.worldId);

    if (this._npcIndicator) this._npcIndicator.isVisible = false;

    if (this.chatContainer) {
      // Chat container already exists — restore full size and bottom-right position
      this.chatContainer.isVisible = true;
      this.chatContainer.width = '320px';
      this.chatContainer.height = '350px';
      this.chatContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      this.chatContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
      this.chatContainer.left = '0px';
      this.chatContainer.top = '0px';
      this.chatContainer.alpha = 1;
      this.chatContainer.zIndex = 50;

      // Update the character name in the header
      if (this.titleText) {
        this.titleText.text = `${character.firstName} ${character.lastName}`;
        this.titleText.fontSize = 13;
      }

      // Show close and copy buttons when expanded
      if (this._closeBtn) this._closeBtn.isVisible = true;

      // Re-register Enter key handler (removed on hide)
      this._reregisterEnterHandler();

      this.initializeChat();
      this.showGesturePanel();
      this._advancedTexture.markAsDirty();
      return;
    }

    // Create the chat UI for the first time
    this.createChatUI();
    this.initializeChat();
    this.showGesturePanel();
  }

  private async fetchWorldData(worldId: string) {
    try {
      if (!this._dataSource) throw new Error('No dataSource set — save file not loaded');
      this.world = await this._dataSource.loadWorld(worldId);
      const languages = await this._dataSource.getLanguages(worldId);
      if (languages?.length > 0) {
        this.worldLanguageContext = buildWorldLanguageContext(
          languages,
          this.world?.gameType || this.world?.worldType,
          this.world?.targetLanguage,
        );
      }

      // World data loaded — re-trigger setCharacter to rebuild the system prompt
      // now that worldLanguageContext is available. The initial prompt built during
      // initConversationClient may have been missing language directives.
      if (this.insimulClient && this.character) {
        this._cachedSystemPrompt = null; // force rebuild
        this.insimulClient.setCharacter(
          this.character.id,
          this.character.worldId,
          this.character.gender || undefined,
        );
      }
    } catch (error) {
      console.error('Failed to fetch world data:', error);
    }
  }

  /**
   * Initialize the gRPC streaming conversation client, audio player, and lip sync.
   * Falls back to direct Gemini API if conversation service is unavailable.
   */
  private initConversationClient(character: Character, npcMesh?: Mesh): void {
    // Dispose previous instances
    this.streamingAudioPlayer?.dispose();
    this.lipSyncController?.dispose();

    // Resolve chat provider type from AI provider setting
    const chatType: ChatProviderType = this._aiProvider === 'browser' ? 'browser' : 'server';

    // Helper to apply character + voice settings once the provider is ready
    const applyCharacterSettings = () => {
      this.insimulClient!.setCharacter(character.id, character.worldId);
      const gender = (character.gender || 'male').toLowerCase();
      const lang = this.world?.targetLanguage
        ? getLanguageBCP47(this.world.targetLanguage)
        : 'en';
      this.insimulClient!.setVoice({ gender, language: lang });
    };

    // Create InsimulClient (reuses session across same character)
    if (!this.insimulClient) {
      this.insimulClient = new InsimulClient({
        chat: chatType,
        tts: this._aiProvider === 'browser' ? 'browser' : 'server',
        stt: 'none',
        serverUrl: '', // empty = same origin
        llmModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
        onLoadProgress: (pct: number, status: string) => {
        },
        systemPromptBuilder: this.buildSystemPrompt.bind(this),
      });

      // Initialize async — apply character settings once provider is ready, then try Live session
      this.insimulClient.initialize().then(async () => {
        this._grpcAvailable = true;
        applyCharacterSettings();
        console.log(`[ChatPanel] InsimulClient ready (chat=${this.insimulClient?.getChatType()}, tts=${this.insimulClient?.getTTSType()})`);
        // Attempt to start a Gemini Live session for bidirectional audio streaming
        await this.tryStartLiveSession();
      }).catch((err: any) => {
        console.warn('[ChatPanel] InsimulClient init failed:', err.message);
        this._grpcAvailable = false;
      });
    } else {
      // Client already initialized — apply settings immediately
      applyCharacterSettings();

      // End the previous Live session and start a new one for the new NPC
      if (this.insimulClient.isLiveSession) {
        this.insimulClient.endLiveSession().catch(() => {});
      }
      this.tryStartLiveSession();
    }

    this.insimulClient.setCharacter(character.id, character.worldId, character.gender || undefined);

    // Set TTS voice to match character gender + target language
    const gender = (character.gender || 'male').toLowerCase();
    const lang = this.world?.targetLanguage
      ? getLanguageBCP47(this.world.targetLanguage)
      : 'en';
    this.insimulClient.setVoice({ gender, language: lang });

    // Set up streaming audio player
    this.streamingAudioPlayer = new StreamingAudioPlayer({
      preBufferCount: 2,
      npcPosition: npcMesh ? npcMesh.position : undefined,
      maxDistance: 50,
    });
    this.streamingAudioPlayer.setCallbacks({
      onStart: () => {
        this.isSpeaking = true;
        if (this.talkingIndicator && this.character && this.npcMesh) {
          this.talkingIndicator.show(this.character.id, this.npcMesh);
        }
        this.updateConversationStateIndicator('speaking');
        // Don't pause mic during Live sessions — server handles echo cancellation
        // and continuous audio is needed for natural interruption support
        if (!this.insimulClient?.isLiveSession) {
          this.handsFreeController?.pause();
        }
      },
      onComplete: () => {
        this.isSpeaking = false;
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        this.updateConversationStateIndicator('idle');
        if (!this.insimulClient?.isLiveSession) {
          this.handsFreeController?.resume();
        }
      },
    });

    // Set up lip sync controller
    if (npcMesh) {
      this.lipSyncController = new LipSyncController(this.scene, npcMesh);
      this.lipSyncController.setAudioPlayer(this.streamingAudioPlayer);
    }

    // Wire InsimulClient callbacks
    this.insimulClient.on({
      onTextChunk: (_text: string, _isFinal: boolean) => {
        // Text handled directly in sendMessageViaGrpc
      },
      onAudioChunk: (chunk: AudioChunkOutput) => {
        if (this.streamingAudioPlayer) {
          this.streamingAudioPlayer.pushChunk(chunk as StreamingAudioChunk);
        }
      },
      onFacialData: (data: FacialData) => {
        if (this.lipSyncController) {
          this.lipSyncController.pushFacialData(data);
        }
      },
      onStateChange: (state: ConversationState) => {
        this._conversationState = state;
        this.updateConversationStateIndicator(state);
      },
      onError: (err: Error) => {
        console.error('[ChatPanel] InsimulClient error:', err);
      },
    });

    // Check availability asynchronously (cache result)
    if (this._grpcAvailable === null) {
      this.insimulClient.isAvailable().then((available: boolean) => {
        this._grpcAvailable = available;
      });
    }
  }

  /**
   * Attempt to start a Gemini Live session for bidirectional audio streaming.
   * Falls back silently to text+TTS pipeline if Live session creation fails.
   */
  private async tryStartLiveSession(): Promise<void> {
    if (!this.insimulClient || !this.character) return;
    try {
      const lang = this.world?.targetLanguage
        ? getLanguageBCP47(this.world.targetLanguage)
        : 'en';
      await this.insimulClient.startLiveSession({
        characterId: this.character.id,
        worldId: this.character.worldId,
        systemPrompt: this.buildSystemPrompt(),
        voiceName: this._lockedVoice,
        languageCode: lang,
      });
      this.wireLiveSessionCallbacks();
      console.log('[ChatPanel] Live session started');
    } catch (err: any) {
      console.warn('[ChatPanel] Live session failed, using text+TTS fallback:', err?.message || err);
    }
  }

  /**
   * Wire InsimulClient callbacks for handling Live session voice responses.
   * These handle the case where NPC text/audio arrives asynchronously from
   * server-side STT of the player's speech (not from sendMessage/sendText).
   */
  private wireLiveSessionCallbacks(): void {
    if (!this.insimulClient) return;

    this.insimulClient.on({
      onTextChunk: (text: string, _isFinal: boolean) => {
        // During a typed sendMessage(), isProcessing is true and sendMessageViaGrpc
        // has its own callbacks that handle the placeholder. This callback only
        // creates a new placeholder for Live voice responses (isProcessing === false).
        if (!this.isProcessing && this.insimulClient?.isLiveSession) {
          if (!this._liveResponsePlaceholder) {
            this._liveResponsePlaceholder = { role: 'assistant', content: '', timestamp: new Date() };
            this.messages.push(this._liveResponsePlaceholder);
            this.updateMessagesDisplay();
            this.updateConversationStateIndicator('speaking');
            if (this.loadingIndicator) this.loadingIndicator.isVisible = false;
          }
          this._liveResponsePlaceholder.content += text;
          this.updateLastMessageText(this._liveResponsePlaceholder.content);
          this.onNPCSpeechUpdate?.(this._liveResponsePlaceholder.content);
        }
      },
      onAudioChunk: (chunk: AudioChunkOutput) => {
        this._receivedStreamingAudio = true;
        if (this.streamingAudioPlayer) {
          this.streamingAudioPlayer.pushChunk(chunk as StreamingAudioChunk);
        }
      },
      onFacialData: (data: FacialData) => {
        if (this.lipSyncController) {
          this.lipSyncController.pushFacialData(data);
        }
      },
      onComplete: (fullText: string) => {
        if (!this.isProcessing && this.insimulClient?.isLiveSession && this._liveResponsePlaceholder) {
          const responseText = fullText || this._liveResponsePlaceholder.content;
          this.streamingAudioPlayer?.finish();
          this.lipSyncController?.start();
          // Process grammar, vocabulary, quest handling for the voice response
          this.processAssistantResponse('', responseText, this._liveResponsePlaceholder);
          // Notify listeners of the chat exchange
          if (this.onChatExchange && this.character?.id) {
            this.onChatExchange(this.character.id, '', this._liveResponsePlaceholder.content);
          }
          this._liveResponsePlaceholder = null;
          this.updateConversationStateIndicator('idle');
        }
      },
      onTranscript: (text: string, isFinal: boolean) => {
        if (isFinal && text.trim()) {
          // Display player's transcribed speech in chat
          this.messages.push({ role: 'user', content: text.trim(), timestamp: new Date() });
          this.updateMessagesDisplay();
        } else if (!isFinal && this.inputText) {
          // Show interim transcript in input field
          this.inputText.text = text || 'Listening...';
          this.inputText.color = '#ffd93d';
        }
      },
      onInterrupted: () => {
        // Stop audio playback and show visual indicator
        this.streamingAudioPlayer?.stop();
        this.lipSyncController?.stop();
        this.isSpeaking = false;
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        this.updateConversationStateIndicator('idle');
        this._liveResponsePlaceholder = null;
      },
      onStateChange: (state: ConversationState) => {
        this._conversationState = state;
        this.updateConversationStateIndicator(state);
      },
      onError: (err: Error) => {
        console.error('[ChatPanel] InsimulClient error:', err);
        // Live mode has no turn-completion signal on error, so the UI will
        // sit on "NPC is thinking..." forever unless we clear it here. This
        // is the Live-mode counterpart to the 90s watchdog that guards the
        // sendText path. Exit the Live mode UI, surface the error in chat,
        // and let the user retry or fall back to typing.
        this.streamingAudioPlayer?.stop();
        this.lipSyncController?.stop();
        this.isSpeaking = false;
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        if (this.loadingIndicator) this.loadingIndicator.isVisible = false;
        this.updateConversationStateIndicator('idle');
        this._liveResponsePlaceholder = null;
        this.isProcessing = false;

        const msg = err?.message ?? String(err);
        // Don't spam the chat with a new error bubble if one was just added.
        const last = this.messages[this.messages.length - 1];
        const alreadyShown = last?.role === 'assistant' &&
          /voice session|connection timed out|lost my train/i.test(last.content);
        if (!alreadyShown) {
          this.messages.push({
            role: 'assistant',
            content: /voice/i.test(msg)
              ? '[Voice session ended — try speaking again or type your message.]'
              : '[The connection had a hiccup. Please try again.]',
            timestamp: new Date(),
          });
          this.updateMessagesDisplay();
        }
        Sentry.captureException(err, {
          tags: { component: 'chat-panel', stage: 'live-session' },
          extra: {
            characterId: this.character?.id,
            worldId: this.character?.worldId,
          },
        });
      },
    });
  }

  /**
   * Start capturing raw PCM audio from the microphone and streaming it
   * to the active Live session via sendAudioChunk().
   */
  private async startLiveAudioCapture(): Promise<void> {
    if (this._liveAudioStream) return; // already capturing

    try {
      this._liveAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });

      this._liveAudioContext = new AudioContext({ sampleRate: 16000 });
      const source = this._liveAudioContext.createMediaStreamSource(this._liveAudioStream);
      // ScriptProcessorNode captures raw PCM samples from the mic
      this._liveAudioProcessor = this._liveAudioContext.createScriptProcessor(4096, 1, 1);

      this._liveAudioProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.insimulClient?.isLiveSession) return;
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert float32 samples to 16-bit PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.insimulClient!.sendAudioChunk(new Uint8Array(int16.buffer));
      };

      source.connect(this._liveAudioProcessor);
      this._liveAudioProcessor.connect(this._liveAudioContext.destination);
    } catch (err: any) {
      console.warn('[ChatPanel] Failed to start live audio capture:', err?.message || err);
    }
  }

  /** Stop live audio capture and release mic resources. */
  private stopLiveAudioCapture(): void {
    if (this._liveAudioProcessor) {
      this._liveAudioProcessor.disconnect();
      this._liveAudioProcessor = null;
    }
    if (this._liveAudioContext) {
      this._liveAudioContext.close();
      this._liveAudioContext = null;
    }
    if (this._liveAudioStream) {
      this._liveAudioStream.getTracks().forEach(t => t.stop());
      this._liveAudioStream = null;
    }
  }

  private handleResize() {
    if (this.chatContainer && this.isVisible) {
      this._advancedTexture.markAsDirty();
    }
  }

  public hide(userInitiated: boolean = false) {
    this.clearHintTimer();
    this.disableHandsFreeMode();
    // Clean up listening mode if active
    if (this._listeningMode) {
      this.exitListeningMode();
    }
    this.isVisible = false;
    if (this.chatContainer) {
      this.chatContainer.isVisible = false;
    }
    this.updateNPCIndicator();
    this.gesturePanel?.hide();
    if (this.dialogueActions) {
      this.dialogueActions.hide();
    }
    if (this._enterKeyHandler) {
      window.removeEventListener("keydown", this._enterKeyHandler);
      this._enterKeyHandler = null;
    }
    // End language tracking conversation and log results
    if (this.languageTracker) {
      const result = this.languageTracker.endConversation();
      if (result) {
        if (result.gain > 0) {
          if (result.bonuses.length > 0) {
          }
        }
        // Always fire conversation summary — assessment depends on this to advance phases
        this.onConversationSummary?.(result);
      }
    }
    // Clear quest context so it doesn't bleed into next conversation
    this.questOfferingContext = null;
    this.activeQuestFromNPC = null;
    this.questGuidancePrompt = null;
    this._cachedSystemPrompt = null; // Force prompt rebuild for next NPC
    // Hide talking indicator
    if (this.talkingIndicator && this.character) {
      this.talkingIndicator.hide(this.character.id);
    }
    this.stopAllAudio();

    // Stop streaming audio and lip sync
    this.streamingAudioPlayer?.stop();
    this.lipSyncController?.stop();
    // End Live session if active, then abort the client
    if (this.insimulClient?.isLiveSession) {
      this.stopLiveAudioCapture();
      this.insimulClient.endLiveSession().catch(() => {});
    }
    this._liveResponsePlaceholder = null;
    this.insimulClient?.abort();
    this.updateConversationStateIndicator('idle');

    // Only call onClose if user-initiated
    if (userInitiated) {
      this.onClose?.();
    }
  }

  private _reregisterEnterHandler() {
    if (this._enterKeyHandler) return; // already registered
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter" && this._inputFocused) {
        this.sendMessage();
      }
    };
    this._enterKeyHandler = handleEnter;
    window.addEventListener("keydown", handleEnter);
  }

  private stopAllAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    if (this.isRecording) {
      this.stopRecording();
    }
    // Stop WebSocket voice capture when hiding
    if (this.voiceWSClient) {
      this.voiceWSClient.stopCapture();
    }
    this.isSpeaking = false;
  }

  private initializeChat() {
    if (!this.character) return;

    // Initialize language progress tracker from world languages or legacy targetLanguage
    // Reuse persistent tracker if available so vocabulary/grammar data persists across conversations
    const learningLang = this.worldLanguageContext?.learningTargetLanguage?.name
      || this.worldLanguageContext?.targetLanguage
      || this.world?.targetLanguage;
    if (learningLang && learningLang !== 'English') {
      this.hoverTranslation.setTargetLanguage(learningLang);
      // Wire hover-to-translate through SDK
      if (this.insimulClient) {
        this.hoverTranslation.setTranslateFn((word, lang) => this.insimulClient!.translateWord(word, lang));
      }
      if (this.persistentLanguageTracker) {
        this.languageTracker = this.persistentLanguageTracker;
      } else {
        this.languageTracker = new LanguageProgressTracker(
          'player',
          this.character.worldId,
          learningLang,
          this.playthroughId || undefined
        );
        if (this._dataSource) {
          this.languageTracker.setDataSource(this._dataSource);
        }
        // Load persisted progress from server, then start tracking conversation
        this.languageTracker.loadFromServer().then(() => {
          this.languageTracker?.startServerSync(60_000);
        }).catch(() => {
          // Still start sync even if load fails
          this.languageTracker?.startServerSync(60_000);
        });
      }
      this.languageTracker.startConversation(this.character.id, this.character.firstName || this.character.name || 'NPC');
    }

    // Initialize listen-and-repeat controller for pronunciation practice
    this.listenAndRepeatController = new ListenAndRepeatController({
      playTTS: async (text: string, language?: string) => {
        await this.textToSpeech(text);
      },
      startSTT: async (language?: string) => {
        return new Promise<string>((resolve) => {
          if (this.speechService) {
            let resolved = false;
            this.speechService.updateOptions({
              lang: language ?? undefined,
              continuous: false,
              onFinalResult: (transcript: string) => {
                if (!resolved) { resolved = true; resolve(transcript); }
              },
              onError: () => {
                if (!resolved) { resolved = true; resolve(''); }
              },
            });
            this.speechService.start();
            // Timeout after 10 seconds
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                this.speechService?.stop();
                resolve('');
              }
            }, 10000);
          } else {
            resolve('');
          }
        });
      },
      showNotification: (text: string, _color?: string) => {
        this.messages.push({ role: 'assistant', content: text, timestamp: new Date() });
        this.updateMessagesDisplay();
      },
      emitEvent: (event: any) => {
        this.onListenAndRepeat?.(event);
      },
      getTargetLanguage: () => {
        return this._targetLanguage
          || this.worldLanguageContext?.targetLanguage
          || this.world?.targetLanguage
          || null;
      },
    });

    // US-013: If the NPC recently greeted via proximity speech, insert that greeting
    // as the first assistant message so the continuation flows naturally.
    if (this._recentGreeting) {
      this.messages.push({
        role: 'assistant',
        content: this._recentGreeting,
        timestamp: new Date(),
      });
      this.updateMessagesDisplay();
    }

    // NPC greeting disabled — wait for the player to initiate conversation.
    // The recent greeting context is cleared so it doesn't leak into future conversations.
    this._recentGreeting = null;

    // Wire hover-translate word lookups to vocabulary progress tracker
    if (this.languageTracker) {
      const tracker = this.languageTracker;
      this.hoverTranslation.setOnWordEncounter((encounter) => {
        tracker.addVocabularyWord(
          encounter.word,
          encounter.translation,
          undefined,       // category — not known from hover context
          false,           // not used correctly — passive encounter
          'passive_hover', // encounter type for weighting
        );
      });
    }

    // Set up language tracker callbacks
    if (this.languageTracker) {
      if (this.worldLanguageContext) {
        this.languageTracker.setWorldLanguageContext(this.worldLanguageContext);
      }
      this.languageTracker.setOnFluencyGain((result) => {
        this._proficiencyDirty = true;
        this._cachedSystemPrompt = null; // Force prompt rebuild next message
        this.onFluencyGain?.(result.newFluency, result.gain);
      });
      this.languageTracker.setOnWordMastered((entry) => {
        this._proficiencyDirty = true;
      });
    }

    this.updateMessagesDisplay();

    // Auto-listen: start recording when chat opens
    this.tryAutoListen();
  }


  private createChatUI() {

    // Main container - top-right, below minimap when collapsed; expands for chat
    this.chatContainer = new Rectangle("chatContainer");
    this.chatContainer.width = "320px";
    this.chatContainer.height = "350px";
    this.chatContainer.background = "rgba(0, 0, 0, 0.65)";
    this.chatContainer.color = "rgba(255, 255, 255, 0.5)";
    this.chatContainer.thickness = 1;
    this.chatContainer.cornerRadius = 8;
    this.chatContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.chatContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.chatContainer.zIndex = 50;
    this.chatContainer.isVisible = false;
    this.chatContainer.alpha = 1;

    // Add to texture
    this._advancedTexture.addControl(this.chatContainer);

    // Use a vertical StackPanel layout instead of absolute pixel positioning
    this.mainLayout = new StackPanel("chatMainLayout");
    this.mainLayout.width = "100%";
    this.mainLayout.height = "100%";
    this.mainLayout.isVertical = true;
    this.chatContainer.addControl(this.mainLayout);
    const mainLayout = this.mainLayout;

    // Header with character name
    const header = new Rectangle("chatHeader");
    header.width = "100%";
    header.height = "32px";
    header.background = "rgba(20, 20, 20, 0.6)";
    header.thickness = 0;
    header.cornerRadius = 5;
    mainLayout.addControl(header);

    this.titleText = new TextBlock();
    this.titleText.text = this.character ? `${this.character.firstName} ${this.character.lastName}` : "Chat";
    this.titleText.color = "white";
    this.titleText.fontSize = 13;
    this.titleText.fontWeight = "bold";
    this.titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.titleText.name = "chatTitle";
    header.addControl(this.titleText);

    // Conversation state indicator (thinking/speaking/listening)
    this._stateIndicator = new TextBlock("stateIndicator");
    this._stateIndicator.text = '';
    this._stateIndicator.color = '#ffd93d';
    this._stateIndicator.fontSize = 11;
    this._stateIndicator.fontWeight = 'bold';
    this._stateIndicator.width = '36px';
    this._stateIndicator.height = '20px';
    this._stateIndicator.left = '10px';
    this._stateIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._stateIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this._stateIndicator.isVisible = false;
    header.addControl(this._stateIndicator);

    // Copy button — copies full dialogue to clipboard
    const copyBtn = Button.CreateSimpleButton("copyChat", "Copy");
    copyBtn.width = "38px";
    copyBtn.height = "20px";
    copyBtn.color = "rgba(255, 255, 255, 0.8)";
    copyBtn.background = "rgba(80, 80, 80, 0.7)";
    copyBtn.cornerRadius = 4;
    copyBtn.fontSize = 9;
    copyBtn.left = "-32px";
    copyBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    copyBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    copyBtn.onPointerClickObservable.add(() => {
      this.copyDialogueWithOverlay();
    });
    header.addControl(copyBtn);

    // Close button
    const closeBtn = Button.CreateSimpleButton("closeChat", "X");
    closeBtn.width = "24px";
    closeBtn.height = "24px";
    closeBtn.color = "white";
    closeBtn.background = "rgba(255, 50, 50, 0.8)";
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 12;
    closeBtn.left = "-4px";
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    closeBtn.onPointerClickObservable.add(() => {
      this.hide(true);
    });
    this._closeBtn = closeBtn;
    header.addControl(closeBtn);

    // NPC-nearby indicator — separate widget positioned top-right, below minimap + notifications
    this._npcIndicator = new Rectangle("npcIndicator");
    this._npcIndicator.width = "190px";
    this._npcIndicator.height = "29px";
    this._npcIndicator.background = "rgba(0, 0, 0, 0.78)";
    this._npcIndicator.color = "rgba(255, 255, 255, 0.15)";
    this._npcIndicator.thickness = 1;
    this._npcIndicator.cornerRadius = 6;
    this._npcIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this._npcIndicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this._npcIndicator.left = "-8px";
    this._npcIndicator.top = "234px"; // overridden dynamically by setNpcIndicatorTop()
    this._npcIndicator.alpha = 0.8;
    this._npcIndicator.zIndex = 10;
    this._npcIndicator.isVisible = false;
    this._npcIndicator.isPointerBlocker = true;
    this._npcIndicator.onPointerClickObservable.add(() => {
      if (this.nearbyNPCName) {
        this.onTalkRequested?.();
      }
    });

    this._npcIndicatorText = new TextBlock("npcIndicatorText");
    this._npcIndicatorText.text = "";
    this._npcIndicatorText.color = "rgba(255,255,255,0.7)";
    this._npcIndicatorText.fontSize = 10;
    this._npcIndicatorText.fontWeight = "bold";
    this._npcIndicatorText.left = "8px";
    this._npcIndicatorText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._npcIndicatorText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._npcIndicatorText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this._npcIndicator.addControl(this._npcIndicatorText);

    this._advancedTexture.addControl(this._npcIndicator);

    // Messages area — ScrollViewer wrapping a StackPanel
    // Height is "stretch" — fills remaining space between header (32px) and input (36px)
    const messagesOuter = new Rectangle("messagesOuter");
    messagesOuter.width = "92%";
    messagesOuter.height = "282px";
    messagesOuter.background = "rgba(10, 10, 10, 0.3)";
    messagesOuter.thickness = 0;
    messagesOuter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    messagesOuter.clipContent = true;
    messagesOuter.clipChildren = true;
    mainLayout.addControl(messagesOuter);

    const scrollViewer = new ScrollViewer("messagesScroll");
    scrollViewer.width = "100%";
    scrollViewer.height = "100%";
    scrollViewer.thickness = 0;
    scrollViewer.barSize = 8;
    scrollViewer.barColor = "rgba(255, 255, 255, 0.4)";
    scrollViewer.barBackground = "transparent";
    scrollViewer.wheelPrecision = 3;
    // Disable horizontal scrollbar — only vertical scrolling needed
    scrollViewer.forceHorizontalBar = false;
    scrollViewer.forceVerticalBar = false;
    // Persistently suppress horizontal scrollbar visibility
    scrollViewer.onAfterDrawObservable.add(() => {
      const hBar = (scrollViewer as any)._horizontalBar;
      if (hBar && hBar.isVisible) { hBar.isVisible = false; hBar.height = '0px'; }
    });
    messagesOuter.addControl(scrollViewer);
    this.messagesScrollViewer = scrollViewer;

    // Press-and-hold on scroll area to copy dialogue
    scrollViewer.onPointerDownObservable.add(() => {
      this._longPressTimer = setTimeout(() => {
        this.copyDialogueWithOverlay();
      }, 600);
    });
    scrollViewer.onPointerUpObservable.add(() => {
      if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
    });
    scrollViewer.onPointerOutObservable.add(() => {
      if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
    });

    const messagesStack = new StackPanel("messagesStack");
    messagesStack.width = "100%";
    messagesStack.isVertical = true;
    messagesStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    messagesStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    messagesStack.adaptHeightToChildren = true;
    messagesStack.clipContent = true;
    messagesStack.clipChildren = true;
    scrollViewer.addControl(messagesStack);
    this.messagesStack = messagesStack;

    // Input area at the bottom
    const inputArea = new Rectangle("inputArea");
    inputArea.width = "92%";
    inputArea.height = "36px";
    inputArea.background = "rgba(20, 20, 20, 0.5)";
    inputArea.thickness = 0;
    inputArea.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainLayout.addControl(inputArea);
    this.inputArea = inputArea;

    // Input text field
    this.inputText = new InputText("chatInput");
    this.inputText.width = "82%";
    this.inputText.height = "26px";
    this.inputText.color = "white";
    this.inputText.fontSize = 12;
    this.inputText.background = "rgba(60, 60, 60, 0.5)";
    this.inputText.thickness = 1;
    this.inputText.left = "4px";
    this.inputText.text = this.inputPlaceholder;
    this.inputText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.inputText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.inputText.paddingLeft = "10px";

    this.inputText.onFocusObservable.add(() => {
      if (this.inputText && (this.inputText.text === "Hold T to Talk..." || this.inputText.text === "Listening...")) {
        this.inputText.text = "";
      }
      this._inputFocused = true;
      chatInputFocused = true;
    });

    this.inputText.onBlurObservable.add(() => {
      if (this.inputText && this.inputText.text === "") {
        this.inputText.text = this.inputPlaceholder;
        this.inputText.color = "white";
      }
      this._inputFocused = false;
      chatInputFocused = false;
    });

    inputArea.addControl(this.inputText);

    // Send button
    const sendBtn = Button.CreateSimpleButton("sendBtn", "Send");
    sendBtn.width = "16%";
    sendBtn.height = "26px";
    sendBtn.color = "white";
    sendBtn.background = "rgba(30, 150, 255, 0.6)";
    sendBtn.cornerRadius = 4;
    sendBtn.fontSize = 12;
    sendBtn.left = "-2px";
    sendBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    sendBtn.onPointerClickObservable.add(() => {
      this.sendMessage();
    });
    inputArea.addControl(sendBtn);

    // Enter key handler
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter" && this._inputFocused) {
        this.sendMessage();
      }
    };
    this._enterKeyHandler = handleEnter;
    window.addEventListener("keydown", handleEnter);

    // Loading indicator (initially hidden) — lives outside the scroll stack
    this.loadingIndicator = new TextBlock("loadingIndicator");
    this.loadingIndicator.text = "NPC is thinking...";
    this.loadingIndicator.color = "#888";
    this.loadingIndicator.fontSize = 11;
    this.loadingIndicator.height = "16px";
    this.loadingIndicator.isVisible = false;
    this.messagesStack.addControl(this.loadingIndicator);

    // Translation tooltip (shared, hidden by default) — floats above hovered words
    this._translationTooltip = new Rectangle("translationTooltip");
    this._translationTooltip.width = "200px";
    this._translationTooltip.adaptHeightToChildren = true;
    this._translationTooltip.background = "rgba(0, 0, 0, 0.92)";
    this._translationTooltip.color = "rgba(100, 180, 255, 0.6)";
    this._translationTooltip.thickness = 1;
    this._translationTooltip.cornerRadius = 6;
    this._translationTooltip.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._translationTooltip.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this._translationTooltip.isVisible = false;
    this._translationTooltip.isPointerBlocker = false;
    this._translationTooltip.zIndex = 200;

    this._translationTooltipText = new TextBlock("translationTooltipText");
    this._translationTooltipText.color = "white";
    this._translationTooltipText.fontSize = 11;
    this._translationTooltipText.textWrapping = TextWrapping.WordWrap;
    this._translationTooltipText.resizeToFit = true;
    this._translationTooltipText.paddingLeft = "8px";
    this._translationTooltipText.paddingRight = "8px";
    this._translationTooltipText.paddingTop = "6px";
    this._translationTooltipText.paddingBottom = "6px";
    this._translationTooltipText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this._translationTooltip.addControl(this._translationTooltipText);

    this._advancedTexture.addControl(this._translationTooltip);

  }

  /** Copy full dialogue to clipboard and briefly show an overlay notification. */
  private copyDialogueWithOverlay(): void {
    const npcName = this.character ? `${this.character.firstName} ${this.character.lastName}`.trim() : 'NPC';
    const text = this.messages
      .filter(m => m.content)
      .map(m => `${m.role === 'user' ? 'You' : npcName}: ${m.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});

    // Show overlay inside the scroll viewer area
    if (this._copyOverlay) {
      this._copyOverlay.dispose();
      this._copyOverlay = null;
    }
    if (!this.messagesScrollViewer) return;

    const overlay = new Rectangle("copyOverlay");
    overlay.width = "180px";
    overlay.height = "36px";
    overlay.background = "rgba(0, 0, 0, 0.85)";
    overlay.cornerRadius = 8;
    overlay.thickness = 0;
    overlay.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    overlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    overlay.zIndex = 100;

    const overlayText = new TextBlock("copyOverlayText", "\u{1F4CB} Dialogue Copied to Clipboard");
    overlayText.color = "white";
    overlayText.fontSize = 11;
    overlayText.fontWeight = "bold";
    overlayText.textWrapping = TextWrapping.WordWrap;
    overlay.addControl(overlayText);

    // Add overlay to the outer messages area (parent of scroll viewer)
    const parent = this.messagesScrollViewer.parent;
    if (parent) {
      parent.addControl(overlay);
    } else {
      this.messagesScrollViewer.addControl(overlay);
    }
    this._copyOverlay = overlay;

    // Fade out after 1.5s
    setTimeout(() => {
      if (this._copyOverlay) {
        this._copyOverlay.dispose();
        this._copyOverlay = null;
      }
    }, 1500);
  }

  /** Determine the display color for a message based on role and content prefix. */
  private getMessageColor(msg: Message): string {
    if (msg.role === 'user') return "#87CEEB";
    if (msg.role === 'system') return "#888888"; // System/eavesdrop notices
    const content = msg.content || '';
    if (content.startsWith('✓ ')) return "#4CAF50";       // Correct grammar
    if (content.startsWith('✎ Tip: ')) return "#FFC107";  // Grammar corrections
    if (content.startsWith('📖 Grammar Focus')) return "#FF9800"; // Grammar focus
    return "rgba(255, 255, 255, 0.9)";
  }

  /** Create a styled TextBlock for a message at the given index. */
  private createMessageControl(index: number): TextBlock {
    const msg = this.messages[index];
    const messageText = new TextBlock(`msg-${index}`);
    messageText.text = msg.content || ' ';
    messageText.color = this.getMessageColor(msg);
    messageText.fontSize = 12;
    messageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    messageText.textWrapping = TextWrapping.WordWrap;
    messageText.resizeToFit = true;
    messageText.width = "95%";
    messageText.paddingLeft = "8px";
    messageText.paddingRight = "8px";
    messageText.paddingTop = "3px";
    messageText.paddingBottom = "3px";
    return messageText;
  }

  /**
   * Rebuild a message control with interactive word-level hover for translations.
   * Called after vocab hints arrive from metadata extraction.
   * Replaces the plain TextBlock with a vertical StackPanel of word-flow lines.
   */
  private rebuildMessageWithHover(messageIndex: number): void {
    if (!this.messagesStack) return;
    if (this._interactiveMessages.has(messageIndex)) return;

    const msg = this.messages[messageIndex];
    if (!msg || msg.role !== 'assistant') return;

    // Skip system-like messages (grammar feedback, etc.)
    const content = msg.content || '';
    if (content.startsWith('✓ ') || content.startsWith('✎ Tip: ') ||
        content.startsWith('📖 Grammar Focus') || content.startsWith('(')) return;

    const oldCtrl = this._messageControls.get(messageIndex);
    if (!oldCtrl) return;

    // Build interactive container
    const container = this.createInteractiveMessageContainer(messageIndex, content);
    if (!container) return;

    // Replace in stack
    const parent = oldCtrl.parent;
    if (parent) {
      const idx = parent.children.indexOf(oldCtrl);
      parent.removeControl(oldCtrl);
      // StackPanel doesn't have insertAt, so we rebuild order
      // Remove all children after idx, add container, then re-add them
      const after: Control[] = [];
      while (parent.children.length > idx) {
        const child = parent.children[parent.children.length - 1];
        parent.removeControl(child);
        after.unshift(child);
      }
      parent.addControl(container);
      for (const child of after) {
        parent.addControl(child);
      }
    }

    this._messageControls.set(messageIndex, container as any);
    this._interactiveMessages.add(messageIndex);
  }

  /**
   * Create an interactive message container with word-level hover.
   * Uses a flow layout: vertical StackPanel of horizontal line StackPanels.
   */
  private createInteractiveMessageContainer(
    messageIndex: number,
    content: string,
  ): StackPanel | null {
    const tokens = this.hoverTranslation.tokenize(content);
    if (tokens.length === 0) return null;

    const container = new StackPanel(`msg-interactive-${messageIndex}`);
    container.isVertical = true;
    container.width = "95%";
    container.adaptHeightToChildren = true;
    container.paddingLeft = "8px";
    container.paddingRight = "8px";
    container.paddingTop = "3px";
    container.paddingBottom = "3px";

    // Approximate max width in pixels (95% of 320px panel - padding)
    const maxLineWidth = 270;
    const charWidth = 8; // approximate px per character at fontSize 12

    let currentLine = this.createFlowLine(messageIndex);
    let lineWidth = 0;

    for (const token of tokens) {
      const tokenWidth = token.text.length * charWidth;

      // Wrap to next line if needed (but don't wrap whitespace-only tokens)
      if (token.isWord && lineWidth + tokenWidth > maxLineWidth && lineWidth > 0) {
        container.addControl(currentLine);
        currentLine = this.createFlowLine(messageIndex);
        lineWidth = 0;
      }

      if (token.isWord) {
        const stripped = this.hoverTranslation.stripPunctuation(token.text);
        const hint = this.hoverTranslation.getTranslation(stripped);

        if (hint) {
          // Hoverable word with known translation
          const wordContainer = this.createHoverableWord(token.text, hint);
          currentLine.addControl(wordContainer);
        } else {
          // Regular word (no known translation)
          const wordBlock = new TextBlock();
          wordBlock.text = token.text;
          wordBlock.fontSize = 12;
          wordBlock.color = "rgba(255, 255, 255, 0.9)";
          wordBlock.resizeToFit = true;
          wordBlock.height = "16px";
          currentLine.addControl(wordBlock);
        }
      } else {
        // Whitespace — add a fixed-width spacer (resizeToFit can give 0 width for spaces)
        const spacer = new TextBlock();
        spacer.text = " ";
        spacer.fontSize = 12;
        spacer.color = "transparent";
        spacer.width = `${Math.max(token.text.length, 1) * 4}px`;
        spacer.height = "16px";
        currentLine.addControl(spacer);
      }

      lineWidth += tokenWidth;
    }

    // Add the last line
    if (currentLine.children.length > 0) {
      container.addControl(currentLine);
    }

    return container;
  }

  private createFlowLine(messageIndex: number): StackPanel {
    const line = new StackPanel(`msg-line-${messageIndex}-${Date.now()}`);
    line.isVertical = false;
    line.height = "16px";
    line.width = "100%";
    line.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return line;
  }

  /**
   * Create a hoverable word control that shows a translation tooltip on hover.
   */
  private createHoverableWord(text: string, hint: VocabHint): Rectangle {
    const wordContainer = new Rectangle();
    // Use generous width estimate (8px/char + padding) to ensure full text is clickable
    wordContainer.width = `${text.length * 8 + 4}px`;
    wordContainer.height = "16px";
    wordContainer.thickness = 0;
    // Near-transparent fill rather than literal "transparent" — Babylon
    // GUI's hit test skips controls with no visual presence even when
    // `isPointerBlocker = true`, which was killing the underlined-word
    // tooltip entirely (hover observer never fired). A 1%-alpha fill is
    // indistinguishable visually but registers as a hit target.
    wordContainer.background = "rgba(255, 255, 255, 0.01)";
    wordContainer.isPointerBlocker = true;

    const wordBlock = new TextBlock();
    wordBlock.text = text;
    wordBlock.fontSize = 12;
    wordBlock.color = "#90CAF9"; // Light blue to indicate translatable
    wordBlock.underline = true;
    wordBlock.resizeToFit = false;
    wordBlock.isPointerBlocker = true; // Allow hover on text itself, not just container edges
    wordBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    wordContainer.addControl(wordBlock);

    wordContainer.onPointerEnterObservable.add(() => {
      wordBlock.color = "#BBDEFB";
      this.showTranslationTooltip(hint, wordContainer);
    });

    wordContainer.onPointerOutObservable.add(() => {
      wordBlock.color = "#90CAF9";
      this.hideTranslationTooltip();
    });

    // Also fetch translation on click for words without context
    wordContainer.onPointerClickObservable.add(async () => {
      const stripped = this.hoverTranslation.stripPunctuation(text);
      const result = await this.hoverTranslation.fetchTranslation(stripped);
      if (result) {
        this.showTranslationTooltip(
          { word: result.word, translation: result.translation, context: result.context },
          wordContainer,
        );
      }
    });

    return wordContainer;
  }

  /**
   * Show the translation tooltip near a hovered word control.
   */
  private showTranslationTooltip(hint: VocabHint, anchor: Control): void {
    if (!this._translationTooltip || !this._translationTooltipText) return;

    let tooltipText = `${hint.word} → ${hint.translation}`;
    if (hint.context) {
      tooltipText += `\n${hint.context}`;
    }
    // Show encounter count from vocabulary tracker
    const encounterCount = this.hoverTranslation.getWordEncounterCount(hint.word);
    if (encounterCount > 0) {
      tooltipText += `\nSeen ${encounterCount} time${encounterCount !== 1 ? 's' : ''}`;
    }
    this._translationTooltipText.text = tooltipText;

    // Position near the anchor control
    const x = anchor.centerX;
    const y = anchor.centerY;
    this._translationTooltip.left = `${x - 100}px`;
    this._translationTooltip.top = `${y - 40}px`;
    this._translationTooltip.isVisible = true;
  }

  /**
   * Hide the translation tooltip.
   */
  private hideTranslationTooltip(): void {
    if (this._translationTooltip) {
      this._translationTooltip.isVisible = false;
    }
  }

  /**
   * Rebuild all NPC message controls with interactive word hover.
   * Called after vocab hints arrive from metadata extraction.
   */
  private rebuildMessagesWithTranslations(): void {
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].role === 'assistant') {
        this.rebuildMessageWithHover(i);
      }
    }
  }

  /** Create a row of 1-5 star rating buttons for an NPC message. */
  private createRatingRow(messageIndex: number): StackPanel {
    const row = new StackPanel(`rating-${messageIndex}`);
    row.isVertical = false;
    row.height = "18px";
    row.paddingLeft = "8px";
    row.paddingBottom = "2px";
    row.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const label = new TextBlock(`rateLabel-${messageIndex}`, "Rate:");
    label.fontSize = 9;
    label.color = "#666";
    label.width = "30px";
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(label);

    for (let star = 1; star <= 5; star++) {
      const btn = Button.CreateSimpleButton(`star-${messageIndex}-${star}`, "★");
      btn.width = "18px";
      btn.height = "16px";
      btn.fontSize = 11;
      btn.color = "#555";
      btn.thickness = 0;
      btn.background = "transparent";
      btn.onPointerEnterObservable.add(() => { btn.color = "#FFD700"; });
      btn.onPointerOutObservable.add(() => { btn.color = "#555"; });
      btn.onPointerClickObservable.add(() => {
        // Highlight selected stars
        for (let s = 1; s <= 5; s++) {
          const siblingBtn = row.getChildByName(`star-${messageIndex}-${s}`) as Button | null;
          if (siblingBtn) {
            const textBlock = siblingBtn.children?.[0] as TextBlock | undefined;
            if (textBlock) textBlock.color = s <= star ? "#FFD700" : "#555";
          }
        }
        // Fire callback
        if (this.onDialogueRating) {
          this.onDialogueRating(messageIndex, star);
        }
      });
      row.addControl(btn);
    }

    return row;
  }

  private displayMessages() {
    if (!this.messagesStack) return;

    // Incremental: only add controls for messages that don't have cached controls yet
    const existingCount = this._messageControls.size;

    // If messages were removed (e.g. feedback auto-cleanup), do a full rebuild
    if (existingCount > this.messages.length) {
      // Remove all cached controls
      this._messageControls.forEach((ctrl) => {
        this.messagesStack!.removeControl(ctrl);
      });
      this._messageControls.clear();
    }

    // Ensure loading indicator is at the end
    if (this.loadingIndicator && this.loadingIndicator.parent === this.messagesStack) {
      this.messagesStack.removeControl(this.loadingIndicator);
    }

    // Add only new message controls
    const startIdx = this._messageControls.size;
    for (let i = startIdx; i < this.messages.length; i++) {
      const ctrl = this.createMessageControl(i);
      if (!ctrl) continue;
      this._messageControls.set(i, ctrl);
      try { this.messagesStack.addControl(ctrl); } catch { return; }
    }

    // Re-add loading indicator at the end
    if (this.loadingIndicator && this.messagesStack) {
      try { this.messagesStack.addControl(this.loadingIndicator); } catch { /* disposed */ }
    }

    // Auto-scroll to bottom
    this.scrollToBottom();
  }

  /**
   * Update the text of the last message control in-place (for streaming).
   * Uses the control cache for O(1) lookup.
   *
   * Two cases to handle:
   *  1. Plain TextBlock (initial stream before metadata arrives) —
   *     just update `.text`.
   *  2. Interactive StackPanel (vocab-hint rebuild already happened) —
   *     can't assign `.text`. We've already written the new content to
   *     `this.messages[lastIdx].content`, so clear the interactive-flag
   *     for this message and re-invoke `rebuildMessageWithHover` so the
   *     container reflects the latest text. This is the fix for the
   *     regression where late transcript chunks (Gemini Live output
   *     transcription lagging audio) silently vanished when they
   *     arrived after the metadata-triggered rebuild.
   */
  private updateLastMessageText(text: string) {
    if (!this.messagesStack) return;

    const lastIdx = this.messages.length - 1;
    const cached = this._messageControls.get(lastIdx);
    if (!cached) {
      this.displayMessages();
      return;
    }

    // Interactive StackPanel path — rebuild from updated message content.
    if (this._interactiveMessages.has(lastIdx)) {
      this._interactiveMessages.delete(lastIdx);
      this.rebuildMessageWithHover(lastIdx);
      this.scrollToBottom();
      return;
    }

    // Plain TextBlock path.
    (cached as any).text = text || ' ';
    this.scrollToBottom();
  }

  /**
   * Scroll the messages ScrollViewer to the bottom with smooth animation.
   */
  private scrollToBottom() {
    if (!this.messagesScrollViewer) return;

    // Cancel any in-progress scroll animation
    if (this._scrollAnimFrame !== null) {
      cancelAnimationFrame(this._scrollAnimFrame);
      this._scrollAnimFrame = null;
    }

    // Defer to next frame so layout has been computed
    setTimeout(() => {
      if (!this.messagesScrollViewer?.verticalBar) return;

      const bar = this.messagesScrollViewer.verticalBar;
      const start = bar.value;
      const target = 1;

      // If already at bottom or close, snap immediately
      if (target - start < 0.05) {
        bar.value = target;
        return;
      }

      // Smooth scroll over ~200ms (roughly 12 frames at 60fps)
      const duration = 200;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        bar.value = start + (target - start) * eased;

        if (t < 1) {
          this._scrollAnimFrame = requestAnimationFrame(animate);
        } else {
          this._scrollAnimFrame = null;
        }
      };

      this._scrollAnimFrame = requestAnimationFrame(animate);
    }, 0);
  }

  private updateMessagesDisplay() {
    this.displayMessages();
  }

  private displayGrammarFeedback(text: string, isCorrect: boolean) {
    // Show as a styled tip in the messages area
    const prefix = isCorrect ? '✓ ' : '✎ Tip: ';
    const color = isCorrect ? '#4CAF50' : '#FFC107';

    // Add as a system-style message that will be displayed
    this.messages.push({
      role: 'assistant',
      content: `${prefix}${text}`,
      timestamp: new Date(),
    });
    this.updateMessagesDisplay();

    // Auto-remove the feedback message after 8 seconds to avoid clutter
    const feedbackIdx = this.messages.length - 1;
    setTimeout(() => {
      if (this.messages[feedbackIdx]?.content.startsWith(prefix)) {
        this.messages.splice(feedbackIdx, 1);
        this.updateMessagesDisplay();
      }
    }, 8000);
  }

  /**
   * Show a "Grammar Focus" popup when the player makes the same error 3+ times.
   * Displayed as a persistent message with a rule explanation.
   */
  private showGrammarFocusPopup(pattern: string, explanation: string, example: string) {
    const focusMsg = `📖 Grammar Focus: ${pattern}\n${explanation}\nCorrect form: "${example}"\n(This pattern has come up several times — practice makes perfect!)`;

    this.messages.push({
      role: 'assistant',
      content: focusMsg,
      timestamp: new Date(),
    });
    this.updateMessagesDisplay();

    // Auto-remove after 15 seconds (longer than normal feedback)
    const idx = this.messages.length - 1;
    setTimeout(() => {
      if (this.messages[idx]?.content.startsWith('📖 Grammar Focus')) {
        this.messages.splice(idx, 1);
        this.updateMessagesDisplay();
      }
    }, 15000);
  }

  /**
   * Build a contextual opening cue for the NPC based on character data, location,
   * time of day, relationship, and quest context. The system prompt already contains
   * personality/language directives — this cue provides the situational trigger.
   */
  private buildOpeningCue(): string {
    if (!this.character) return '[The player approaches. Give a brief greeting.]';

    const name = this.character.firstName || 'NPC';
    const occupation = this.character.occupation || null;
    const location = this.character.currentLocation || null;
    const targetLang = this._targetLanguage
      || this.worldLanguageContext?.targetLanguage
      || this.world?.targetLanguage
      || null;

    // Describe time of day from numeric hour or string
    let timeDesc = 'daytime';
    if (this._timeOfDay) {
      const hour = parseInt(this._timeOfDay, 10);
      if (!isNaN(hour)) {
        if (hour < 6) timeDesc = 'late night';
        else if (hour < 12) timeDesc = 'morning';
        else if (hour < 17) timeDesc = 'afternoon';
        else if (hour < 21) timeDesc = 'evening';
        else timeDesc = 'night';
      } else {
        timeDesc = this._timeOfDay;
      }
    }

    // Relationship context
    let relHint = '';
    if (this._relationshipManager && this.character.id) {
      const relCtx = this._relationshipManager.getConversationContext(this.character.id);
      if (relCtx) {
        relHint = ` You have an existing relationship with this player.`;
      }
    }

    // Quest-specific cue takes priority
    if (this.questOfferingContext) {
      return `[The player approaches you (${name}${occupation ? ', ' + occupation : ''}) during the ${timeDesc}${location ? ' at ' + location : ''}.${relHint} Give a brief greeting (1-2 sentences max) and mention what you need help with. Respond in ${targetLang || 'the target language'}.]`;
    }

    // US-013: If a recent proximity greeting exists, build a continuation cue
    if (this._recentGreeting) {
      let cue = `[You just said: "${this._recentGreeting}" The player has approached you to continue the conversation.`;
      cue += ` You are ${name}`;
      if (occupation) cue += `, ${occupation}`;
      cue += ` during the ${timeDesc}`;
      if (location) cue += ` at ${location}`;
      cue += `.${relHint}`;
      cue += ` Continue naturally from your greeting — do NOT repeat it. Say something that builds on what you just said and invites the player to respond (1-2 sentences).`;
      if (targetLang) cue += ` Respond in ${targetLang}.`;
      cue += `]`;
      return cue;
    }

    // Build contextual cue for regular conversation
    let cue = `[The player approaches you (${name}`;
    if (occupation) cue += `, ${occupation}`;
    cue += `) during the ${timeDesc}`;
    if (location) cue += ` at ${location}`;
    cue += `.${relHint}`;
    cue += ` React naturally to being approached. Give a brief, in-character greeting (1-2 sentences) and end with a question or engagement hook that invites the player to respond.`;
    if (targetLang) cue += ` Respond in ${targetLang}.`;
    cue += `]`;
    return cue;
  }

  /**
   * Return a simple fallback greeting in the target language when the LLM
   * times out or fails. Keeps the conversation flowing without a blank chat.
   */
  private getFallbackGreeting(): string {
    const lang = (this._targetLanguage
      || this.worldLanguageContext?.targetLanguage
      || this.world?.targetLanguage
      || '').toLowerCase();

    // Common greetings by language — extend as needed
    const greetings: Record<string, string> = {
      french: 'Bonjour ! Comment allez-vous ?',
      spanish: '¡Hola! ¿Cómo estás?',
      german: 'Hallo! Wie geht es Ihnen?',
      italian: 'Ciao! Come stai?',
      portuguese: 'Olá! Como vai?',
      japanese: 'こんにちは！お元気で���か？',
      korean: '안녕하세요! 어떻게 지���세요?',
      chinese: '你好！你好吗？',
      mandarin: '你好！你好吗？',
    };

    return greetings[lang] || 'Bonjour !';
  }

  /**
   * Trigger an NPC-initiated greeting at conversation start.
   * Sends a hidden cue through the pipeline so the NPC speaks first.
   * The cue is NOT displayed in the chat UI — only the NPC's response appears.
   */
  private async triggerNPCGreeting(cue: string): Promise<void> {
    if (!this.character || this.isProcessing) return;

    // End any Live session so the greeting cue goes through the text+TTS path.
    // Live sessions can close before responding, causing the greeting to be lost.
    if (this.insimulClient?.isLiveSession) {
      try { await this.insimulClient.endLiveSession(); } catch { /* ignore */ }
    }

    this.isProcessing = true;

    // Show loading indicator
    if (this.loadingIndicator) {
      this.loadingIndicator.isVisible = true;
    }
    this.updateConversationStateIndicator('thinking');

    try {
      // Add a placeholder assistant message for streaming (no user message displayed)
      const placeholderMsg = {
        role: 'assistant' as const,
        content: '',
        timestamp: new Date()
      };
      this.messages.push(placeholderMsg);
      this.updateMessagesDisplay();

      let responseText: string;
      this._receivedStreamingAudio = false;

      // Capture timing for debug logging
      const debugSystemPrompt = this.buildSystemPrompt();
      const debugStartTime = performance.now();
      this._debugTimeToFirstChunk = 0;

      // Race LLM call against a 3s timeout — fall back to a simple greeting on timeout
      const GREETING_TIMEOUT_MS = 3000;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('greeting_timeout')), GREETING_TIMEOUT_MS)
      );

      try {
        responseText = await Promise.race([
          this.sendMessageViaGrpc(cue, placeholderMsg),
          timeoutPromise,
        ]);
      } catch (timeoutErr: any) {
        if (timeoutErr?.message === 'greeting_timeout') {
          console.warn('[ChatPanel] NPC greeting LLM timed out after 3s, using fallback');
          responseText = this.getFallbackGreeting();
          placeholderMsg.content = responseText;
          this.updateMessagesDisplay();
        } else {
          throw timeoutErr;
        }
      }

      const debugTotalTime = performance.now() - debugStartTime;

      // Hide loading indicator
      if (this.loadingIndicator) {
        this.loadingIndicator.isVisible = false;
      }

      // Log NPC greeting to debug console (before marker stripping)
      const greetNpcName = this.character
        ? `${this.character.firstName} ${this.character.lastName || ''}`.trim()
        : 'NPC';
      logLLMChatExchange({
        npcName: greetNpcName,
        systemPrompt: debugSystemPrompt,
        userMessage: `[NPC greeting cue] ${cue}`,
        fullResponse: responseText,
        timeToFirstChunk: this._debugTimeToFirstChunk || debugTotalTime,
        totalTimeMs: debugTotalTime,
      });

      // Check if the WS bridge already sent streaming audio during the LLM call.
      // If so, the server handled TTS — don't duplicate it client-side.
      const serverHandledTTS = this._receivedStreamingAudio;

      // Prevent processAssistantResponse from ALSO doing TTS — the greeting
      // path handles TTS itself at line ~1974 below.
      this._receivedStreamingAudio = true;

      // Process the response (grammar, vocab, quests — TTS skipped via flag above)
      await this.processAssistantResponse(cue, responseText, placeholderMsg);

      // US-012: Auto-speak the NPC opening line via TTS.
      // Only if the server did NOT already stream audio for this response.
      if (!serverHandledTTS) {
        const greetingText = placeholderMsg.content || responseText;
        if (greetingText) {
          this.textToSpeech(greetingText).catch(err =>
            console.warn('[ChatPanel] Opening line TTS failed (text still visible):', err)
          );
        }
      }

      // Start hint timer
      this.startHintTimer();
    } catch (error) {
      console.error('[ChatPanel] NPC greeting error:', error);
      if (this.loadingIndicator) this.loadingIndicator.isVisible = false;
      // On error, show a fallback greeting instead of an empty chat
      const fallback = this.getFallbackGreeting();
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
        lastMsg.content = fallback;
      } else {
        this.messages.push({ role: 'assistant', content: fallback, timestamp: new Date() });
      }
      this.updateMessagesDisplay();
      // Auto-speak fallback greeting (non-blocking; text is already visible if TTS fails)
      this.textToSpeech(fallback).catch(err =>
        console.warn('[ChatPanel] Fallback greeting TTS failed:', err)
      );
    } finally {
      this.isProcessing = false;
      if (this.loadingIndicator) this.loadingIndicator.isVisible = false;
      this.updateConversationStateIndicator('idle');
      this.tryAutoListen();
    }
  }

  /** Get the placeholder text for the input field based on voice input mode. */
  private get inputPlaceholder(): string {
    return this._voiceInputMode === 'auto-listen' ? 'Listening...' : 'Hold T to Talk...';
  }

  /**
   * If voice input mode is 'auto-listen', start recording automatically
   * after the NPC finishes speaking. No-op in push-to-talk mode.
   */
  private tryAutoListen(): void {
    if (this._voiceInputMode !== 'auto-listen') return;
    if (!this.isVisible || this.isProcessing || this.isRecording) return;
    // Small delay to let audio finish and avoid picking up NPC playback
    setTimeout(() => {
      if (!this.isVisible || this.isProcessing || this.isRecording) return;
      this.startRecording();
    }, 400);
  }

  private async sendMessage() {
    if (!this.inputText || !this.character || this.isProcessing) return;

    const userMessage = this.inputText.text.trim();
    if (!userMessage) return;

    // Check if this message is a text-based listen & repeat attempt
    if (this._pendingListenAndRepeatPhrase && this.listenAndRepeatController) {
      const phrase = this._pendingListenAndRepeatPhrase;
      this._pendingListenAndRepeatPhrase = null;
      this.inputText.text = this.inputPlaceholder;
      if (this.inputText.placeholderText?.startsWith('Type:')) {
        this.inputText.placeholderText = 'Type a message...';
      }

      this.messages.push({ role: 'user', content: userMessage, timestamp: new Date() });
      this.updateMessagesDisplay();

      const result = this.listenAndRepeatController.attemptFromText(phrase, userMessage);
      this.onListenAndRepeat?.(result as any);
      return;
    }

    this.clearHintTimer();
    this._hintShown = false;
    this.inputText.text = this.inputPlaceholder;
    this.isProcessing = true;

    // Add user message
    this.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });
    this.updateMessagesDisplay();

    // Show loading indicator
    if (this.loadingIndicator) {
      this.loadingIndicator.isVisible = true;
    }
    this.updateConversationStateIndicator('thinking');

    try {
      // Add a placeholder assistant message for streaming
      const placeholderMsg = {
        role: 'assistant' as const,
        content: '',
        timestamp: new Date()
      };
      this.messages.push(placeholderMsg);
      this.updateMessagesDisplay();

      let responseText: string;
      this._receivedStreamingAudio = false;

      // Capture system prompt and timing for debug logging
      const debugSystemPrompt = this.buildSystemPrompt();
      const debugStartTime = performance.now();
      this._debugTimeToFirstChunk = 0;

      // Route through InsimulClient (handles WebSocket → SSE fallback internally)
      responseText = await this.sendMessageViaGrpc(userMessage, placeholderMsg);

      const debugTotalTime = performance.now() - debugStartTime;

      // Hide loading indicator
      if (this.loadingIndicator) {
        this.loadingIndicator.isVisible = false;
      }

      // Log LLM exchange to debug console (before marker stripping)
      const npcName = this.character
        ? `${this.character.firstName} ${this.character.lastName || ''}`.trim()
        : 'NPC';
      logLLMChatExchange({
        npcName,
        systemPrompt: debugSystemPrompt,
        userMessage,
        fullResponse: responseText,
        timeToFirstChunk: this._debugTimeToFirstChunk || debugTotalTime,
        totalTimeMs: debugTotalTime,
      });

      // Process the response: grammar feedback, vocabulary, quests, TTS
      await this.processAssistantResponse(userMessage, responseText, placeholderMsg);

      // Notify listeners of the chat exchange (used by listening comprehension)
      if (this.onChatExchange && this.character?.id) {
        this.onChatExchange(this.character.id, userMessage, placeholderMsg.content);
      }

      // Persist the exchange to save.conversations via the data source.
      // SaveFileDataSource merges per-NPC (appends to recentTurns, sums
      // totalTurnCount) and marks the save dirty so the next auto-save PUT
      // includes it. Without this, the WebSocket turn only lives in the
      // in-memory LLM session and never reaches the save file — the World
      // Insights Conversations panel was empty for this reason.
      try {
        await this.persistConversationTurn(userMessage, placeholderMsg.content);
      } catch (err) {
        console.warn('[ChatPanel] Failed to persist conversation turn:', err);
      }

      // Start hint timer for beginner players
      this.startHintTimer();

    } catch (error) {
      console.error('Chat error:', error);
      if (this.loadingIndicator) this.loadingIndicator.isVisible = false;
      logLLMError(
        this.character ? `${this.character.firstName} ${this.character.lastName || ''}`.trim() : 'NPC',
        userMessage,
        error instanceof Error ? error.message : String(error),
      );
      Sentry.captureException(error, {
        tags: { component: 'chat-panel', stage: 'sendMessage' },
        extra: {
          characterId: this.character?.id,
          worldId: this.character?.worldId,
          userMessage,
        },
      });
      this.messages.push({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      });
      this.updateMessagesDisplay();
    } finally {
      this.isProcessing = false;
      if (this.loadingIndicator) this.loadingIndicator.isVisible = false;
      this.updateConversationStateIndicator('idle');
      // Re-establish Live session callbacks after sendMessageViaGrpc overwrote them
      if (this.insimulClient?.isLiveSession) {
        this.wireLiveSessionCallbacks();
      }
      this.tryAutoListen();
    }
  }

  /**
   * Send message via gRPC streaming conversation service.
   * Streams text token-by-token (typewriter effect), audio, and lip sync data.
   */
  private async sendMessageViaGrpc(
    userMessage: string,
    placeholderMsg: Message,
  ): Promise<string> {
    let accumulatedText = '';

    // Reset streaming audio flag — it will be set to true only if actual
    // audio chunks arrive via onAudioChunk. If no audio arrives,
    // processAssistantResponse will use fallback TTS.
    this._receivedStreamingAudio = false;

    // Track time-to-first-chunk for debug logging
    this._debugStreamStartTime = performance.now();
    let firstChunkRecorded = false;

    // Promise that resolves when onComplete fires — we wait for this so that
    // _receivedStreamingAudio has its final value before processAssistantResponse
    // decides whether to use fallback TTS (audio chunks may arrive after sendText
    // resolves but before onComplete).
    let resolveStreamDone: () => void;
    const streamDonePromise = new Promise<void>(r => { resolveStreamDone = r; });

    // Wire callbacks for this specific request
    this.insimulClient!.on({
      onTextChunk: (text: string, _isFinal: boolean) => {
        if (!firstChunkRecorded && text) {
          this._debugTimeToFirstChunk = performance.now() - this._debugStreamStartTime;
          firstChunkRecorded = true;
        }
        accumulatedText += text;
        placeholderMsg.content = accumulatedText;
        this.updateLastMessageText(accumulatedText);
        this.onNPCSpeechUpdate?.(accumulatedText);
      },
      onAudioChunk: (chunk: AudioChunkOutput) => {
        this._receivedStreamingAudio = true;
        if (this.streamingAudioPlayer) {
          this.streamingAudioPlayer.pushChunk(chunk as StreamingAudioChunk);
        }
      },
      onFacialData: (data: FacialData) => {
        if (this.lipSyncController) {
          this.lipSyncController.pushFacialData(data);
        }
      },
      onStateChange: (state: ConversationState) => {
        this._conversationState = state;
        this.updateConversationStateIndicator(state);
      },
      onComplete: () => {
        this.streamingAudioPlayer?.finish();
        if (this.lipSyncController) {
          this.lipSyncController.start();
        }
        resolveStreamDone!();
      },
      onMetadata: (type: string, content: string) => {
      },
      onError: (err: Error) => {
        console.error('[ChatPanel] Streaming error:', err);
        resolveStreamDone!();
      },
    });

    const targetLangName = this.worldLanguageContext?.learningTargetLanguage?.name
      || this.worldLanguageContext?.targetLanguage
      || this.world?.targetLanguage;
    const langCode = targetLangName
      ? getLanguageBCP47(targetLangName)
      : 'en';

    // Send game state context (CEFR level, vocabulary, grammar, time) to the server
    const hourStr = this._timeOfDay;
    const gameHour = hourStr != null ? parseInt(hourStr, 10) : undefined;
    const gameContext: Record<string, unknown> = {
      gameHour: gameHour != null && !isNaN(gameHour) ? gameHour : undefined,
    };
    if (this.languageTracker) {
      gameContext.cefrLevel = this.languageTracker.getCEFRLevel();
      gameContext.playerVocabulary = this.languageTracker.getVocabulary();
      gameContext.playerGrammarPatterns = this.languageTracker.getGrammarPatterns();
    }
    if (this._appearanceProvider && this.character?.id) {
      try {
        const appearance = this._appearanceProvider(this.character.id);
        if (appearance) gameContext.appearanceDescription = appearance;
      } catch (err) {
        console.warn('[ChatPanel] appearanceProvider threw:', err);
      }
    }
    this.insimulClient!.setGameContext(gameContext);

    try {
      // Collect Prolog facts from the game engine (if available)
      const prologFacts = this._prologFactsProvider?.() ?? undefined;
      const fullText = await this.insimulClient!.sendText(userMessage, {
        languageCode: langCode,
        prologFacts,
      });

      // Wait for the stream to fully complete (onComplete or onError) so that
      // _receivedStreamingAudio reflects whether audio chunks actually arrived.
      // sendText resolves on isFinal text, but audio chunks may still be in flight.
      // Watchdog: if `done` never arrives (server crash, dropped WS frame,
      // hung TTS chain), force-clear the "thinking" state instead of hanging
      // the UI forever. Budget tuned to Gemini 2.5 Pro's worst-case first-turn
      // latency under cold-start (~55-60s observed); 30s was too tight and
      // was triggering on healthy-but-slow turns.
      const streamTimeoutMs = 90_000;
      let streamTimeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<void>((_, reject) => {
        streamTimeout = setTimeout(
          () => reject(new Error(`Stream timeout: no done event in ${streamTimeoutMs}ms`)),
          streamTimeoutMs,
        );
      });
      try {
        await Promise.race([streamDonePromise, timeoutPromise]);
      } finally {
        if (streamTimeout) clearTimeout(streamTimeout);
      }

      // sendText may resolve with empty string on server error+done sequence
      const result = fullText || accumulatedText;
      if (result) return result;

      // Both paths empty — server sent error or no content
      console.warn('[ChatPanel] Empty response from conversation service');
      const fallback = 'Hmm, I lost my train of thought. Could you say that again?';
      placeholderMsg.content = fallback;
      this.updateLastMessageText(fallback);
      return fallback;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[ChatPanel] Conversation failed:', msg);

      // Classify for both the in-game message and the Sentry tag
      let displayMsg: string;
      let stage: 'timeout' | 'provider' | 'safety' | 'unknown';
      if (/timeout|WS timeout/i.test(msg)) {
        displayMsg = 'Sorry, the connection timed out. Please try again.';
        stage = 'timeout';
      } else if (/LLM.*not available|provider/i.test(msg)) {
        displayMsg = 'The conversation service is temporarily unavailable.';
        stage = 'provider';
      } else if (/safety|blocked|empty response/i.test(msg)) {
        displayMsg = "I'm not sure how to respond to that. Could you rephrase?";
        stage = 'safety';
      } else {
        displayMsg = 'Sorry, I cannot respond right now. Please try again.';
        stage = 'unknown';
      }

      Sentry.captureException(err, {
        tags: { component: 'chat-panel', stage },
        extra: {
          characterId: this.character?.id,
          worldId: this.character?.worldId,
          userMessage,
          accumulatedTextLength: accumulatedText.length,
          receivedStreamingAudio: this._receivedStreamingAudio,
        },
      });

      placeholderMsg.content = displayMsg;
      this.updateLastMessageText(displayMsg);
      return displayMsg;
    }
  }

  /**
   * Process assistant response: display, TTS, then background metadata extraction.
   * The dialogue response should be pure spoken text — no metadata blocks.
   */
  private async processAssistantResponse(
    userMessage: string,
    responseText: string,
    placeholderMsg: Message,
  ): Promise<void> {
    // Check for quest branch markers before stripping
    await this.parseAndHandleQuestBranch(responseText);

    // Parse EVAL block for dimension scores BEFORE stripping
    if (this.languageTracker) {
      this.languageTracker.recordEvalScores(responseText);
    }

    // Defensive strip — the LLM should no longer include these, but just in case
    const cleanedResponse = responseText
      .replace(/\*\*GRAMMAR_FEEDBACK\*\*[\s\S]*?\*\*END_GRAMMAR\*\*/g, '')
      .replace(/\*\*QUEST_ASSIGN\*\*[\s\S]*?\*\*END_QUEST\*\*/g, '')
      .replace(/\*\*QUEST_BRANCH\*\*[\s\S]*?\*\*END_BRANCH\*\*/g, '')
      .replace(/\*\*VOCAB_HINTS\*\*[\s\S]*?\*\*END_VOCAB\*\*/g, '')
      .replace(/\*\*EVAL\*\*[\s\S]*?\*\*END_EVAL\*\*/g, '')
      .replace(/\*\*(GRAMMAR_FEEDBACK|QUEST_ASSIGN|QUEST_BRANCH|VOCAB_HINTS|EVAL|END_GRAMMAR|END_QUEST|END_BRANCH|END_VOCAB|END_EVAL)\*\*/g, '')
      .trim();

    // Update displayed message content
    placeholderMsg.content = cleanedResponse;
    this.updateMessagesDisplay();

    // Track vocabulary usage — analyze every message exchange, not just when vocabHints are present
    if (this.languageTracker) {
      this.languageTracker.analyzePlayerMessage(userMessage);
      this.languageTracker.analyzeNPCResponse(cleanedResponse);
    }

    // Feed turn metrics into the difficulty monitor for dynamic scaffolding
    this.recordDifficultyMetrics(userMessage);

    // Track vocabulary usage for quests
    this.trackQuestProgress(userMessage, cleanedResponse);

    // Play audio: if streaming audio was received via SDK, it's already playing.
    // Otherwise fall back to single-shot TTS.
    if (!this._receivedStreamingAudio) {
      await this.textToSpeech(cleanedResponse);
    }

    // Fire background metadata extraction (vocab hints, grammar feedback)
    // This is a SEPARATE LLM call — does not block the conversation.
    this.requestBackgroundMetadata(userMessage, cleanedResponse);

    // Detect target-language phrases for listen & repeat practice
    this.offerListenAndRepeat(cleanedResponse);
  }

  /**
   * Detect target-language phrases in an NPC response and show a
   * "Listen & Repeat" button for pronunciation practice.
   */
  private offerListenAndRepeat(npcResponse: string): void {
    if (!this.listenAndRepeatController || !this.character) return;
    if (this.listenAndRepeatController.isActive) return;

    // Only offer Listen & Repeat when the player has an active pronunciation quest
    // (e.g., quest with objectives of type 'pronunciation_check' or 'listen_and_repeat')
    if (!this._hasActivePronunciationQuest()) return;

    const phrases = this.listenAndRepeatController.detectPhrases(
      npcResponse,
      this.character.id,
      `${this.character.firstName} ${this.character.lastName}`.trim(),
    );

    if (phrases.length === 0) return;

    // Offer the first detected phrase via a clickable message
    const phrase = phrases[0];
    const promptText = `Repeat: "${phrase.targetPhrase}"`;
    this.messages.push({
      role: 'system',
      content: promptText,
      timestamp: new Date(),
    });
    this.updateMessagesDisplay();

    // Add a listen & repeat button to the messages area
    this.addListenAndRepeatButton(phrase);
  }

  /** Check if the player has an active quest with pronunciation objectives. */
  private _hasActivePronunciationQuest(): boolean {
    return !!(this as any)._pronunciationQuestActive;
  }

  /** Called by BabylonGame when the active quest changes — enables/disables listen & repeat. */
  public setPronunciationQuestActive(active: boolean): void {
    (this as any)._pronunciationQuestActive = active;
  }

  /**
   * Add a "Listen & Repeat" button below the current messages.
   * When clicked, runs the full pronunciation practice flow.
   */
  private addListenAndRepeatButton(phrase: ListenAndRepeatPhrase): void {
    if (!this.messagesStack) return;

    const btnContainer = new StackPanel('lar-btn-container');
    btnContainer.isVertical = false;
    btnContainer.height = '30px';
    btnContainer.width = '95%';
    btnContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    btnContainer.paddingTop = '4px';
    btnContainer.paddingBottom = '4px';

    const btn = Button.CreateSimpleButton('lar-btn', 'Listen & Repeat');
    btn.width = '140px';
    btn.height = '26px';
    btn.color = 'white';
    btn.background = '#3b82f6';
    btn.cornerRadius = 4;
    btn.fontSize = 11;
    btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    btn.left = '8px';

    btn.onPointerClickObservable.add(async () => {
      if (!this.listenAndRepeatController) return;
      btn.isEnabled = false;
      btn.background = '#6b7280';
      (btn.textBlock as TextBlock).text = 'Listening...';

      try {
        const result = await this.listenAndRepeatController.attempt(phrase);
        (btn.textBlock as TextBlock).text = `Score: ${result.score}%`;
        btn.background = result.passed ? '#22c55e' : '#f59e0b';
        this.onListenAndRepeat?.(result as any);
      } catch {
        (btn.textBlock as TextBlock).text = 'Try again';
        btn.background = '#ef4444';
        btn.isEnabled = true;
      }
    });

    btnContainer.addControl(btn);

    // Also add a text-input fallback button for when STT is unavailable
    const typeBtn = Button.CreateSimpleButton('lar-type-btn', 'Type Instead');
    typeBtn.width = '100px';
    typeBtn.height = '26px';
    typeBtn.color = '#9ca3af';
    typeBtn.background = 'transparent';
    typeBtn.fontSize = 10;
    typeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    typeBtn.left = '4px';

    typeBtn.onPointerClickObservable.add(() => {
      // When "Type Instead" is clicked, the next user message in the input
      // is treated as a listen & repeat text attempt
      this._pendingListenAndRepeatPhrase = phrase;
      if (this.inputText) {
        this.inputText.placeholderText = `Type: "${phrase.targetPhrase}"`;
        this.inputText.focus();
      }
    });

    btnContainer.addControl(typeBtn);
    this.messagesStack.addControl(btnContainer);

    // Scroll to bottom to show the button
    if (this.messagesScrollViewer) {
      this.messagesScrollViewer.verticalBar.value = 1;
    }
  }

  /**
   * Fire a background request to extract vocab hints and grammar feedback
   * from the conversation exchange. Does not block the UI or TTS.
   */
  private requestBackgroundMetadata(playerMessage: string, npcResponse: string): void {
    const targetLanguage = this._targetLanguage
      || this.worldLanguageContext?.targetLanguage
      || this.world?.targetLanguage;
    if (!targetLanguage || targetLanguage === 'English') return;

    const isLanguageLearning = this.world?.gameType === 'language-learning' ||
                               this.world?.gameType === 'educational' ||
                               this.world?.worldType === 'language-learning' ||
                               this.world?.worldType === 'educational';
    if (!isLanguageLearning) return;

    // Fire and forget — request metadata via SDK
    if (!this.insimulClient) return;

    // Include active quest objectives for conversation goal evaluation
    const activeObjectives = this.questBridge
      ? this.questBridge.getObjectivesForEvaluation(this.character?.id)
      : undefined;

    const currentCefrLevel = this.languageTracker?.getCEFRLevel() || this.playerCefrLevel || undefined;
    this.insimulClient.requestMetadata({
      playerMessage,
      npcResponse,
      targetLanguage,
      playerProficiency: String(this.languageTracker?.getFluency?.() ?? 'beginner'),
      cefrLevel: currentCefrLevel,
      vocabularyRange: currentCefrLevel ? buildVocabularyRangeSummary(currentCefrLevel as any) : undefined,
      activeObjectives,
    })
      .then((metadata: any) => {
        if (!metadata) return;

        // Process conversation goal evaluations — complete quest objectives
        if (metadata.goalEvaluations?.length > 0 && this.questBridge) {
          this.questBridge.processEvaluations(
            metadata.goalEvaluations,
            this.character?.id,
            playerMessage,
          );
        }

        // Process grammar feedback
        if (metadata.grammarFeedback && this.languageTracker) {
          const feedback = metadata.grammarFeedback;
          if (feedback.status === 'corrected' && feedback.errors?.length > 0) {
            this.languageTracker.recordGrammarFeedback(feedback);
            const corrections = feedback.errors.map((err: any) =>
              `"${err.incorrect}" → "${err.corrected}" (${err.explanation})`
            ).join('\n');
            this.displayGrammarFeedback(corrections, false);

            for (const err of feedback.errors) {
              const count = (this._sessionGrammarErrors.get(err.pattern) || 0) + 1;
              this._sessionGrammarErrors.set(err.pattern, count);
              if (count >= 3 && !this._grammarFocusShown.has(err.pattern)) {
                this._grammarFocusShown.add(err.pattern);
                this.showGrammarFocusPopup(err.pattern, err.explanation, err.corrected);
              }
            }
          } else if (feedback.status === 'correct') {
            this.displayGrammarFeedback('Great grammar!', true);
            // Emit grammar_demonstrated for quest objective tracking (QCE handles this event type)
            if (this._gameEventBus) {
              (this._gameEventBus as any).emit({ type: 'grammar_demonstrated', patternCount: 1 });
            }
          }
        }

        // Process vocab hints — feed into hover-to-translate system
        if (metadata.vocabHints?.length > 0) {
          this.hoverTranslation.addVocabHints(metadata.vocabHints as VocabHint[]);
          this.rebuildMessagesWithTranslations();

          // Emit translation_attempt for each target-language word used (for quest objectives)
          if (this._gameEventBus) {
            for (const hint of metadata.vocabHints) {
              (this._gameEventBus as any).emit({
                type: 'translation_attempt',
                isCorrect: true,
                word: (hint as any).word || (hint as any).term,
              });
            }
          }
        }

        // Process NPC details — facts learned about this NPC
        if (metadata.npcDetails?.length > 0 && this.character?.id && this._onNpcDetailsLearned) {
          this._onNpcDetailsLearned(this.character.id, metadata.npcDetails as string[]);
        }

        // Detect haggling intent — emit price_haggled when player uses price/negotiation keywords
        if (this._gameEventBus && this.character?.id && detectHagglingIntent(playerMessage, targetLanguage || undefined)) {
          const merchantId = this.character.id;
          const merchantName = `${this.character.firstName} ${this.character.lastName}`.trim();
          (this._gameEventBus as any).emit({
            type: 'price_haggled',
            itemId: '',
            itemName: '',
            merchantId,
            merchantName,
            typedWord: playerMessage,
            targetWord: '',
          });
        }
      })
      .catch((err: any) => {
        console.warn('[ChatPanel] Background metadata extraction failed:', err);
      });
  }

  /** Callback for when NPC details are extracted from conversation metadata. */
  private _onNpcDetailsLearned: ((npcId: string, facts: string[]) => void) | null = null;

  /** Set callback for NPC detail extraction results. Called by BabylonGame. */
  public setOnNpcDetailsLearned(callback: (npcId: string, facts: string[]) => void): void {
    this._onNpcDetailsLearned = callback;
  }

  private startHintTimer() {
    this.clearHintTimer();
    if (!this.languageTracker) return;

    const fluency = this.languageTracker.getFluency();
    const occupation = this.character?.occupation?.toLowerCase() || '';

    // Determine NPC patience based on occupation difficulty
    // Patient occupations (teacher, innkeeper, shopkeeper) wait much longer
    const patientOccupations = ['teacher', 'innkeeper', 'shopkeeper', 'bartender', 'healer', 'priest'];
    const impatientOccupations = ['scholar', 'noble', 'merchant', 'guard', 'captain', 'lord', 'duke'];
    const isPatient = patientOccupations.some(o => occupation.includes(o));
    const isImpatient = impatientOccupations.some(o => occupation.includes(o));

    // Hint timer: only for beginner/elementary players
    if (fluency < 40 && !this._hintShown) {
      const hintDelay = fluency < 20 ? 10000 : 15000;
      this._hintTimer = setTimeout(() => {
        if (!this.isProcessing && this.isVisible && this.character) {
          this._hintShown = true;
          this.messages.push({
            role: 'assistant',
            content: fluency < 20
              ? `(Don't worry, take your time! You can try saying something simple like "hello" or ask me a question in English.)`
              : `(Need a hint? Try using some of the words I just used, or ask me to repeat something!)`,
            timestamp: new Date()
          });
          this.updateMessagesDisplay();
        }
      }, hintDelay);
    }

    // Patience timer: NPC walks away if player is silent too long
    // Patient NPCs: 60s, Neutral NPCs: 30s, Impatient NPCs: 20s
    // Beginners get extra time
    const basePatienceMs = isPatient ? 60000 : isImpatient ? 20000 : 30000;
    const patienceMs = fluency < 20 ? basePatienceMs * 1.5 : basePatienceMs;

    this._patienceTimer = setTimeout(() => {
      if (!this.isProcessing && this.isVisible && this.character) {
        const farewell = isImpatient
          ? `*${this.character.firstName} looks distracted and turns to leave* "I must attend to other matters. Perhaps we can speak another time."`
          : isPatient
          ? `*${this.character.firstName} smiles warmly* "I should get back to work, but come talk to me anytime! You're doing great!"`
          : `*${this.character.firstName} nods politely* "Well, it was nice chatting. I'll be around if you need me."`;
        this.messages.push({
          role: 'assistant',
          content: farewell,
          timestamp: new Date()
        });
        this.updateMessagesDisplay();
        // Auto-close after a short delay so the player can read the farewell
        setTimeout(() => {
          if (this.isVisible) this.hide(true);
        }, 3000);
      }
    }, patienceMs);
  }

  private clearHintTimer() {
    if (this._hintTimer) {
      clearTimeout(this._hintTimer);
      this._hintTimer = null;
    }
    if (this._patienceTimer) {
      clearTimeout(this._patienceTimer);
      this._patienceTimer = null;
    }
  }

  // Legacy Gemini direct-fetch methods removed — all conversation routing now goes
  // through InsimulClient (WebSocket → SSE fallback, handled by @insimul/typescript).

  private _cachedSystemPrompt: string | null = null;
  private _systemPromptCharId: string | null = null;
  private _proficiencyDirty = false;

  private buildSystemPrompt(): string {
    if (!this.character) return '';
    // Return cached prompt if character hasn't changed
    if (this._cachedSystemPrompt && this._systemPromptCharId === this.character.id) {
      // Rebuild if inventory context, proficiency data, or prompt augmentation changed
      if (!this.playerInventoryContext && !this._proficiencyDirty && !this.systemPromptAugmentation) return this._cachedSystemPrompt;
    }
    this._proficiencyDirty = false;
    const proficiency = this.languageTracker?.getPlayerProficiency() || undefined;
    // Use current CEFR level from tracker (most up-to-date) or stored level
    const currentCefr = this.languageTracker?.getCEFRLevel() || this.playerCefrLevel || null;
    let prompt = buildLanguageAwareSystemPrompt(
      this.character,
      this.truths,
      this.worldLanguageContext || undefined,
      this.world ? {
        id: this.world.id,
        name: this.world.name,
        worldType: this.world.worldType,
        gameType: this.world.gameType,
        description: this.world.description,
        targetLanguage: this.world.targetLanguage,
      } : undefined,
      proficiency,
      currentCefr
    );

    // When CEFR level advanced since last conversation with this NPC, prompt NPC to acknowledge improvement
    if (this._previousCefrLevel && currentCefr && this._previousCefrLevel !== currentCefr) {
      prompt += `\n\nPLAYER IMPROVEMENT: The player has recently improved from ${this._previousCefrLevel} to ${currentCefr}. Briefly acknowledge their language improvement in your first response — comment naturally on how their speech has gotten better. Then continue the conversation normally.\n`;
    }
    if (this.playerInventoryContext) {
      prompt += this.playerInventoryContext;
    }
    // Inject quest offering context — NPC should proactively offer this quest
    if (this.questOfferingContext) {
      const q = this.questOfferingContext;
      prompt += `\n\nIMPORTANT - QUEST OFFERING: You are INITIATING this conversation. Keep your opening greeting SHORT (1-3 sentences). Briefly mention what you need — do NOT explain everything at once. Let the player ask questions. Stay in character.
Quest: "${q.questTitle}" — ${q.questDescription}
Objectives: ${q.objectives}

When the player accepts, use the QUEST_ASSIGN format. If declined, continue normal conversation.`;
    }

    // Inject active quest context — NPC should reference the ongoing quest
    if (this.activeQuestFromNPC) {
      const aq = this.activeQuestFromNPC;
      if (aq.isQuestGiver) {
        prompt += `\n\nACTIVE QUEST CONTEXT: You previously gave the player a quest: "${aq.questTitle}" — ${aq.questDescription}. Reference this quest naturally in conversation. Ask about their progress, offer hints or encouragement. Do NOT re-assign the quest.`;
      } else {
        prompt += `\n\nACTIVE QUEST CONTEXT: The player is working on a quest called "${aq.questTitle}" — ${aq.questDescription}. You are involved in one of the quest's objectives. Help the player with what they need — provide information, items, or guidance relevant to the quest objective involving you. Stay in character.`;
      }
    }

    // Inject NPC-guided conversation mode for quest objectives
    if (this.questGuidancePrompt) {
      prompt += '\n' + this.questGuidancePrompt;
    }

    // If no specific quest guidance prompt was set, inject the active quest's
    // current objective details so the NPC knows what to talk about
    if (!this.questGuidancePrompt && !this.activeQuestFromNPC && this._activeQuestObjectiveDetails) {
      prompt += `\n\nCURRENT QUEST OBJECTIVE: The player is working on a quest. Their current objective guidance:\n${this._activeQuestObjectiveDetails}\nProactively guide the conversation toward this objective. Help the player practice the relevant vocabulary and language skills described above. Stay in character.`;
    }

    // Inject listening comprehension or other quest-specific augmentation
    if (this.systemPromptAugmentation && this.character.id) {
      const augmentation = this.systemPromptAugmentation(this.character.id);
      if (augmentation) {
        prompt += augmentation;
      }
    }

    // Inject dynamic scaffolding/stretch directive based on real-time struggle monitoring
    if (this._difficultyMonitor.currentLevel !== 'none') {
      const targetLang = this._targetLanguage
        || this.worldLanguageContext?.targetLanguage
        || this.world?.targetLanguage
        || '';
      const nativeLang = 'English';
      const scaffoldDirective = buildScaffoldingDirective(
        this._difficultyMonitor.currentLevel,
        targetLang,
        nativeLang,
      );
      if (scaffoldDirective) {
        prompt += scaffoldDirective;
      }
    }

    // Inject playthrough relationship context
    if (this._relationshipManager && this.character.id) {
      const relContext = this._relationshipManager.getConversationContext(this.character.id);
      if (relContext) {
        prompt += relContext;
      }
    }
    this._cachedSystemPrompt = prompt;
    this._systemPromptCharId = this.character.id as string;

    // ── Debug: log client-side system prompt (sent via systemPromptBuilder) ──
    console.debug('[LLM:ClientPrompt] ══════════════════════════════════════════');
    console.debug('[LLM:ClientPrompt] Character:', this.character.firstName, this.character.lastName);
    console.debug('[LLM:ClientPrompt] CEFR level:', currentCefr || 'none');
    console.debug('[LLM:ClientPrompt] World language context:', this.worldLanguageContext ? `target=${this.worldLanguageContext.targetLanguage}` : 'none');
    console.debug('[LLM:ClientPrompt] Proficiency:', proficiency ? JSON.stringify(proficiency).slice(0, 200) : 'none');
    console.debug('[LLM:ClientPrompt] Difficulty monitor:', this._difficultyMonitor.currentLevel);
    console.debug('[LLM:ClientPrompt] Prompt length:', prompt.length, 'chars (~', Math.ceil(prompt.length / 4), 'tokens)');
    console.debug('[LLM:ClientPrompt] ── FULL SYSTEM PROMPT ──');
    console.debug(prompt);
    console.debug('[LLM:ClientPrompt] ══════════════════════════════════════════');

    return prompt;
  }

  // Grammar analysis is handled by requestBackgroundMetadata() which calls
  // /api/conversation/metadata and processes grammar feedback from the response.

  /** Clean text for spoken output — strip all formatting, markers, stage directions */
  private cleanTextForSpeech(text: string): string {
    return text
      .replace(/\*\*GRAMMAR_FEEDBACK\*\*[\s\S]*?\*\*END_GRAMMAR\*\*/g, '')
      .replace(/\*\*QUEST_ASSIGN\*\*[\s\S]*?\*\*END_QUEST\*\*/g, '')
      .replace(/\*\*VOCAB_HINTS\*\*[\s\S]*?\*\*END_VOCAB\*\*/g, '')
      .replace(/\*\*EVAL\*\*[\s\S]*?\*\*END_EVAL\*\*/g, '')
      .replace(/\*\*(VOCAB_HINTS|END_VOCAB|GRAMMAR_FEEDBACK|END_GRAMMAR|QUEST_ASSIGN|END_QUEST|EVAL|END_EVAL)\*\*/g, '')
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s*\([A-Z][^)]{1,60}\)/g, '')
      .replace(/\*[^*]{1,80}\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async textToSpeech(text: string) {
    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) return;
    try {
      // Use SDK for TTS (routes through server or local provider)
      if (this.insimulClient) {
        const audioBuffer = await this.insimulClient.synthesizeSpeech(cleanText, {
          voice: this._lockedVoice,
          gender: this._lockedGender,
          language: this._targetLanguage || undefined,
        } as any);
        if (audioBuffer && audioBuffer.byteLength > 0) {
          // Play through StreamingAudioPlayer as PCM (server returns raw PCM from Gemini TTS)
          if (this.streamingAudioPlayer) {
            this.streamingAudioPlayer.pushChunk({
              data: new Uint8Array(audioBuffer),
              encoding: 1, // PCM
              sampleRate: 24000,
              durationMs: 0,
            });
            this.streamingAudioPlayer.finish();
          }
          return;
        }
      }
      // Fallback to browser TTS
      await this.browserTextToSpeech(cleanText);
    } catch (error) {
      console.error('TTS error:', error);
      await this.browserTextToSpeech(cleanText);
    }
  }

  private browserTextToSpeech(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const speak = () => {
        const utterance = new SpeechSynthesisUtterance(cleanText);

        // Use the world's target language for TTS (not the NPC's fluency)
        const targetLang = this._targetLanguage
          || this.world?.targetLanguage
          || extractLanguageFluencies(this.truths)[0]?.language
          || 'English';
        const langCode = getLanguageBCP47(targetLang);
        utterance.lang = langCode;
        utterance.rate = 0.9;

        const voices = speechSynthesis.getVoices();
      const langPrefix = langCode.split('-')[0];
      const isFemale = this._lockedGender === 'female';
      // Prefer a voice matching the character's gender and language
      const langVoices = voices.filter(v => v.lang.startsWith(langPrefix));
      const genderMatch = langVoices.find(v =>
        isFemale
          ? /female|woman|zira|samantha|victoria|karen|moira|tessa/i.test(v.name)
          : /male|man|daniel|david|james|thomas|alex|jorge|rishi/i.test(v.name)
      );
      const voice = genderMatch || langVoices[0] || voices.find(v => v.lang.startsWith(langPrefix));
      if (voice) utterance.voice = voice;
      // Adjust pitch based on gender
      utterance.pitch = isFemale ? 1.2 : 0.85;

      this.isSpeaking = true;
      this.handsFreeController?.pause(); // Suppress mic during TTS

      // Show talking indicator
      if (this.talkingIndicator && this.character && this.npcMesh) {
        this.talkingIndicator.show(this.character.id, this.npcMesh);
      }

      utterance.onend = () => {
        this.isSpeaking = false;
        this.handsFreeController?.resume(); // Resume mic after TTS

        // Hide talking indicator
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        resolve();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.handsFreeController?.resume();
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        resolve();
      };

        speechSynthesis.speak(utterance);
      };

      // Voices may not be loaded yet — wait for them if empty
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = () => { speak(); };
        // Timeout fallback in case onvoiceschanged never fires
        setTimeout(() => { speak(); }, 500);
      } else {
        speak();
      }
    });
  }

  private playAudio(audioBlob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      this.isSpeaking = true;
      this.handsFreeController?.pause(); // Suppress mic during TTS

      // Show talking indicator
      if (this.talkingIndicator && this.character && this.npcMesh) {
        this.talkingIndicator.show(this.character.id, this.npcMesh);
      }

      audio.onended = () => {
        this.isSpeaking = false;
        this.handsFreeController?.resume(); // Resume mic after TTS
        URL.revokeObjectURL(audioUrl);

        // Hide talking indicator
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        resolve();
      };

      audio.onerror = (e) => {
        this.isSpeaking = false;
        this.handsFreeController?.resume();
        URL.revokeObjectURL(audioUrl);
        if (this.talkingIndicator && this.character) {
          this.talkingIndicator.hide(this.character.id);
        }
        reject(e);
      };

      audio.play().catch(reject);
    });
  }

  private async startRecording() {
    if (this.isRecording || this.isProcessing) return;

    // In always-on WebSocket mode, mic is already streaming — toggle mute instead
    if (this.voiceMode === 'always-on' && this.voiceWSClient) {
      this.voiceWSClient.setMuted(false);
      if (this.micButton) {
        this.micButton.background = "rgba(255, 50, 50, 0.8)";
      }
      return;
    }

    // Determine language for recognition
    const lang = this.worldLanguageContext?.targetLanguage
      ? getLanguageBCP47(this.worldLanguageContext.targetLanguage)
      : 'en-US';

    this.isRecording = true;

    // Update mic status indicator
    if (this.micButton) {
      this.micButton.background = "rgba(255, 50, 50, 0.8)";
    }

    // Update input text to show recording
    if (this.inputText) {
      this.inputText.text = "🎤 Listening...";
      this.inputText.color = "#ff6b6b";
    }

    if (isSpeechRecognitionSupported()) {
      this.speechService = new SpeechRecognitionService({
        lang,
        interimResults: true,
        continuous: false,
        onInterimResult: (text) => {
          if (this.inputText) {
            this.inputText.text = text;
            this.inputText.color = "#ffd93d";
          }
        },
        onFinalResult: (transcript) => {
          this.handleVoiceTranscript(transcript);
        },
        onError: (err) => {
          console.warn('[BabylonChatPanel] Speech recognition error:', err);
          this.resetRecordingUI();
        },
        onEnd: () => {
          this.isRecording = false;
          if (this.micButton) {
            this.micButton.background = "rgba(60, 60, 60, 0.8)";
            this.micButton.color = "white";
          }
        },
      });
      this.speechService.start();
    } else {
      // Fallback to server-side STT
      if (this.inputText) {
        this.inputText.text = "Recording...";
        this.inputText.color = "#ff6b6b";
      }
      try {
        this.serverSTTHandle = await serverSideSTT(
          (transcript) => this.handleVoiceTranscript(transcript),
          (err) => {
            console.error('[BabylonChatPanel] Server STT error:', err);
            this.resetRecordingUI();
          },
        );
      } catch (err) {
        console.error('Microphone error:', err);
        this.resetRecordingUI();
      }
    }
  }

  /**
   * Handle audio input via gRPC streaming service.
   * Sends audio to server for STT → LLM → TTS pipeline.
   */
  private async handleAudioViaGrpc(audioBlob: Blob): Promise<void> {
    const placeholderMsg: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    // Set up streaming text accumulation
    let accumulatedText = '';
    this.insimulClient!.on({
      onTextChunk: (text: string) => {
        accumulatedText += text;
        placeholderMsg.content = accumulatedText;
        if (this.messages[this.messages.length - 1] === placeholderMsg) {
          this.updateLastMessageText(accumulatedText);
        }
        this.onNPCSpeechUpdate?.(accumulatedText);
      },
      onAudioChunk: (chunk: AudioChunkOutput) => {
        this.streamingAudioPlayer?.pushChunk(chunk as StreamingAudioChunk);
      },
      onFacialData: (data: FacialData) => {
        this.lipSyncController?.pushFacialData(data);
      },
      onStateChange: (state: ConversationState) => {
        this._conversationState = state;
        this.updateConversationStateIndicator(state);
      },
      onComplete: () => {
        this.streamingAudioPlayer?.finish();
        this.lipSyncController?.start();
      },
      onError: (err: Error) => {
        console.error('[ChatPanel] Audio streaming error:', err);
      },
    });

    try {
      const langCode = this.worldLanguageContext?.learningTargetLanguage?.name
        ? getLanguageBCP47(this.worldLanguageContext.learningTargetLanguage.name)
        : 'en';

      this.updateConversationStateIndicator('thinking');
      if (this.inputText) {
        this.inputText.text = "NPC is thinking...";
        this.inputText.color = "#ffd93d";
      }

      this.messages.push(placeholderMsg);
      this.updateMessagesDisplay();

      const fullText = await this.insimulClient!.sendAudio(audioBlob, { languageCode: langCode });
      const responseText = fullText || accumulatedText;

      // Process response (quests, grammar, etc.)
      await this.processAssistantResponse('', responseText, placeholderMsg);
    } catch (err) {
      console.error('[ChatPanel] Audio conversation failed:', err);
      const idx = this.messages.indexOf(placeholderMsg);
      if (idx >= 0) this.messages.splice(idx, 1);
    }
  }

  /**
   * Update the visual state indicator in the chat panel.
   * Shows: thinking (dots), speaking (wave icon), listening (mic icon).
   */
  private updateConversationStateIndicator(state: ConversationState | string): void {
    if (!this._stateIndicator) return;

    switch (state) {
      case 'thinking':
        this._stateIndicator.text = '...';
        this._stateIndicator.color = '#ffd93d';
        this._stateIndicator.isVisible = true;
        break;
      case 'speaking':
        this._stateIndicator.text = ')))';
        this._stateIndicator.color = '#4CAF50';
        this._stateIndicator.isVisible = true;
        break;
      case 'listening':
        this._stateIndicator.text = 'MIC';
        this._stateIndicator.color = '#ff6b6b';
        this._stateIndicator.isVisible = true;
        break;
      default:
        this._stateIndicator.isVisible = false;
        break;
    }
    this._advancedTexture.markAsDirty();
  }

  private stopRecording() {
    // In always-on mode, mute instead of stopping
    if (this.voiceMode === 'always-on' && this.voiceWSClient) {
      this.voiceWSClient.setMuted(true);
      if (this.micButton) {
        this.micButton.background = "rgba(60, 60, 60, 0.8)";
      }
      return;
    }

    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.speechService) {
      this.speechService.stop();
    }
    if (this.serverSTTHandle) {
      this.serverSTTHandle.stop();
      this.serverSTTHandle = null;
    }

    // Update mic status indicator
    if (this.micButton) {
      this.micButton.background = "rgba(60, 60, 60, 0.8)";
    }

    // Reset input text to placeholder if no transcript was captured
    if (this.inputText) {
      const text = this.inputText.text.trim();
      if (text === '' || text === '🎤 Listening...' || text === 'Recording...') {
        this.inputText.text = this.inputPlaceholder;
        this.inputText.color = "white";
      }
    }
  }

  private resetRecordingUI() {
    this.isRecording = false;
    this.isProcessing = false;
    if (this.micButton) {
      this.micButton.background = "rgba(60, 60, 60, 0.8)";
    }
    if (this.inputText) {
      this.inputText.text = this.inputPlaceholder;
      this.inputText.color = "white";
    }
    if (this.loadingIndicator) {
      this.loadingIndicator.isVisible = false;
    }
  }

  private async handleVoiceTranscript(userTranscript: string) {
    if (!userTranscript.trim()) {
      this.resetRecordingUI();
      return;
    }

    // Route voice transcripts through the same streaming pipeline as typed messages.
    // This uses gRPC-first (fast streaming text + audio + lip sync) with SSE fallback,
    // instead of the old non-streaming sendToGemini() which waited for the full response.
    if (this.inputText) {
      this.inputText.text = userTranscript;
    }
    await this.sendMessage();
  }

  /**
   * Pronunciation practice: play a phrase via TTS, then record player's attempt
   * and score accuracy. Called when NPC offers a pronunciation challenge.
   */
  public async practicePronunciation(phrase: string): Promise<void> {
    // Show the phrase to practice
    this.messages.push({
      role: 'assistant',
      content: `🗣️ Repeat after me: "${phrase}"`,
      timestamp: new Date(),
    });
    this.updateMessagesDisplay();

    // Play the phrase via TTS so player can hear correct pronunciation
    await this.textToSpeech(phrase);

    // Wait a moment, then auto-start recording
    await new Promise(resolve => setTimeout(resolve, 500));

    this.messages.push({
      role: 'assistant',
      content: '🎤 Your turn! Recording...',
      timestamp: new Date(),
    });
    this.updateMessagesDisplay();

    // Record player's attempt
    try {
      const audioBlob = await this.recordPronunciationAttempt(5000); // 5 second max
      const transcript = await this.serverSpeechToText(audioBlob);

      // Score the pronunciation
      const result = scorePronunciation(phrase, transcript);
      const feedbackMsg = formatPronunciationFeedback(result);

      // Show detailed feedback
      this.messages.push({
        role: 'assistant',
        content: feedbackMsg,
        timestamp: new Date(),
      });

      // Show word-level detail for close/missed words
      const issues = result.wordResults.filter(w => w.match === 'close' || w.match === 'missed');
      if (issues.length > 0 && result.overallScore < 90) {
        const details = issues.map(w => {
          if (w.match === 'missed') return `"${w.expected}" — not detected`;
          return `"${w.spoken}" → "${w.expected}"`;
        }).join('\n');
        this.messages.push({
          role: 'assistant',
          content: details,
          timestamp: new Date(),
        });
      }

      this.updateMessagesDisplay();

      // Track pronunciation practice in language tracker
      if (this.languageTracker) {
        this.languageTracker.analyzePlayerMessage(transcript);
      }
    } catch (error) {
      console.error('Pronunciation practice error:', error);
      this.messages.push({
        role: 'assistant',
        content: '⚠️ Could not capture audio. Try again!',
        timestamp: new Date(),
      });
      this.updateMessagesDisplay();
    }
  }

  /** Server-side STT for pronunciation scoring (needs full audio for accuracy). */
  private async serverSpeechToText(audioBlob: Blob): Promise<string> {
    // Route through SDK (handles server or local STT provider)
    if (this.insimulClient) {
      const transcript = await this.insimulClient.transcribeSpeech(audioBlob);
      if (transcript) return transcript;
    }
    // Direct fetch fallback
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    const response = await fetch('/api/stt', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Failed to convert speech to text');
    const data = await response.json();
    return data.transcript;
  }

  /**
   * Record audio for a fixed duration and return the blob.
   */
  private recordPronunciationAttempt(maxDurationMs: number): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          resolve(new Blob(chunks, { type: 'audio/webm' }));
        };

        recorder.onerror = () => {
          stream.getTracks().forEach(track => track.stop());
          reject(new Error('Recording failed'));
        };

        recorder.start();

        // Update mic button visual
        if (this.micButton) {
          this.micButton.background = "rgba(255, 50, 50, 0.8)";
        }

        // Auto-stop after duration
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          if (this.micButton) {
            this.micButton.background = "rgba(100, 100, 100, 0.6)";
          }
        }, maxDurationMs);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Speak a single word via TTS (for vocabulary pronunciation).
   * Returns a promise that resolves when speech is complete.
   */
  public async speakWord(word: string): Promise<void> {
    await this.textToSpeech(word);
  }

  /**
   * Track quest progress from conversation
   */
  private trackQuestProgress(userMessage: string, aiResponse: string) {
    // Extract words from both messages
    const combinedText = `${userMessage} ${aiResponse}`;
    const words = combinedText.toLowerCase()
      .replace(/[^\wà-ÿ\s]/gi, '') // Keep accented characters
      .split(/\s+/)
      .filter(word => word.length > 3); // Only words longer than 3 chars

    // Track vocabulary usage
    if (this.onVocabularyUsed) {
      // Deduplicate words
      const uniqueWords = Array.from(new Set(words));
      uniqueWords.forEach(word => {
        this.onVocabularyUsed!(word);
      });
    }

    // Track every conversation turn — pass all extracted words as keywords
    // so that complete_conversation objectives can match any target-language word.
    // This is language-agnostic (works for French, Spanish, etc.)
    if (this.onConversationTurn) {
      this.onConversationTurn(words);
    }

    // Detect conversation topic and fire topic-tagged event for objectives like
    // ask_for_directions, order_food, haggle_price, introduce_self, build_friendship
    if (this.onNpcConversationTurn && this.character) {
      const topicTag = this.detectConversationTopic(words);
      this.onNpcConversationTurn(this.character.id, topicTag);
    }

    // Detect writing submissions: if the player's message is substantial enough,
    // track it for write_response / describe_scene objectives
    if (this.onWritingSubmitted) {
      const playerWords = userMessage.trim().split(/\s+/).filter(w => w.length > 0);
      if (playerWords.length >= 3) {
        this.onWritingSubmitted(userMessage, playerWords.length);
      }
    }

    // Detect conversational actions and record turn counts
    if (this.onConversationalAction && this.character) {
      const ctx: DetectorContext = {
        npcId: this.character.id,
        npcMessage: aiResponse,
        playerMessage: userMessage,
        targetLanguage: this._targetLanguage || undefined,
        questTopics: this._questTopics.length > 0 ? this._questTopics : undefined,
      };
      const actions = this.conversationalActionDetector.detect(ctx);
      const turnState = this.conversationalActionDetector.recordTurn(
        this.character.id,
        userMessage,
        this._targetLanguage || undefined,
      );
      this.onConversationalAction(actions, turnState);
    }
  }

  /**
   * Detect conversation topic from keywords for topic-based quest objectives.
   * Returns a topic tag if keywords match a known topic, undefined otherwise.
   */
  private detectConversationTopic(words: string[]): string | undefined {
    const wordSet = new Set(words);

    const topicKeywords: Record<string, string[]> = {
      directions: ['direction', 'directions', 'where', 'left', 'right', 'straight', 'turn', 'north', 'south', 'east', 'west', 'find', 'locate', 'route', 'navigate'],
      order: ['order', 'menu', 'food', 'drink', 'meal', 'serve', 'plate', 'dish', 'eat', 'restaurant', 'waiter', 'waitress', 'chef', 'kitchen', 'table', 'bill', 'coffee', 'water', 'bread'],
      haggle: ['price', 'cost', 'cheap', 'expensive', 'discount', 'deal', 'bargain', 'haggle', 'negotiate', 'offer', 'sell', 'buy', 'gold', 'coins', 'money', 'worth', 'lower'],
      introduction: ['name', 'hello', 'greet', 'greeting', 'meet', 'introduce', 'introduction', 'pleased', 'nice', 'yourself', 'who', 'call'],
      friendship: ['friend', 'friends', 'friendship', 'like', 'enjoy', 'hobby', 'hobbies', 'favorite', 'favourite', 'together', 'share', 'trust', 'kind', 'help', 'care'],
    };

    let bestTopic: string | undefined;
    let bestCount = 0;

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matchCount = keywords.filter(kw => wordSet.has(kw)).length;
      if (matchCount > bestCount) {
        bestCount = matchCount;
        bestTopic = topic;
      }
    }

    // Require at least 2 keyword matches to avoid false positives
    return bestCount >= 2 ? bestTopic : undefined;
  }

  public getLanguageTracker(): import('../logic/LanguageProgressTracker').LanguageProgressTracker | null {
    return this.languageTracker;
  }

  public getHoverTranslation(): HoverTranslationSystem {
    return this.hoverTranslation;
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Set a persistent language tracker to be reused across conversations.
   * When set, initializeChat() will use this tracker instead of creating a new one,
   * preserving vocabulary/grammar data accumulated in prior sessions.
   */
  public setPersistentLanguageTracker(tracker: import('../logic/LanguageProgressTracker').LanguageProgressTracker): void {
    this.persistentLanguageTracker = tracker;
  }
  private persistentLanguageTracker: import('../logic/LanguageProgressTracker').LanguageProgressTracker | null = null;
  private _dataSource: DataSource | null = null;
  private _prologFactsProvider: (() => Array<{ predicate: string; args: Array<string | number> }>) | null = null;
  private _appearanceProvider: ((characterId: string) => string | null) | null = null;

  public setDataSource(ds: DataSource): void {
    this._dataSource = ds;
  }

  /**
   * Append a player/NPC exchange to save.conversations via the data source.
   * SaveFileDataSource.saveConversation() merges per-NPC: it appends the new
   * turns to recentTurns, sums totalTurnCount, and marks the save dirty so
   * the next auto-save persists the change. Non-fatal on failure — the chat
   * UI still gets the response, only the analytics panel misses the turn.
   */
  private async persistConversationTurn(
    playerMessage: string,
    npcResponse: string,
  ): Promise<void> {
    if (!this._dataSource || !this.character?.id) return;
    if (typeof this._dataSource.saveConversation !== 'function') return;

    const first = this.character.firstName ?? '';
    const last = this.character.lastName ?? '';
    const npcName = `${first} ${last}`.trim() || this.character.id;
    const timestamp = new Date().toISOString();
    // Cheap word extraction — lowercase, split on punctuation/whitespace (so
    // accented chars like é/ç/ü in French/Spanish are preserved), dedupe,
    // drop single-letter tokens. Enough for the Insights panel to show
    // "words used this session"; fancier vocabulary tracking is the
    // languageTracker's job elsewhere.
    const wordsUsed = Array.from(
      new Set(
        playerMessage
          .toLowerCase()
          .split(/[\s.,!?;:()"'\-–—]+/)
          .filter((w) => w.length > 1),
      ),
    );

    await this._dataSource.saveConversation(this.playthroughId ?? '', {
      npcCharacterId: this.character.id,
      npcCharacterName: npcName,
      turns: [
        { role: 'player', content: playerMessage, timestamp },
        { role: 'npc', content: npcResponse, timestamp },
      ],
      turnCount: 1,
      wordsUsed,
      newWordsLearned: [],
      topics: [],
      locationId: null,
      locationName: null,
    });
  }

  /** Set a callback that returns current Prolog facts for sending to the server */
  public setPrologFactsProvider(provider: () => Array<{ predicate: string; args: Array<string | number> }>): void {
    this._prologFactsProvider = provider;
  }

  /**
   * Set a callback that returns a natural-language description of the NPC's
   * current visible appearance (clothing, body, accessories). The string is
   * forwarded to the server and injected into the system prompt so the NPC
   * can acknowledge what the player actually sees on screen.
   */
  public setAppearanceProvider(provider: (characterId: string) => string | null): void {
    this._appearanceProvider = provider;
  }

  /** Get the current AI provider setting */
  /** Set the quest bridge for conversation goal evaluation. */
  public setQuestBridge(bridge: ConversationQuestBridge): void {
    this.questBridge = bridge;
  }

  /** Set the game event bus for emitting grammar, translation, and friendship events. */
  public setGameEventBus(bus: any): void {
    this._gameEventBus = bus;
  }

  /** Get the current InsimulClient instance (for registration in global registry). */
  public getInsimulClient(): InsimulClient | null {
    return this.insimulClient;
  }

  public getAIProvider(): string {
    return this._aiProvider;
  }

  public getVoiceInputMode(): string {
    return this._voiceInputMode;
  }

  public setVoiceInputMode(mode: string): void {
    this._voiceInputMode = mode as 'push-to-talk' | 'auto-listen';
  }

  /**
   * Set the AI provider: 'auto' | 'browser' | 'server'
   * - 'auto': Use browser AI if WebGPU available, else server
   * - 'browser': Force browser-only (WebLLM + Kokoro TTS)
   * - 'server': Force server-only (WebSocket/Gemini)
   */
  public setAIProvider(provider: string): void {
    this._aiProvider = provider;

    // Dispose current client and recreate with new provider
    if (this.insimulClient) {
      this.insimulClient.dispose();
      this.insimulClient = null;
    }
    this._grpcAvailable = null;

    // Re-initialize with the new provider if we have a character
    if (this.character) {
      this.initConversationClient(this.character, this.npcMesh || undefined);
    }
  }

  public setPlaythroughId(id: string) {
    this.playthroughId = id;
  }

  public setRelationshipManager(manager: import('../logic/RelationshipManager').RelationshipManager) {
    this._relationshipManager = manager;
    this._cachedSystemPrompt = null; // Force prompt rebuild
  }

  public setOnClose(callback: () => void) {
    this.onClose = callback;
  }

  public setOnQuestAssigned(callback: (questData: any) => void) {
    this.onQuestAssigned = callback;
  }

  public setOnQuestBranched(callback: (questId: string, choiceId: string, targetStageId: string) => void) {
    this.onQuestBranched = callback;
  }

  public setOnActionSelect(callback: (actionId: string) => void) {
    this.onActionSelect = callback;
  }

  public setOnGesturePerformed(callback: (gestureId: string) => void) {
    this.onGesturePerformed = callback;
  }

  public setOnVocabularyUsed(callback: (word: string) => void) {
    this.onVocabularyUsed = callback;
  }

  public setOnConversationTurn(callback: (keywords: string[]) => void) {
    this.onConversationTurn = callback;
  }

  public setOnNPCConversationStarted(callback: (npcId: string) => void) {
    this.onNPCConversationStarted = callback;
  }

  public setOnNPCSpeechUpdate(callback: (text: string) => void) {
    this.onNPCSpeechUpdate = callback;
  }

  public setPlayerInventoryContext(items: Array<{ name: string; type: string; quantity: number }>, gold: number) {
    if (items.length === 0 && gold === 0) {
      this.playerInventoryContext = '';
      return;
    }
    const itemList = items.map(i => `${i.name} (x${i.quantity})`).join(', ');
    this.playerInventoryContext = `\nThe player currently has ${gold} gold${items.length > 0 ? ` and carries: ${itemList}` : ''}.`;
  }

  public setOnQuestTurnedIn(callback: (questId: string, rewards: any) => void) {
    this.onQuestTurnedIn = callback;
  }

  public setOnFluencyGain(callback: (fluency: number, gain: number) => void) {
    this.onFluencyGain = callback;
  }

  public setOnConversationSummary(callback: (result: any) => void) {
    this.onConversationSummary = callback;
  }

  /**
   * Return the conversation transcript in the shape the server-side grader
   * (`POST /api/assessments/score-conversation`) expects. Used by the
   * assessment flow to grade the conversation phase per-turn. System messages
   * are included so the grader can read the NPC role context, but only
   * user/assistant turns produce task results downstream.
   */
  public getTranscriptForGrading(): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return this.messages.map(m => ({ role: m.role, content: m.content }));
  }

  /** Set callback for when the player rates an NPC dialogue response (1-5 stars). */
  public setOnDialogueRating(callback: (messageIndex: number, rating: number) => void) {
    this.onDialogueRating = callback;
  }

  /** Set callback invoked after each player↔NPC message exchange. */
  public setOnChatExchange(callback: (npcId: string, playerMessage: string, npcResponse: string) => void) {
    this.onChatExchange = callback;
  }

  /** Set callback invoked when the player clicks the collapsed header to initiate a conversation. */
  public setOnTalkRequested(callback: () => void) {
    this.onTalkRequested = callback;
  }

  /** Set callback for topic-tagged conversation turns (directions, ordering, haggling, etc.). */
  public setOnNpcConversationTurn(callback: (npcId: string, topicTag: string | undefined) => void) {
    this.onNpcConversationTurn = callback;
  }

  /** Set callback for writing submissions (write_response / describe_scene objectives). */
  public setOnWritingSubmitted(callback: (text: string, wordCount: number) => void) {
    this.onWritingSubmitted = callback;
  }

  /** Set callback for conversational action detection results. */
  public setOnListenAndRepeat(callback: (result: RepeatAttemptResult) => void) {
    this.onListenAndRepeat = callback;
  }

  public setOnConversationalAction(callback: (actions: ConversationalAction[], turnState: NpcConversationTurnState) => void) {
    this.onConversationalAction = callback;
  }

  /** Update the quest topics used for asked_about_topic detection. */
  public setQuestTopics(topics: Array<{ questId: string; keywords: string[] }>) {
    this._questTopics = topics;
  }

  /** Set a function that provides additional system prompt text for specific NPCs. */
  public setSystemPromptAugmentation(fn: (npcId: string) => string | null) {
    this.systemPromptAugmentation = fn;
  }

  // ── Listening Mode ──────────────────────────────────────────────────────

  /** Whether the chat panel is in listening mode (NPC text hidden, waveform shown). */
  public get isListeningMode(): boolean {
    return this._listeningMode;
  }

  /**
   * Enter listening mode: hides NPC text display and shows an audio waveform
   * visualization with playback controls. Used during NPC listening exams.
   */
  public enterListeningMode(
    audioUrl: string,
    onReplay: () => void,
    maxReplays: number,
  ): void {
    this._listeningMode = true;
    this._listeningReplaysRemaining = maxReplays;
    this._listeningOnReplay = onReplay;

    // Hide existing messages
    if (this.messagesStack) {
      this.messagesStack.isVisible = false;
    }

    // Create waveform container in the messages area
    if (this.messagesScrollViewer) {
      this._listeningWaveformContainer = new StackPanel('listeningWaveform');
      this._listeningWaveformContainer.isVertical = true;
      this._listeningWaveformContainer.spacing = 8;
      this._listeningWaveformContainer.width = '100%';
      this._listeningWaveformContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      this.messagesScrollViewer.addControl(this._listeningWaveformContainer);

      // Listening icon/label
      const listenLabel = new TextBlock('listenLabel', '\uD83C\uDFA7 Listening...');
      listenLabel.fontSize = 18;
      listenLabel.color = '#FFD700';
      listenLabel.height = '30px';
      listenLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this._listeningWaveformContainer.addControl(listenLabel);

      // Waveform bars row
      const barsRow = new StackPanel('barsRow');
      barsRow.isVertical = false;
      barsRow.height = '60px';
      barsRow.spacing = 3;
      barsRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this._listeningWaveformContainer.addControl(barsRow);

      this._listeningWaveformBars = [];
      for (let i = 0; i < 20; i++) {
        const bar = new Rectangle(`waveBar${i}`);
        bar.width = '8px';
        bar.height = '10px';
        bar.background = '#3b82f6';
        bar.thickness = 0;
        bar.cornerRadius = 2;
        bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        barsRow.addControl(bar);
        this._listeningWaveformBars.push(bar);
      }

      // Status text
      this._listeningStatusText = new TextBlock('listenStatus', 'Playing audio...');
      this._listeningStatusText.fontSize = 13;
      this._listeningStatusText.color = '#22c55e';
      this._listeningStatusText.height = '20px';
      this._listeningStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this._listeningWaveformContainer.addControl(this._listeningStatusText);

      // Replay button
      const replayBtnContainer = new Rectangle('replayBtnContainer');
      replayBtnContainer.width = '180px';
      replayBtnContainer.height = '36px';
      replayBtnContainer.background = maxReplays > 0 ? '#3b82f6' : '#4b5563';
      replayBtnContainer.cornerRadius = 8;
      replayBtnContainer.thickness = 0;
      replayBtnContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      replayBtnContainer.isPointerBlocker = true;
      replayBtnContainer.alpha = maxReplays > 0 ? 1.0 : 0.5;
      this._listeningWaveformContainer.addControl(replayBtnContainer);

      const replayLabel = new TextBlock('replayLabel', `\u{1F501} Replay (${maxReplays} left)`);
      replayLabel.fontSize = 13;
      replayLabel.color = 'white';
      replayBtnContainer.addControl(replayLabel);

      replayBtnContainer.onPointerClickObservable.add(() => {
        if (this._listeningReplaysRemaining > 0) {
          this._listeningReplaysRemaining--;
          this._listeningOnReplay?.();
          this.playListeningAudio(audioUrl);
          replayLabel.text = this._listeningReplaysRemaining > 0
            ? `\u{1F501} Replay (${this._listeningReplaysRemaining} left)`
            : '\u{1F501} No replays left';
          replayBtnContainer.alpha = this._listeningReplaysRemaining > 0 ? 1.0 : 0.5;
          replayBtnContainer.background = this._listeningReplaysRemaining > 0 ? '#3b82f6' : '#4b5563';
        }
      });

      this._listeningReplayBtn = replayBtnContainer;
    }

    // Start audio playback
    this.playListeningAudio(audioUrl);

    // Start waveform animation
    this._listeningWaveformInterval = setInterval(() => {
      this.animateWaveform();
    }, 100);
  }

  /**
   * Exit listening mode: restores normal chat display.
   */
  public exitListeningMode(): void {
    this._listeningMode = false;

    // Stop waveform animation
    if (this._listeningWaveformInterval) {
      clearInterval(this._listeningWaveformInterval);
      this._listeningWaveformInterval = null;
    }

    // Stop audio
    if (this._listeningAudioElement) {
      this._listeningAudioElement.pause();
      this._listeningAudioElement = null;
    }

    // Remove waveform container
    if (this._listeningWaveformContainer) {
      this._listeningWaveformContainer.dispose();
      this._listeningWaveformContainer = null;
    }
    this._listeningWaveformBars = [];
    this._listeningStatusText = null;
    this._listeningReplayBtn = null;
    this._listeningOnReplay = null;

    // Restore messages visibility
    if (this.messagesStack) {
      this.messagesStack.isVisible = true;
    }
  }

  private playListeningAudio(audioUrl: string): void {
    if (this._listeningAudioElement) {
      this._listeningAudioElement.pause();
    }
    this._listeningAudioElement = new Audio(audioUrl);

    if (this._listeningStatusText) {
      this._listeningStatusText.text = 'Playing audio...';
      this._listeningStatusText.color = '#22c55e';
    }

    this._listeningAudioElement.onended = () => {
      if (this._listeningStatusText) {
        this._listeningStatusText.text = this._listeningReplaysRemaining > 0
          ? 'Finished — replay or wait for questions'
          : 'Finished — questions coming soon';
        this._listeningStatusText.color = '#9ca3af';
      }
    };

    this._listeningAudioElement.onerror = () => {
      if (this._listeningStatusText) {
        this._listeningStatusText.text = 'Audio error';
        this._listeningStatusText.color = '#ef4444';
      }
    };

    this._listeningAudioElement.play().catch(() => {
      if (this._listeningStatusText) {
        this._listeningStatusText.text = 'Playback failed';
        this._listeningStatusText.color = '#ef4444';
      }
    });
  }

  private animateWaveform(): void {
    const isPlaying = this._listeningAudioElement && !this._listeningAudioElement.paused;
    for (const bar of this._listeningWaveformBars) {
      const height = isPlaying
        ? 10 + Math.random() * 45
        : 10;
      bar.height = `${height}px`;
      bar.background = isPlaying ? '#3b82f6' : '#4b5563';
    }
  }

  /**
   * Set the target language for greetings and display. Call before show() so
   * the greeting is in the correct language without waiting for async world fetch.
   */
  public setTargetLanguage(lang: string | null) {
    this._targetLanguage = lang;
  }

  /**
   * Set the current time of day so NPC opening greetings can reference it.
   * Call before show().
   */
  public setTimeOfDay(timeOfDay: string | null) {
    this._timeOfDay = timeOfDay;
  }

  /**
   * Set a recent proximity greeting for conversation continuation (US-013).
   * When set, the NPC's opening line will continue from this greeting rather than starting fresh.
   * Call before show(). Cleared automatically after each conversation.
   */
  public setRecentGreeting(text: string | null) {
    this._recentGreeting = text;
  }

  /**
   * Set quest offering context so the NPC proactively offers a quest at conversation start.
   * Call before show() when the NPC has an 'available' quest indicator.
   */
  public setQuestOfferingContext(context: { questTitle: string; questDescription: string; questType: string; difficulty: string; objectives: string; category: string } | null) {
    this.questOfferingContext = context;
  }

  /**
   * Set active quest context so the NPC references an in-progress quest during conversation.
   * Call before show() when the NPC has an 'in_progress' quest indicator.
   */
  public setActiveQuestFromNPC(context: { questTitle: string; questDescription: string; questId: string; isQuestGiver?: boolean } | null) {
    this.activeQuestFromNPC = context;
  }

  /**
   * Set NPC-guided conversation mode prompt addition.
   * When set, the NPC will steer the conversation to help the player complete
   * relevant quest objectives. Call before show().
   */
  /** Set the player's current position so NPCs can turn to face them during conversation. */
  public setPlayerPosition(position: Vector3) {
    this._playerPosition = position;
  }

  public getQuestGuidancePrompt(): string | null {
    return this.questGuidancePrompt;
  }

  /** Set the current active quest objective's details for LLM prompting. */
  public setActiveQuestObjectiveDetails(details: string | null): void {
    this._activeQuestObjectiveDetails = details;
  }

  public setQuestGuidancePrompt(prompt: string | null) {
    this.questGuidancePrompt = prompt;
    // Invalidate cached system prompt so it rebuilds with guidance
    this._cachedSystemPrompt = null;
  }

  /**
   * Trigger an NPC greeting when quest guidance arrives asynchronously.
   * Only fires if the conversation is fresh (no messages yet) and no quest offering
   * greeting is already planned.
   */
  public triggerQuestGuidanceGreeting(): void {
    // NPC greeting disabled — wait for the player to initiate conversation.
  }

  private _onExternalNewWord: ((entry: any) => void) | null = null;
  private _onExternalWordMastered: ((entry: any) => void) | null = null;
  private _onExternalGrammarFeedback: ((feedback: any) => void) | null = null;

  public setOnNewWordLearned(callback: (entry: any) => void) {
    this._onExternalNewWord = callback;
    if (this.languageTracker) {
      const orig = this.languageTracker['onNewWordLearned'];
      this.languageTracker.setOnNewWordLearned((entry) => {
        orig?.(entry);
        callback(entry);
      });
    }
  }

  public setOnWordMastered(callback: (entry: any) => void) {
    this._onExternalWordMastered = callback;
    // The tracker's onWordMastered is set during initLanguageTracking.
    // We chain it after.
    if (this.languageTracker) {
      const orig = this.languageTracker['onWordMastered'];
      this.languageTracker.setOnWordMastered((entry) => {
        orig?.(entry);
        callback(entry);
      });
    }
  }

  public setOnGrammarFeedbackExternal(callback: (feedback: any) => void) {
    this._onExternalGrammarFeedback = callback;
    if (this.languageTracker) {
      const orig = this.languageTracker['onGrammarFeedback'];
      this.languageTracker.setOnGrammarFeedback((feedback) => {
        orig?.(feedback);
        callback(feedback);
      });
    }
  }

  /**
   * Check if any quests from this NPC are ready to turn in
   */
  private async checkQuestTurnIn(npcId: string, worldId: string) {
    try {
      if (!this._dataSource) return;
      const quests = await this._dataSource.loadQuests(worldId);
      
      // Find quests assigned by this NPC that are ready to turn in
      // A quest is ready when status is 'active' but all objectives are complete
      const turnInQuests = quests.filter((quest: any) => {
        if (quest.assignedByCharacterId !== npcId) return false;
        if (quest.status !== 'active') return false;
        
        // Check if all objectives are complete
        if (quest.objectives && Array.isArray(quest.objectives)) {
          return quest.objectives.every((obj: any) => obj.isCompleted || obj.completed);
        }
        
        // Check progress-based completion
        if (quest.completionCriteria && quest.progress) {
          return this.isQuestComplete(quest);
        }
        
        return false;
      });

      if (turnInQuests.length > 0) {
        this.pendingTurnInQuests = turnInQuests;
        this.showQuestTurnInDialog(turnInQuests);
      }
    } catch (error) {
      console.error('[BabylonChatPanel] Failed to check quest turn-in:', error);
    }
  }

  /**
   * Check if a quest's progress-based criteria are complete
   */
  private isQuestComplete(quest: any): boolean {
    const criteria = quest.completionCriteria;
    const progress = quest.progress;
    
    if (!criteria || !progress) return false;

    switch (criteria.type) {
      case 'vocabulary_usage':
        return (progress.currentCount || 0) >= (criteria.requiredCount || 10);
      case 'conversation_turns':
        return (progress.turnsCompleted || 0) >= (criteria.requiredTurns || 5);
      case 'grammar_pattern':
        return (progress.currentCount || 0) >= (criteria.requiredCount || 5);
      case 'conversation_engagement':
        return (progress.messagesCount || 0) >= (criteria.requiredMessages || 8);
      case 'follow_directions':
        return (progress.stepsCompleted || 0) >= (criteria.stepsRequired || criteria.requiredCount || 1);
      default:
        return false;
    }
  }

  /**
   * Show dialog for turning in completed quests
   */
  private showQuestTurnInDialog(quests: any[]) {
    const dialog = new Rectangle('questTurnInDialog');
    dialog.width = '400px';
    dialog.height = `${100 + quests.length * 80}px`;
    dialog.background = 'rgba(20, 60, 100, 0.98)';
    dialog.color = '#4a9eff';
    dialog.thickness = 3;
    dialog.cornerRadius = 15;
    dialog.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    dialog.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    dialog.zIndex = 100;

    const mainStack = new StackPanel();
    mainStack.width = '100%';
    mainStack.paddingTop = '15px';
    mainStack.paddingBottom = '15px';
    dialog.addControl(mainStack);

    // Title
    const title = new TextBlock();
    title.text = '✅ Quest Complete!';
    title.color = '#4aff4a';
    title.fontSize = 22;
    title.fontWeight = 'bold';
    title.height = '35px';
    mainStack.addControl(title);

    // Quest list
    quests.forEach((quest, index) => {
      const questRow = new Rectangle(`turnInQuest_${index}`);
      questRow.width = '90%';
      questRow.height = '70px';
      questRow.background = 'rgba(255, 255, 255, 0.1)';
      questRow.cornerRadius = 8;
      questRow.thickness = 0;
      questRow.paddingTop = '5px';
      questRow.paddingBottom = '5px';
      mainStack.addControl(questRow);

      const questStack = new StackPanel();
      questStack.width = '100%';
      questRow.addControl(questStack);

      const questTitle = new TextBlock();
      questTitle.text = quest.title || 'Untitled Quest';
      questTitle.color = 'white';
      questTitle.fontSize = 16;
      questTitle.fontWeight = 'bold';
      questTitle.height = '25px';
      questTitle.paddingTop = '8px';
      questStack.addControl(questTitle);

      const rewardParts: string[] = [];
      if (quest.experienceReward) rewardParts.push(`${quest.experienceReward} XP`);
      const gold = quest.rewards?.gold ?? quest.rewards?.goldReward ?? 0;
      if (gold > 0) rewardParts.push(`${gold} Gold`);
      if (quest.itemRewards?.length) rewardParts.push(`${quest.itemRewards.length} item(s)`);
      const rewardText = new TextBlock();
      rewardText.text = `\u{1F381} ${rewardParts.join(' + ') || 'Completion'}`;
      rewardText.color = '#ffd700';
      rewardText.fontSize = 14;
      rewardText.height = '20px';
      questStack.addControl(rewardText);

      const turnInBtn = Button.CreateSimpleButton(`turnIn_${index}`, '📜 Turn In');
      turnInBtn.width = '100px';
      turnInBtn.height = '25px';
      turnInBtn.color = 'white';
      turnInBtn.background = 'rgba(50, 200, 100, 0.9)';
      turnInBtn.cornerRadius = 5;
      turnInBtn.fontSize = 12;
      turnInBtn.onPointerClickObservable.add(() => {
        this.turnInQuest(quest, dialog);
      });
      questStack.addControl(turnInBtn);
    });

    // Close button
    const closeBtn = Button.CreateSimpleButton('closeTurnIn', 'Later');
    closeBtn.width = '100px';
    closeBtn.height = '30px';
    closeBtn.color = 'white';
    closeBtn.background = 'rgba(100, 100, 100, 0.8)';
    closeBtn.cornerRadius = 5;
    closeBtn.fontSize = 14;
    closeBtn.paddingTop = '10px';
    closeBtn.onPointerClickObservable.add(() => {
      this._advancedTexture.removeControl(dialog);
    });
    mainStack.addControl(closeBtn);

    this._advancedTexture.addControl(dialog);
  }

  /**
   * Complete quest turn-in — delegates celebration to QuestCompletionManager
   * via the onQuestTurnedIn callback.
   */
  private async turnInQuest(quest: any, dialog: Rectangle) {
    this._advancedTexture.removeControl(dialog);

    if (this.onQuestTurnedIn) {
      this.onQuestTurnedIn(quest.id, {
        experienceReward: quest.experienceReward,
        itemRewards: quest.itemRewards,
        skillRewards: quest.skillRewards,
        unlocks: quest.unlocks,
        goldReward: quest.rewards?.gold ?? quest.rewards?.goldReward ?? 0,
      });
    }

    this.pendingTurnInQuests = this.pendingTurnInQuests.filter(q => q.id !== quest.id);
  }

  /**
   * Parse AI response for quest assignment markers and create quest
   */
  private async parseAndCreateQuest(response: string): Promise<string> {
    const questMatch = response.match(/\*\*QUEST_ASSIGN\*\*[\s\S]*?\*\*END_QUEST\*\*/);

    if (!questMatch || !this.character) {
      return response;
    }

    const questBlock = questMatch[0];
    const titleMatch = questBlock.match(/Title:\s*(.+)/);
    const descMatch = questBlock.match(/Description:\s*(.+)/);
    const typeMatch = questBlock.match(/Type:\s*(\w+)/);
    const difficultyMatch = questBlock.match(/Difficulty:\s*(\w+)/);
    const objectivesMatch = questBlock.match(/Objectives?:\s*(.+)/);
    const rewardsMatch = questBlock.match(/Rewards?:\s*(.+)/);

    if (titleMatch && descMatch && typeMatch && difficultyMatch) {
      try {
        // Determine experience reward based on difficulty
        let experienceReward = 50;
        const difficulty = difficultyMatch[1].trim().toLowerCase();

        // Language learning difficulties
        if (difficulty === 'beginner') experienceReward = 10;
        else if (difficulty === 'intermediate') experienceReward = 25;
        else if (difficulty === 'advanced') experienceReward = 50;
        // RPG difficulties
        else if (difficulty === 'easy') experienceReward = 50;
        else if (difficulty === 'normal') experienceReward = 100;
        else if (difficulty === 'hard') experienceReward = 200;
        else if (difficulty === 'legendary') experienceReward = 500;

        // Parse objectives from the quest block
        const parsedObjectives: { description: string; type?: string }[] = [];
        if (objectivesMatch) {
          const objText = objectivesMatch[1].trim();
          // Split by comma, semicolon, or numbered list
          const parts = objText.split(/[;,]|\d+\.\s+/).filter(p => p.trim());
          for (const part of parts) {
            parsedObjectives.push({ description: part.trim() });
          }
        }

        const questData = {
          assignedTo: 'Player',
          assignedBy: `${this.character.firstName} ${this.character.lastName}`,
          assignedByCharacterId: this.character.id,
          title: titleMatch[1].trim(),
          description: descMatch[1].trim(),
          questType: typeMatch[1].trim().toLowerCase(),
          difficulty: difficulty,
          targetLanguage: this.world?.targetLanguage || 'English',
          conversationContext: response,
          status: 'active',
          experienceReward,
          gameType: this.world?.gameType || this.world?.worldType || 'language-learning',
          objectives: parsedObjectives.length > 0 ? parsedObjectives : undefined,
          rewards: rewardsMatch ? rewardsMatch[1].trim() : undefined,
        };

        // Create the quest via DataSource (writes to save file, not world template)
        const createdQuest = this._dataSource
          ? await this._dataSource.createDynamicQuest(this.character.worldId, questData)
          : null;

        if (createdQuest) {

          // Notify quest assigned callback
          if (this.onQuestAssigned) {
            this.onQuestAssigned(createdQuest);
          }

          // Show notification in chat
          this.showQuestNotification(titleMatch[1].trim());
        }
      } catch (error) {
        console.error('[BabylonChatPanel] Failed to create quest:', error);
      }
    }

    // Return response with quest markers removed
    const cleanedResponse = response.replace(/\*\*QUEST_ASSIGN\*\*[\s\S]*?\*\*END_QUEST\*\*/, '').trim();
    return cleanedResponse || "I've assigned you a new quest! Check your quest log to see the details.";
  }

  /**
   * Show a visual notification when a quest is assigned
   */
  private showQuestNotification(questTitle: string) {
    // Create a temporary notification panel
    const notification = new Rectangle('questNotification');
    notification.width = '300px';
    notification.height = '60px';
    notification.background = 'rgba(50, 200, 100, 0.95)';
    notification.color = 'white';
    notification.thickness = 2;
    notification.cornerRadius = 10;
    notification.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    notification.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    notification.top = '80px';

    const notifStack = new StackPanel();
    notifStack.width = '100%';
    notification.addControl(notifStack);

    const titleText = new TextBlock();
    titleText.text = '📜 New Quest!';
    titleText.color = 'white';
    titleText.fontSize = 16;
    titleText.fontWeight = 'bold';
    titleText.height = '25px';
    titleText.paddingTop = '8px';
    notifStack.addControl(titleText);

    const questText = new TextBlock();
    questText.text = questTitle;
    questText.color = 'white';
    questText.fontSize = 14;
    questText.height = '25px';
    questText.textWrapping = TextWrapping.Ellipsis;
    notifStack.addControl(questText);

    this._advancedTexture.addControl(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this._advancedTexture.removeControl(notification);
    }, 3000);
  }

  /**
   * Parse and handle QUEST_BRANCH markers in NPC responses.
   * Shows branch choice buttons to the player.
   */
  private async parseAndHandleQuestBranch(response: string): Promise<void> {
    const match = response.match(/\*\*QUEST_BRANCH\*\*([\s\S]*?)\*\*END_BRANCH\*\*/);
    if (!match || !this.character) return;

    const block = match[1];
    const questIdMatch = block.match(/QuestId:\s*(.+)/);
    const promptMatch = block.match(/Prompt:\s*(.+)/);

    if (!questIdMatch) return;

    const questId = questIdMatch[1].trim();
    const prompt = promptMatch ? promptMatch[1].trim() : 'What will you do?';

    interface BranchChoice {
      choiceId: string;
      label: string;
      targetStageId: string;
      consequence?: string;
    }
    const choices: BranchChoice[] = [];
    const choiceRegex = /Choice:\s*(.+)/g;
    let choiceMatch;
    while ((choiceMatch = choiceRegex.exec(block)) !== null) {
      const parts = choiceMatch[1].split('|').map(s => s.trim());
      if (parts.length >= 3) {
        choices.push({
          choiceId: parts[0],
          label: parts[1],
          targetStageId: parts[2],
          consequence: parts[3] || undefined,
        });
      }
    }

    if (choices.length === 0) return;

    this.showBranchChoices(questId, prompt, choices);
  }

  /**
   * Display branch choice buttons in the chat panel.
   */
  private showBranchChoices(
    questId: string,
    prompt: string,
    choices: Array<{ choiceId: string; label: string; targetStageId: string; consequence?: string }>,
  ): void {
    // Add prompt as a system message
    this.messages.push({
      role: 'assistant',
      content: prompt,
      timestamp: new Date(),
    });
    this.updateMessagesDisplay();

    // Create choice buttons container
    const choiceContainer = new Rectangle('branchChoices');
    choiceContainer.width = '100%';
    choiceContainer.adaptHeightToChildren = true;
    choiceContainer.background = 'transparent';
    choiceContainer.thickness = 0;

    const stack = new StackPanel('branchStack');
    stack.width = '100%';
    stack.isVertical = true;
    stack.spacing = 6;
    choiceContainer.addControl(stack);

    for (const choice of choices) {
      const btn = Button.CreateSimpleButton(`branch_${choice.choiceId}`, choice.label);
      btn.width = '90%';
      btn.height = '36px';
      btn.color = 'white';
      btn.background = 'rgba(60, 100, 180, 0.85)';
      btn.cornerRadius = 8;
      btn.fontSize = 13;
      btn.thickness = 1;
      btn.hoverCursor = 'pointer';

      btn.onPointerClickObservable.add(async () => {
        // Remove choice buttons
        if (this.messagesStack) {
          this.messagesStack.removeControl(choiceContainer);
        }

        // Show the player's choice as a message
        this.messages.push({
          role: 'user',
          content: choice.label,
          timestamp: new Date(),
        });
        this.updateMessagesDisplay();

        // Call the branch endpoint
        try {
          const result = this._dataSource
            ? await this._dataSource.branchQuest(this.character!.worldId, questId, choice.choiceId, choice.targetStageId)
            : null;

          if (result) {

            if (choice.consequence) {
              this.messages.push({
                role: 'assistant',
                content: choice.consequence,
                timestamp: new Date(),
              });
              this.updateMessagesDisplay();
            }

            this.onQuestBranched?.(questId, choice.choiceId, choice.targetStageId);
          } else {
            console.error('[BabylonChatPanel] Branch failed: no dataSource');
          }
        } catch (error) {
          console.error('[BabylonChatPanel] Branch request error:', error);
        }
      });

      stack.addControl(btn);
    }

    // Add choice container to the messages scroll area
    if (this.messagesStack) {
      this.messagesStack.addControl(choiceContainer);
    }
  }

  /**
   * Set available dialogue actions for the current conversation
   */
  public setDialogueActions(actions: Action[], playerEnergy: number) {
    this.availableActions = actions;
    this.playerEnergy = playerEnergy;

    if (this.isVisible && this.actionsContainer && actions.length > 0) {
      if (!this.dialogueActions) {
        this.dialogueActions = new BabylonDialogueActions();
      }

      this.dialogueActions.show(
        this.actionsContainer,
        actions,
        playerEnergy,
        (actionId: string) => {
          this.onActionSelect?.(actionId);
        }
      );
    }
  }

  /**
   * Show the gesture panel inside the chat container.
   * Creates it lazily on first call.
   */
  private showGesturePanel(): void {
    if (!this.mainLayout || !this.chatContainer || !this.onGesturePerformed) return;

    if (!this.gesturePanel) {
      this.gesturePanel = new BabylonGesturePanel();
    }

    this.gesturePanel?.show(
      this.mainLayout!,
      (gestureId: string) => {
        this.onGesturePerformed?.(gestureId);
      },
    );

    // Increase chat container height to accommodate the gesture row (48px)
    this.chatContainer.height = '398px';
  }

  /**
   * Update dialogue actions (e.g., when player energy changes)
   */
  public updateDialogueActions(playerEnergy: number) {
    this.playerEnergy = playerEnergy;
    if (this.dialogueActions && this.dialogueActions.isVisible()) {
      this.dialogueActions.update(this.availableActions, playerEnergy);
    }
  }

  // ─── WebSocket voice mode ──────────────────────────────────────────

  /**
   * Toggle between push-to-talk (HTTP) and always-on (WebSocket) voice modes.
   */
  private toggleVoiceMode(): void {
    if (this.voiceMode === 'push-to-talk') {
      this.voiceMode = 'always-on';
      this.activateWebSocketVoice();
    } else {
      this.voiceMode = 'push-to-talk';
      this.deactivateWebSocketVoice();
    }
  }

  /**
   * Activate WebSocket voice mode: connect, join room, start capture.
   */
  private activateWebSocketVoice(): void {
    if (this.voiceWSClient) {
      this.voiceWSClient.destroy();
    }

    this.voiceWSClient = new VoiceWebSocketClient(
      {
        onStateChange: (state) => {
          if (state === 'in_room' && this.voiceMode === 'always-on') {
            this.voiceWSClient?.startCapture().catch(err => {
              console.warn('[ChatPanel] Failed to start capture:', err);
            });
          }
        },
        onAudio: (_fromId, _audioBase64) => {
          // Audio is played by the jitter buffer inside VoiceWebSocketClient
        },
        onTranscript: (text, isFinal) => {
          if (this.inputText) {
            this.inputText.text = text;
            this.inputText.color = isFinal ? 'white' : '#ffd93d';
          }
          if (isFinal && text.trim()) {
            this.handleVoiceTranscript(text);
          }
        },
        onError: (msg) => {
          console.warn('[ChatPanel] Voice WS error:', msg);
        },
        onFallbackToHTTP: () => {
          this.voiceMode = 'push-to-talk';
          if (this.inputText) {
            this.inputText.text = "WS unavailable, using push-to-talk";
            this.inputText.color = "#ff6b6b";
            setTimeout(() => {
              if (this.inputText) {
                this.inputText.text = this.inputPlaceholder;
                this.inputText.color = "white";
              }
            }, 2000);
          }
        },
      },
      { maxReconnectAttempts: 3 },
    );

    this.voiceWSClient.connect();

    // Join room once connected — use character + world as room ID
    const checkAndJoin = () => {
      if (!this.voiceWSClient) return;
      if (this.voiceWSClient.state === 'connected' && this.character && this.world) {
        const roomId = `voice_${this.world.id}_${this.character.id}`;
        this.voiceWSClient.joinRoom(roomId, this.world.id, this.character.id);
      } else if (this.voiceWSClient.state === 'connecting') {
        setTimeout(checkAndJoin, 200);
      }
    };
    checkAndJoin();

    if (this.inputText) {
      this.inputText.text = "🎤 Always-on voice active";
      this.inputText.color = "#50e050";
    }
  }

  /**
   * Deactivate WebSocket voice mode and return to push-to-talk.
   */
  private deactivateWebSocketVoice(): void {
    if (this.voiceWSClient) {
      this.voiceWSClient.destroy();
      this.voiceWSClient = null;
    }
    if (this.inputText) {
      this.inputText.text = this.inputPlaceholder;
      this.inputText.color = "white";
    }
  }

  // -- Hands-free mode (VAD auto-start/stop) --

  private enableHandsFreeMode(): void {
    if (this.isHandsFreeMode) return;

    // Stop any manual recording in progress
    if (this.isRecording) {
      this.stopRecording();
    }

    this.isHandsFreeMode = true;

    if (this.inputText) {
      this.inputText.text = 'Speak or type...';
      this.inputText.color = '#88cc88';
    }

    // Live session mode: stream raw PCM directly to server, which handles STT natively
    if (this.insimulClient?.isLiveSession) {
      this.startLiveAudioCapture();
      return;
    }

    // Non-Live: use HandsFreeController with browser/server STT
    // Use _targetLanguage (set synchronously) or fall back to async world data
    const targetLang = this._targetLanguage || this.worldLanguageContext?.targetLanguage;
    const lang = targetLang
      ? getLanguageBCP47(targetLang)
      : 'en-US';

    this.handsFreeController = new HandsFreeController(
      {
        onTranscript: (transcript) => {
          this.handleVoiceTranscript(transcript);
        },
        onInterimTranscript: (text) => {
          if (this.inputText) {
            this.inputText.text = text;
            this.inputText.color = '#ffd93d';
          }
        },
        onSpeechStart: () => {
          // Update mic status indicator to show active listening
          if (this.micButton) {
            this.micButton.background = 'rgba(255, 50, 50, 0.8)';
          }
          if (this.inputText) {
            this.inputText.text = '🎤 Listening...';
            this.inputText.color = '#ff6b6b';
          }
        },
        onSpeechEnd: () => {
          if (this.micButton) {
            this.micButton.background = 'rgba(60, 60, 60, 0.3)';
          }
          if (this.inputText && !this.isProcessing) {
            this.inputText.text = 'Speak or type...';
            this.inputText.color = '#88cc88';
          }
        },
        onError: (err) => {
          console.error('[BabylonChatPanel] Always-on mic error:', err);
        },
      },
      { lang },
    );

    this.handsFreeController.start();
  }

  private disableHandsFreeMode(): void {
    if (!this.isHandsFreeMode) return;

    this.isHandsFreeMode = false;

    // Stop Live audio capture if active
    this.stopLiveAudioCapture();

    if (this.handsFreeController) {
      this.handsFreeController.stop();
      this.handsFreeController = null;
    }

    if (this.micButton) {
      this.micButton.background = 'rgba(60, 60, 60, 0.3)';
    }
    if (this.inputText) {
      this.inputText.text = this.inputPlaceholder;
      this.inputText.color = 'white';
    }
  }

  // ── Dynamic Difficulty Monitoring ──────────────────────────────────────────

  /**
   * Compute and record turn-level difficulty metrics from the player's message.
   * If the struggle score crosses a threshold, invalidates the system prompt
   * cache so the next NPC response includes scaffolding/stretch directives.
   */
  private recordDifficultyMetrics(playerMessage: string): void {
    // Tokenize player message
    const words = playerMessage.trim().split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;

    // Estimate target-language words: words that match known vocabulary
    let targetLangWords = 0;
    if (this.languageTracker) {
      const vocab = this.languageTracker.getVocabulary();
      const knownWords = new Set(vocab.map(v => v.word.toLowerCase()));
      for (const w of words) {
        if (knownWords.has(w.toLowerCase())) targetLangWords++;
      }
    }

    // Get grammar counts from the tracker
    const grammar = this.languageTracker?.getConversationGrammarCounts() ?? { errors: 0, correct: 0 };

    const metrics: TurnMetrics = {
      grammarErrors: grammar.errors,
      grammarPatternsChecked: grammar.errors + grammar.correct,
      targetLanguageWords: targetLangWords,
      totalPlayerWords: totalWords,
    };

    const adjustment = this._difficultyMonitor.recordTurn(metrics);
    if (adjustment) {
      // Invalidate cached system prompt so next response uses new directive
      this._cachedSystemPrompt = null;

      // Update visual indicator
      this.updateScaffoldingIndicator(adjustment.level);

    }
  }

  /**
   * Show/hide a subtle visual indicator when scaffolding or stretch is active.
   */
  private updateScaffoldingIndicator(level: import('../logic/ConversationDifficultyMonitor').ScaffoldingLevel): void {
    if (!this._scaffoldingIndicator && this.chatContainer) {
      // Create the indicator text block on first use
      const indicator = new TextBlock('scaffolding-indicator', '');
      indicator.fontSize = 9;
      indicator.height = '14px';
      indicator.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      indicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      indicator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      indicator.top = '2px';
      indicator.left = '-40px';
      indicator.isVisible = false;
      this.chatContainer.addControl(indicator);
      this._scaffoldingIndicator = indicator;
    }

    if (!this._scaffoldingIndicator) return;

    switch (level) {
      case 'scaffolded':
        this._scaffoldingIndicator.text = 'Adjusting...';
        this._scaffoldingIndicator.color = '#fbbf24'; // amber
        this._scaffoldingIndicator.isVisible = true;
        break;
      case 'stretch':
        this._scaffoldingIndicator.text = 'Challenge';
        this._scaffoldingIndicator.color = '#34d399'; // green
        this._scaffoldingIndicator.isVisible = true;
        break;
      case 'none':
        this._scaffoldingIndicator.isVisible = false;
        break;
    }
  }

  public dispose() {
    // Final sync + stop periodic sync
    if (this.languageTracker) {
      this.languageTracker.syncToServer().catch(() => {});
      this.languageTracker.stopServerSync();
    }
    this.disableHandsFreeMode();
    this.stopAllAudio();
    // Clean up gRPC streaming resources
    this.streamingAudioPlayer?.dispose();
    this.streamingAudioPlayer = null;
    this.lipSyncController?.dispose();
    this.lipSyncController = null;
    this.insimulClient?.dispose();
    this.insimulClient = null;
    if (this.voiceWSClient) {
      this.voiceWSClient.destroy();
      this.voiceWSClient = null;
    }
    if (this.speechService) {
      this.speechService.dispose();
      this.speechService = null;
    }
    if (this.dialogueActions) {
      this.dialogueActions.hide();
      this.dialogueActions = null;
    }
    if (this.gesturePanel) {
      this.gesturePanel.dispose();
      this.gesturePanel = null;
    }
    if (this.talkingIndicator) {
      this.talkingIndicator.dispose();
      this.talkingIndicator = null;
    }
    if (this._scrollAnimFrame !== null) {
      cancelAnimationFrame(this._scrollAnimFrame);
      this._scrollAnimFrame = null;
    }
    this._messageControls.clear();
    if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
    if (this._copyOverlay) { this._copyOverlay.dispose(); this._copyOverlay = null; }
    if (this.chatContainer) {
      this._advancedTexture.removeControl(this.chatContainer);
    }
    // Remove resize listener
    window.removeEventListener('resize', this.handleResize);
  }
}
