/**
 * TTSEngine - Text-to-Speech Engine
 * 
 * Handles speech synthesis for bot responses
 * Uses expo-speech or platform-native TTS
 * 
 * Usage:
 * const tts = new TTSEngine();
 * await tts.speak('Hello world');
 * await tts.stop();
 * tts.setLanguage('tr-TR');
 */

import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

class TTSEngine {
  constructor() {
    this.isAvailable = false;
    this.isSpeaking = false;
    this.isWeb = Platform.OS === 'web';
    this.language = 'tr-TR'; // Turkish by default
    this.rate = 0.9;
    this.pitch = 1.0;
    this.volume = 1.0;
    
    this.initialize();
  }

  /**
   * Initialize TTS engine
   * Check if Speech API is available
   */
  async initialize() {
    try {
      if (this.isWeb && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.isAvailable = true;
        console.log('[TTSEngine] Web SpeechSynthesis available');
        return;
      }

      // expo-speech does not expose isAvailableAsync in SDK 54.
      // If the module exposes the core speak/stop functions, treat TTS as usable.
      const available = typeof Speech.speak === 'function' && typeof Speech.stop === 'function';
      this.isAvailable = available;
      console.log(`[TTSEngine] Available: ${available}`);
    } catch (error) {
      console.error('[TTSEngine] Initialization error:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Speak text aloud
   * 
   * Params:
   * - text: String to speak
   * - options (optional): {
   *     language: string,
   *     rate: number (0.5-2.0),
   *     pitch: number (0.5-2.0),
   *     volume: number (0-1)
   *   }
   * 
   * Returns: Promise
   */
  async speak(text, options = {}) {
    if (!text || !this.isAvailable) {
      return;
    }

    try {
      if (this.isWeb && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        await this.speakOnWeb(text, options);
        return;
      }

      // Stop any ongoing speech
      if (this.isSpeaking) {
        await this.stop();
      }

      this.isSpeaking = true;

      const speechOptions = {
        language: options.language || this.language,
        rate: options.rate !== undefined ? options.rate : this.rate,
        pitch: options.pitch !== undefined ? options.pitch : this.pitch,
        volume: options.volume !== undefined ? options.volume : this.volume,
        onDone: () => {
          this.isSpeaking = false;
          console.log('[TTSEngine] Speech finished');
        },
        onError: (error) => {
          this.isSpeaking = false;
          console.error('[TTSEngine] Speech error:', error);
        },
      };

      console.log(`[TTSEngine] Speaking: "${text.substring(0, 50)}..."`);
      await Speech.speak(text, speechOptions);
    } catch (error) {
      console.error('[TTSEngine] Error speaking:', error);
      this.isSpeaking = false;
      throw error;
    }
  }

  /**
   * Web-specific speech synthesis path.
   */
  async speakOnWeb(text, options = {}) {
    const synth = window.speechSynthesis;
    if (!synth) {
      return;
    }

    if (this.isSpeaking) {
      synth.cancel();
      this.isSpeaking = false;
    }

    this.isSpeaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.language || this.language;
    utterance.rate = options.rate !== undefined ? options.rate : this.rate;
    utterance.pitch = options.pitch !== undefined ? options.pitch : this.pitch;
    utterance.volume = options.volume !== undefined ? options.volume : this.volume;

    const voices = synth.getVoices ? synth.getVoices() : [];
    if (voices.length > 0) {
      const preferredVoice =
        voices.find((voice) => voice.lang === utterance.lang) ||
        voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith('tr')) ||
        voices[0];
      utterance.voice = preferredVoice;
    }

    await new Promise((resolve, reject) => {
      utterance.onend = () => {
        this.isSpeaking = false;
        resolve();
      };
      utterance.onerror = (event) => {
        this.isSpeaking = false;
        reject(event?.error || new Error('Speech synthesis failed'));
      };
      synth.speak(utterance);
    });
  }

  /**
   * Stop current speech
   */
  async stop() {
    try {
      if (this.isWeb && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        this.isSpeaking = false;
        console.log('[TTSEngine] Web speech stopped');
        return;
      }

      if (this.isSpeaking) {
        await Speech.stop();
        this.isSpeaking = false;
        console.log('[TTSEngine] Speech stopped');
      }
    } catch (error) {
      console.error('[TTSEngine] Error stopping speech:', error);
    }
  }

  /**
   * Pause current speech (if supported)
   */
  async pause() {
    try {
      // Expo Speech API doesn't support pause, but we can stop and track position
      await this.stop();
      console.log('[TTSEngine] Speech paused (stopped)');
    } catch (error) {
      console.error('[TTSEngine] Error pausing:', error);
    }
  }

  /**
   * Check if currently speaking
   */
  isSpeakingNow() {
    return this.isSpeaking;
  }

  /**
   * Set language for speech
   * 
   * Common language codes:
   * - tr-TR: Turkish
   * - en-US: English (US)
   * - en-GB: English (UK)
   * - es-ES: Spanish
   * - fr-FR: French
   * - de-DE: German
   * - ja-JP: Japanese
   */
  setLanguage(language) {
    this.language = language;
    console.log(`[TTSEngine] Language set to: ${language}`);
  }

  /**
   * Set speech rate
   * 0.5 = half speed, 1.0 = normal, 2.0 = double speed
   */
  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
    console.log(`[TTSEngine] Rate set to: ${this.rate}`);
  }

  /**
   * Set speech pitch
   * 0.5 = lower, 1.0 = normal, 2.0 = higher
   */
  setPitch(pitch) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
    console.log(`[TTSEngine] Pitch set to: ${this.pitch}`);
  }

  /**
   * Set volume
   * 0 = silent, 1.0 = maximum
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1.0, volume));
    console.log(`[TTSEngine] Volume set to: ${this.volume}`);
  }

  /**
   * Get current TTS settings
   */
  getSettings() {
    return {
      language: this.language,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
      isAvailable: this.isAvailable,
      isSpeaking: this.isSpeaking,
    };
  }

  /**
   * Clean up TTS resources
   */
  cleanup() {
    try {
      if (this.isWeb && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        this.isSpeaking = false;
        console.log('[TTSEngine] Web cleanup completed');
        return;
      }

      if (this.isSpeaking) {
        Speech.stop();
      }
      console.log('[TTSEngine] Cleanup completed');
    } catch (error) {
      console.error('[TTSEngine] Error during cleanup:', error);
    }
  }
}

/**
 * TTSClient - Wrapper for TTSEngine with state management
 * Provides consistent interface for speech control
 */
class TTSClient {
  constructor() {
    this.engine = new TTSEngine();
    this.isEnabled = true;
  }

  /**
   * Enable/disable TTS
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`[TTSClient] TTS ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Speak if enabled
   */
  async speak(text, options = {}) {
    if (!this.isEnabled) {
      return;
    }
    return this.engine.speak(text, options);
  }

  /**
   * Stop speaking
   */
  async stop() {
    return this.engine.stop();
  }

  /**
   * Forward all method calls to engine
   */
  setLanguage(lang) {
    return this.engine.setLanguage(lang);
  }

  setRate(rate) {
    return this.engine.setRate(rate);
  }

  setPitch(pitch) {
    return this.engine.setPitch(pitch);
  }

  setVolume(volume) {
    return this.engine.setVolume(volume);
  }

  getSettings() {
    return this.engine.getSettings();
  }

  cleanup() {
    return this.engine.cleanup();
  }
}

export default TTSEngine;
export { TTSClient };
