import { useState, useCallback, useRef, useEffect } from 'react';
import { KokoroTTSService, type KokoroVoice, type KokoroConfig } from '../services/kokoroTTSService';

export interface KokoroTTSState {
  isInitialized: boolean;
  isInitializing: boolean;
  isSpeaking: boolean;
  isGenerating: boolean;
  currentVoice: KokoroVoice;
  availableVoices: string[];
  error: string | null;
  performanceMetrics: {
    firstSpeechTime?: number;
    lastGenerationTime?: number;
    lastSpeechStartTime?: number;
    lastSpeechEndTime?: number;
  };
}

export interface UseKokoroTTSConfig extends KokoroConfig {
  autoInitialize?: boolean;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: string) => void;
}

export function useKokoroTTS(config: UseKokoroTTSConfig = {}) {
  const [state, setState] = useState<KokoroTTSState>({
    isInitialized: false,
    isInitializing: false,
    isSpeaking: false,
    isGenerating: false,
    currentVoice: config.voice || 'af_sky',
    availableVoices: [],
    error: null,
    performanceMetrics: {},
  });

  const serviceRef = useRef<KokoroTTSService | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const streamingStateRef = useRef({
    currentStreamId: '',
    isStreaming: false,
  });

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  // Initialize Kokoro service
  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isInitializing) {
      console.log('[useKokoroTTS] Already initialized or initializing');
      return;
    }

    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));
      
      if (!serviceRef.current) {
        serviceRef.current = new KokoroTTSService();
      }

      await serviceRef.current.initialize(config);
      
      const availableVoices = serviceRef.current.getAvailableVoices();
      
      setState(prev => ({ 
        ...prev, 
        isInitialized: true,
        isInitializing: false,
        availableVoices,
      }));
      
      console.log('[useKokoroTTS] Initialized successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[useKokoroTTS] Initialization failed:', errorMsg);
      setState(prev => ({ 
        ...prev, 
        isInitializing: false,
        error: errorMsg 
      }));
      config.onError?.(errorMsg);
    }
  }, [config, state.isInitialized, state.isInitializing]);

  // Auto-initialize if configured
  useEffect(() => {
    if (config.autoInitialize && !state.isInitialized && !state.isInitializing) {
      initialize();
    }
  }, [config.autoInitialize, state.isInitialized, state.isInitializing, initialize]);

  // Play audio buffer
  const playAudioBuffer = useCallback(async (audioBuffer: AudioBuffer): Promise<void> => {
    if (!audioContextRef.current) return;

    return new Promise((resolve) => {
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current!.destination);
      
      currentSourceRef.current = source;
      
      source.onended = () => {
        currentSourceRef.current = null;
        resolve();
      };
      
      source.start(0);
    });
  }, []);

  // Process audio queue
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
    setState(prev => ({ ...prev, isSpeaking: true }));
    console.log('[useKokoroTTS] Starting speech playback');
    config.onSpeechStart?.();

    const startTime = performance.now();
    let firstSpeechTime = state.performanceMetrics.firstSpeechTime;

    while (audioQueueRef.current.length > 0) {
      const audioBuffer = audioQueueRef.current.shift();
      if (audioBuffer) {
        if (!firstSpeechTime) {
          firstSpeechTime = performance.now() - startTime;
          setState(prev => ({
            ...prev,
            performanceMetrics: {
              ...prev.performanceMetrics,
              firstSpeechTime,
              lastSpeechStartTime: performance.now(),
            }
          }));
        }
        await playAudioBuffer(audioBuffer);
      }
    }

    setState(prev => ({
      ...prev,
      isSpeaking: false,
      performanceMetrics: {
        ...prev.performanceMetrics,
        lastSpeechEndTime: performance.now(),
      }
    }));
    
    isPlayingRef.current = false;
    console.log('[useKokoroTTS] Speech playback finished');
    config.onSpeechEnd?.();
  }, [playAudioBuffer, config, state.performanceMetrics.firstSpeechTime]);

  // Speak text
  const speak = useCallback(async (text: string, interrupt: boolean = false): Promise<void> => {
    if (!text.trim()) return;

    // Initialize if needed
    if (!state.isInitialized) {
      await initialize();
    }

    if (!serviceRef.current) {
      console.error('[useKokoroTTS] Service not initialized');
      return;
    }

    if (interrupt) {
      stop();
    }

    try {
      setState(prev => ({ ...prev, isGenerating: true, error: null }));
      
      const generationStart = performance.now();
      const audioBuffer = await serviceRef.current.speak(text, {
        voice: state.currentVoice,
        speed: config.speed,
      });
      
      const generationTime = performance.now() - generationStart;
      
      setState(prev => ({
        ...prev,
        isGenerating: false,
        performanceMetrics: {
          ...prev.performanceMetrics,
          lastGenerationTime: generationTime,
        }
      }));

      if (audioBuffer) {
        console.log('[useKokoroTTS] AudioBuffer received, queueing for playback');
        audioQueueRef.current.push(audioBuffer);
        // Wait for audio to finish playing
        await processAudioQueue();
      } else {
        console.error('[useKokoroTTS] No AudioBuffer returned from speak');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[useKokoroTTS] Speak failed:', errorMsg);
      setState(prev => ({ 
        ...prev, 
        isGenerating: false,
        error: errorMsg 
      }));
      config.onError?.(errorMsg);
    }
  }, [state.isInitialized, state.currentVoice, config, initialize, processAudioQueue]);

  // Stream speak text
  const speakStream = useCallback(async (
    streamId: string, 
    textChunk: string, 
    isComplete: boolean = false
  ): Promise<void> => {
    if (!textChunk.trim() && !isComplete) return;

    // Reset for new stream
    if (streamingStateRef.current.currentStreamId !== streamId) {
      stop();
      streamingStateRef.current = {
        currentStreamId: streamId,
        isStreaming: true,
      };
    }

    // Initialize if needed
    if (!state.isInitialized) {
      await initialize();
    }

    if (!serviceRef.current) {
      console.error('[useKokoroTTS] Service not initialized');
      return;
    }

    // For streaming, we'll speak complete sentences
    const sentenceEndPattern = /^(.*?[.!?])\s*/;
    const match = textChunk.match(sentenceEndPattern);

    if (match || isComplete) {
      const textToSpeak = match ? match[1].trim() : textChunk.trim();
      if (textToSpeak) {
        await speak(textToSpeak, false);
      }
    }
  }, [state.isInitialized, initialize, speak]);

  // Stop speaking
  const stop = useCallback(() => {
    // Stop current audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceRef.current = null;
    }

    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Reset streaming state
    streamingStateRef.current = {
      currentStreamId: '',
      isStreaming: false,
    };

    setState(prev => ({
      ...prev,
      isSpeaking: false,
      isGenerating: false,
    }));

    console.log('[useKokoroTTS] Stopped audio playback');
  }, []);

  // Set voice
  const setVoice = useCallback((voice: KokoroVoice) => {
    setState(prev => ({ ...prev, currentVoice: voice }));
    serviceRef.current?.setVoice(voice);
    console.log('[useKokoroTTS] Voice changed to:', voice);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stop();
      serviceRef.current?.dispose();
    };
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    initialize,
    speak,
    speakStream,
    stop,
    setVoice,
    
    // Utils
    isReady: state.isInitialized && !state.isInitializing,
  };
}