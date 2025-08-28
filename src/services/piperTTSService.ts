import { TtsSession } from '../../EXTERNAL/piper-tts-web/src/inference';
import type { VoiceId, ProgressCallback } from '../../EXTERNAL/piper-tts-web/src/types';

export class PiperTTSService {
  private session: TtsSession | null = null;
  private currentVoiceId: VoiceId = 'en_US-hfc_female-medium';
  private initPromise: Promise<void> | null = null;
  
  async initialize(
    voiceId: VoiceId = 'en_US-hfc_female-medium',
    onProgress?: ProgressCallback
  ): Promise<void> {
    // Return existing init promise if already initializing
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._doInitialize(voiceId, onProgress);
    return this.initPromise;
  }

  private async _doInitialize(voiceId: VoiceId, onProgress?: ProgressCallback): Promise<void> {
    console.log('[PiperTTS] Initializing with voice:', voiceId);
    
    try {
      this.session = await TtsSession.create({
        voiceId,
        progress: onProgress || ((progress) => {
          console.log(`[PiperTTS] Loading: ${Math.round(progress.loaded * 100 / progress.total)}%`);
        }),
        logger: (text) => console.log('[PiperTTS]', text),
        wasmPaths: {
          onnxWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/',
          piperData: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
          piperWasm: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm'
        }
      });
      
      this.currentVoiceId = voiceId;
      console.log('[PiperTTS] Initialized successfully');
    } catch (error) {
      console.error('[PiperTTS] Initialization failed:', error);
      throw error;
    }
  }

  async speak(text: string): Promise<AudioBuffer | null> {
    if (!text.trim()) return null;
    
    // Auto-initialize if needed
    if (!this.session) {
      await this.initialize();
    }
    
    try {
      const startTime = performance.now();
      const wavBlob = await this.session!.predict(text);
      const synthesisTime = performance.now() - startTime;
      
      console.log(`[PiperTTS] Synthesized ${text.length} chars in ${synthesisTime.toFixed(0)}ms`);
      
      // Convert blob to AudioBuffer for better control
      const arrayBuffer = await wavBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      return audioBuffer;
    } catch (error) {
      console.error('[PiperTTS] Synthesis failed:', error);
      return null;
    }
  }

  async speakAndPlay(text: string): Promise<void> {
    const audioBuffer = await this.speak(text);
    if (!audioBuffer) return;
    
    // Play the audio
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    // Return promise that resolves when audio finishes
    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  }

  async speakStream(
    text: string, 
    onSentence?: (sentence: string, audio: AudioBuffer) => void
  ): Promise<void> {
    if (!this.session) {
      await this.initialize();
    }
    
    // Split into sentences for streaming
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      
      const audioBuffer = await this.speak(trimmed);
      if (audioBuffer && onSentence) {
        onSentence(trimmed, audioBuffer);
      }
    }
  }

  isReady(): boolean {
    return this.session !== null;
  }

  getCurrentVoice(): VoiceId {
    return this.currentVoiceId;
  }
}

// Singleton instance for easy access
export const piperTTS = new PiperTTSService();