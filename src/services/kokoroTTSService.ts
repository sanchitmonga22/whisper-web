import { KokoroTTS } from 'kokoro-js';

export type KokoroVoice = 
  | 'af_sky' 
  | 'af_heart' 
  | 'am_guy'
  | 'bf_emma'
  | 'bf_isabella' 
  | 'bm_george'
  | 'bm_lewis';

export interface KokoroConfig {
  voice?: KokoroVoice;
  model?: string;
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
  speed?: number;
}

export class KokoroTTSService {
  private tts: KokoroTTS | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private currentVoice: KokoroVoice = 'af_sky';
  private audioContext: AudioContext | null = null;

  constructor() {
    // Initialize audio context
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async initialize(config: KokoroConfig = {}): Promise<void> {
    // Return existing init promise if already initializing
    if (this.initPromise) return this.initPromise;
    
    if (this.tts && !config.dtype) {
      console.log('[KokoroTTS] Already initialized');
      return;
    }

    this.initPromise = this._doInitialize(config);
    return this.initPromise;
  }

  private async _doInitialize(config: KokoroConfig): Promise<void> {
    try {
      this.isInitializing = true;
      console.log('[KokoroTTS] Initializing...', config);

      // Initialize Kokoro TTS with ONNX model
      // Use the correct model ID from the kokoro-js documentation
      this.tts = await KokoroTTS.from_pretrained(
        config.model || 'onnx-community/Kokoro-82M-v1.0-ONNX',
        { 
          dtype: config.dtype || 'fp32', // Use fp32 for faster generation (fp16 doesn't work well on all browsers)
          device: 'wasm', // Explicitly use wasm for better compatibility
          progress_callback: (progress: any) => {
            console.log('[KokoroTTS] Loading:', progress);
          }
        }
      );

      this.currentVoice = config.voice || 'af_sky';
      console.log('[KokoroTTS] Initialized successfully');
      
      // list_voices might be a method or property
      try {
        const voices = typeof this.tts.list_voices === 'function' 
          ? this.tts.list_voices() 
          : this.tts.list_voices;
        console.log('[KokoroTTS] Available voices:', voices);
        
        // Also log the voices in a table format if available
        if (voices && typeof voices === 'object') {
          console.table(voices);
        }
      } catch (e) {
        console.log('[KokoroTTS] Could not get voices list:', e);
      }

    } catch (error) {
      console.error('[KokoroTTS] Initialization failed:', error);
      throw error;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  async speak(text: string, config: KokoroConfig = {}): Promise<AudioBuffer | null> {
    if (!text.trim()) return null;

    // Auto-initialize if needed
    if (!this.tts) {
      await this.initialize(config);
    }

    // Re-create audio context if it was disposed
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[KokoroTTS] Re-created AudioContext');
    }

    if (!this.tts || !this.audioContext) {
      console.error('[KokoroTTS] TTS or AudioContext not initialized');
      return null;
    }

    try {
      const startTime = performance.now();
      const voice = config.voice || this.currentVoice;
      
      console.log(`[KokoroTTS] Generating speech for: "${text.substring(0, 50)}..." with voice ${voice}`);
      
      // Generate audio with Kokoro
      const audio = await this.tts.generate(text, {
        voice: voice as any,
        speed: config.speed || 1.0,
      });

      console.log('[KokoroTTS] Audio generated:', audio);
      console.log('[KokoroTTS] Audio type:', typeof audio);
      console.log('[KokoroTTS] Audio properties:', Object.keys(audio || {}));
      
      // Check if audio has specific methods
      if (audio) {
        console.log('[KokoroTTS] Has save method:', typeof audio.save === 'function');
        console.log('[KokoroTTS] Has wav property:', 'wav' in audio);
        console.log('[KokoroTTS] Has audio property:', 'audio' in audio);
        console.log('[KokoroTTS] Has data property:', 'data' in audio);
        console.log('[KokoroTTS] Has blob property:', 'blob' in audio);
      }
      
      console.log('[KokoroTTS] Converting to AudioBuffer...');

      // Convert to AudioBuffer for web playback
      const audioBuffer = await this.convertToAudioBuffer(audio);
      
      const synthesisTime = performance.now() - startTime;
      console.log(`[KokoroTTS] Generated ${text.length} chars in ${synthesisTime.toFixed(0)}ms, AudioBuffer: ${audioBuffer ? 'ready' : 'null'}`);
      
      return audioBuffer;
    } catch (error) {
      console.error('[KokoroTTS] Speech generation failed:', error);
      return null;
    }
  }

  async speakStream(
    text: string, 
    onChunk: (chunk: AudioBuffer) => void,
    config: KokoroConfig = {}
  ): Promise<void> {
    if (!text.trim()) return;

    // Auto-initialize if needed
    if (!this.tts) {
      await this.initialize(config);
    }

    // Re-create audio context if it was disposed
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[KokoroTTS] Re-created AudioContext');
    }

    if (!this.tts) {
      console.error('[KokoroTTS] TTS not initialized');
      return;
    }

    try {
      const voice = config.voice || this.currentVoice;
      console.log(`[KokoroTTS] Starting stream generation for voice ${voice}`);
      
      // Use streaming API if available
      const stream = this.tts.stream(text, {
        voice: voice as any,
        speed: config.speed || 1.0,
      });

      let chunkIndex = 0;
      for await (const { audio } of stream) {
        console.log(`[KokoroTTS] Generated chunk ${++chunkIndex}`);
        const audioBuffer = await this.convertToAudioBuffer(audio);
        if (audioBuffer) {
          onChunk(audioBuffer);
        }
      }
    } catch (error) {
      console.error('[KokoroTTS] Stream generation failed:', error);
    }
  }

  private async convertToAudioBuffer(kokoroAudio: any): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      console.error('[KokoroTTS] No AudioContext for conversion');
      return null;
    }

