/**
 * Environmental Audio Manager
 *
 * Plays ambient audio snippets in the target language (market chatter,
 * announcements, etc.) with frequency scaled to player proficiency.
 * Subtitles are toggleable.
 */

import { Scene, Sound, Vector3 } from '@babylonjs/core';

export interface AudioSnippet {
  id: string;
  text: string;              // Target-language text
  translation: string;       // English translation
  category: 'chatter' | 'announcement' | 'radio' | 'vendor' | 'ambient';
  minFluency: number;        // Minimum fluency to hear (0-100)
}

const AMBIENT_SNIPPETS: AudioSnippet[] = [
  // Beginner (0+)
  { id: 'greet1', text: 'Bonjour!', translation: 'Hello!', category: 'chatter', minFluency: 0 },
  { id: 'greet2', text: 'Bonne journée!', translation: 'Good day!', category: 'chatter', minFluency: 0 },
  { id: 'vendor1', text: 'Venez voir!', translation: 'Come see!', category: 'vendor', minFluency: 0 },
  // Intermediate (30+)
  { id: 'market1', text: 'Les fruits sont frais aujourd\'hui!', translation: 'The fruits are fresh today!', category: 'vendor', minFluency: 30 },
  { id: 'chat1', text: 'Comment allez-vous?', translation: 'How are you?', category: 'chatter', minFluency: 30 },
  { id: 'announce1', text: 'Le marché ferme bientôt.', translation: 'The market closes soon.', category: 'announcement', minFluency: 30 },
  // Advanced (60+)
  { id: 'radio1', text: 'Aujourd\'hui nous célébrons la fête du village.', translation: 'Today we celebrate the village festival.', category: 'radio', minFluency: 60 },
  { id: 'chat2', text: 'Avez-vous entendu les nouvelles?', translation: 'Have you heard the news?', category: 'chatter', minFluency: 60 },
  { id: 'vendor2', text: 'Goûtez notre spécialité de la maison!', translation: 'Try our house specialty!', category: 'vendor', minFluency: 60 },
];

export class EnvironmentalAudioManager {
  private scene: Scene;
  private playerFluency: number = 0;
  private subtitlesEnabled: boolean = true;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastSnippetTime: number = 0;
  private activeSnippets: Set<string> = new Set();

  // Callbacks
  private onSubtitle: ((text: string, translation: string, duration: number) => void) | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public start(): void {
    if (this.intervalId) return;

    // Check every 15-30 seconds whether to play a snippet
    this.intervalId = setInterval(() => {
      this.maybePlaySnippet();
    }, 15000 + Math.random() * 15000);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public setPlayerFluency(fluency: number): void {
    this.playerFluency = fluency;
  }

  public setSubtitlesEnabled(enabled: boolean): void {
    this.subtitlesEnabled = enabled;
  }

  public toggleSubtitles(): boolean {
    this.subtitlesEnabled = !this.subtitlesEnabled;
    return this.subtitlesEnabled;
  }

  private maybePlaySnippet(): void {
    const now = Date.now();

    // Cooldown: at least 20 seconds between snippets
    if (now - this.lastSnippetTime < 20000) return;

    // Filter by fluency
    const available = AMBIENT_SNIPPETS.filter(s => s.minFluency <= this.playerFluency);
    if (available.length === 0) return;

    // Probability scales with fluency (10% at 0, 40% at 100)
    const probability = 0.1 + (this.playerFluency / 100) * 0.3;
    if (Math.random() > probability) return;

    // Pick random snippet (avoid repeats)
    const candidates = available.filter(s => !this.activeSnippets.has(s.id));
    if (candidates.length === 0) {
      this.activeSnippets.clear(); // Reset if all used
      return;
    }

    const snippet = candidates[Math.floor(Math.random() * candidates.length)];
    this.activeSnippets.add(snippet.id);
    this.lastSnippetTime = now;

    // Show subtitle
    const duration = 3000 + snippet.text.length * 50;
    if (this.subtitlesEnabled) {
      const displayText = this.playerFluency >= 60
        ? snippet.text
        : `${snippet.text} (${snippet.translation})`;
      this.onSubtitle?.(displayText, snippet.translation, duration);
    }
  }

  /**
   * Get snippets appropriate for current fluency (for external use)
   */
  public getAvailableSnippets(): AudioSnippet[] {
    return AMBIENT_SNIPPETS.filter(s => s.minFluency <= this.playerFluency);
  }

  public setOnSubtitle(cb: (text: string, translation: string, duration: number) => void): void {
    this.onSubtitle = cb;
  }

  public dispose(): void {
    this.stop();
    this.onSubtitle = null;
  }
}
