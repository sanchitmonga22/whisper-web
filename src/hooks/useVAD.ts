import { useState, useCallback, useRef, useEffect } from 'react';
import { MicVAD, type RealTimeVADOptions } from '@ricky0123/vad-web';

interface VADState {
  isInitialized: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  speechSegments: Float32Array[];
  lastSpeechTime: number | null;
}

export interface VADConfig {
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  minSpeechDuration?: number;
  preSpeechPadding?: number;
  model?: 'v5' | 'legacy';
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
}

export function useVAD(config: VADConfig = {}) {
  const [state, setState] = useState<VADState>({
    isInitialized: false,
    isListening: false,
    isSpeaking: false,
    error: null,
    speechSegments: [],
    lastSpeechTime: null,
  });

  const vadRef = useRef<MicVAD | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);

  // Initialize VAD
  const initialize = useCallback(async () => {
    if (state.isInitialized || vadRef.current) {
      console.log('[useVAD] Already initialized');
      return;
    }

    try {
      console.log('[useVAD] Initializing VAD...');

      const vadOptions: Partial<RealTimeVADOptions> = {
        positiveSpeechThreshold: config.positiveSpeechThreshold ?? 0.9,
        negativeSpeechThreshold: config.negativeSpeechThreshold ?? 0.75,
        minSpeechFrames: config.minSpeechDuration ? Math.floor(config.minSpeechDuration / 32) : 3,
        preSpeechPadFrames: config.preSpeechPadding ? Math.floor(config.preSpeechPadding / 32) : 10,
        model: config.model ?? 'v5',

        // Use CDN for model assets
        baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.24/dist/',
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/',

        onSpeechStart: () => {
          console.log('[useVAD] Speech started');
          speechStartTimeRef.current = Date.now();
          setState(prev => ({ ...prev, isSpeaking: true }));
          config.onSpeechStart?.();
        },

        onSpeechEnd: (audio: Float32Array) => {
          const duration = speechStartTimeRef.current 
            ? Date.now() - speechStartTimeRef.current 
            : 0;
          
          console.log('[useVAD] Speech ended', {
            audioLength: audio.length,
            duration: `${duration}ms`,
            sampleRate: 16000
          });
          
          setState(prev => ({
            ...prev,
            isSpeaking: false,
            speechSegments: [...prev.speechSegments, audio],
            lastSpeechTime: Date.now(),
          }));
          
          config.onSpeechEnd?.(audio);
          speechStartTimeRef.current = null;
        },

        onVADMisfire: () => {
          console.log('[useVAD] VAD misfire (too short speech)');
          config.onVADMisfire?.();
        },
      };

      // Create MicVAD instance
      const vad = await MicVAD.new(vadOptions);
      vadRef.current = vad;

      setState(prev => ({
        ...prev,
        isInitialized: true,
        error: null,
      }));

      console.log('[useVAD] VAD initialized successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useVAD] Initialization error:', errorMessage);
      setState(prev => ({
        ...prev,
        error: `Failed to initialize VAD: ${errorMessage}`,
      }));
    }
  }, [config, state.isInitialized]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!state.isInitialized) {
      console.log('[useVAD] Not initialized, initializing first...');
      await initialize();
    }

    if (state.isListening || !vadRef.current) {
      console.log('[useVAD] Already listening or VAD not available');
      return;
    }

    try {
      console.log('[useVAD] Starting VAD listening...');
      vadRef.current.start();
      
      setState(prev => ({
        ...prev,
        isListening: true,
        error: null,
        speechSegments: [], // Clear previous segments
      }));

      console.log('[useVAD] VAD listening started');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useVAD] Start error:', errorMessage);
      setState(prev => ({
        ...prev,
        error: `Failed to start VAD: ${errorMessage}`,
      }));
    }
  }, [state.isInitialized, state.isListening, initialize]);

  // Pause VAD temporarily (for echo prevention)
  const pauseVAD = useCallback(() => {
    if (!vadRef.current || !state.isListening) {
      console.log('[useVAD] Not listening or VAD not available for pause');
      return;
    }

    try {
      console.log('[useVAD] Pausing VAD for echo prevention...');
      vadRef.current.pause();
      
      setState(prev => ({
        ...prev,
        isSpeaking: false, // Reset speaking state
      }));

      console.log('[useVAD] VAD paused');
    } catch (err) {
      console.error('[useVAD] Pause error:', err);
    }
  }, [state.isListening]);

  // Resume VAD after pause
  const resumeVAD = useCallback(() => {
    if (!vadRef.current || !state.isListening) {
      console.log('[useVAD] Cannot resume - not listening or VAD not available');
      return;
    }

    try {
      console.log('[useVAD] Resuming VAD after echo prevention...');
      vadRef.current.start();
      console.log('[useVAD] VAD resumed');
    } catch (err) {
      console.error('[useVAD] Resume error:', err);
    }
  }, [state.isListening]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (!vadRef.current || !state.isListening) {
      console.log('[useVAD] Not listening or VAD not available');
      return;
    }

    try {
      console.log('[useVAD] Stopping VAD...');
      vadRef.current.pause();
      
      setState(prev => ({
        ...prev,
        isListening: false,
        isSpeaking: false,
      }));

      console.log('[useVAD] VAD stopped');
    } catch (err) {
      console.error('[useVAD] Stop error:', err);
    }
  }, [state.isListening]);

  // Pause VAD (keeps listening but doesn't process)
  const pause = useCallback(() => {
    if (!vadRef.current) return;
    
    console.log('[useVAD] Pausing VAD');
    vadRef.current.pause();
  }, []);

  // Resume VAD after pause
  const resume = useCallback(() => {
    if (!vadRef.current || !state.isListening) return;
    
    console.log('[useVAD] Resuming VAD');
    vadRef.current.start();
  }, [state.isListening]);

  // Clear speech segments
  const clearSpeechSegments = useCallback(() => {
    setState(prev => ({ ...prev, speechSegments: [] }));
  }, []);

  // Get combined audio from all segments
  const getCombinedAudio = useCallback((): Float32Array | null => {
    if (state.speechSegments.length === 0) return null;
    
    const totalLength = state.speechSegments.reduce((acc, segment) => acc + segment.length, 0);
    const combined = new Float32Array(totalLength);
    
    let offset = 0;
    for (const segment of state.speechSegments) {
      combined.set(segment, offset);
      offset += segment.length;
    }
    
    return combined;
  }, [state.speechSegments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadRef.current) {
        console.log('[useVAD] Cleaning up VAD');
        try {
          vadRef.current.destroy();
        } catch (err) {
          console.error('[useVAD] Cleanup error:', err);
        }
        vadRef.current = null;
      }
    };
  }, []);

  return {
    // State
    isInitialized: state.isInitialized,
    isListening: state.isListening,
    isSpeaking: state.isSpeaking,
    error: state.error,
    speechSegments: state.speechSegments,
    lastSpeechTime: state.lastSpeechTime,

    // Actions
    initialize,
    startListening,
    stopListening,
    pauseVAD,
    resumeVAD,
    pause,
    resume,
    clearSpeechSegments,
    getCombinedAudio,
  };
}