    try {
      console.log('[KokoroTTS] Converting Kokoro audio to AudioBuffer...');
      
      // According to kokoro-js, the audio object has a wav property with the actual WAV data
      // Check if we have wav data directly
      if (kokoroAudio.wav) {
        console.log('[KokoroTTS] Found wav data, converting to AudioBuffer...');
        
        // The wav property should contain the WAV file as ArrayBuffer or Uint8Array
        let arrayBuffer: ArrayBuffer;
        
        if (kokoroAudio.wav instanceof ArrayBuffer) {
          arrayBuffer = kokoroAudio.wav;
        } else if (kokoroAudio.wav instanceof Uint8Array) {
          arrayBuffer = kokoroAudio.wav.buffer.slice(
            kokoroAudio.wav.byteOffset,
            kokoroAudio.wav.byteOffset + kokoroAudio.wav.byteLength
          );
        } else {
          // Try to convert it to ArrayBuffer
          const uint8Array = new Uint8Array(kokoroAudio.wav);
          arrayBuffer = uint8Array.buffer.slice(
            uint8Array.byteOffset,
            uint8Array.byteOffset + uint8Array.byteLength
          );
        }
        
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        console.log('[KokoroTTS] AudioBuffer created:', audioBuffer.duration, 'seconds');
        return audioBuffer;
      }
      
      // Alternative: Check for audio data and sampling_rate properties (correct property name)
      if (kokoroAudio.audio && kokoroAudio.sampling_rate) {
        console.log('[KokoroTTS] Found audio data with sampling rate, creating AudioBuffer...');
        const audioData = kokoroAudio.audio;
        const sampleRate = kokoroAudio.sampling_rate;
        
        // Create audio buffer from raw PCM data
        const audioBuffer = this.audioContext.createBuffer(
          1, // mono
          audioData.length,
          sampleRate
        );
        
        // Copy the audio data to the buffer
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < audioData.length; i++) {
          channelData[i] = audioData[i];
        }
        
        console.log('[KokoroTTS] AudioBuffer created from raw data:', audioBuffer.duration, 'seconds');
        return audioBuffer;
      }
      
      // Log the actual structure of the audio object for debugging
      console.log('[KokoroTTS] Audio object structure:', Object.keys(kokoroAudio));
      console.error('[KokoroTTS] Could not find compatible audio data format');
      return null;
      
    } catch (error) {
      console.error('[KokoroTTS] Audio conversion failed:', error);
      console.log('[KokoroTTS] Audio object:', kokoroAudio);
      return null;
    }
  }

  async playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    if (!this.audioContext || !audioBuffer) return;

    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext!.destination);
      source.onended = () => resolve();
      source.start(0);
    });
  }

  getAvailableVoices(): string[] {
    if (!this.tts) return [];
    try {
      const voices = typeof this.tts.list_voices === 'function' 
        ? this.tts.list_voices() 
        : this.tts.list_voices;
      
      // If voices is an object with voice data, extract the keys
      if (voices && typeof voices === 'object' && !Array.isArray(voices)) {
        return Object.keys(voices);
      }
      
      // If it's already an array, return it
      if (Array.isArray(voices)) {
        return voices;
      }
      
      // Fallback to known voices
      return ['af_sky', 'af_heart', 'af_bella', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis', 'am_michael', 'am_echo'];
    } catch {
      return ['af_sky', 'af_heart', 'af_bella', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis', 'am_michael', 'am_echo'];
    }
  }

  isReady(): boolean {
    return this.tts !== null && !this.isInitializing;
  }

  getCurrentVoice(): KokoroVoice {
    return this.currentVoice;
  }

  setVoice(voice: KokoroVoice): void {
    this.currentVoice = voice;
  }

  dispose(): void {
    // Clean up resources
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.tts = null;
  }
}

// Singleton instance for easy access
export const kokoroTTS = new KokoroTTSService();