import { useState, useCallback, useRef, useEffect } from 'react';

export interface TTSConfig {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

export interface TTSState {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  availableVoices: SpeechSynthesisVoice[];
  currentVoice: SpeechSynthesisVoice | null;
  error: string | null;
  queueLength: number;
  performanceMetrics?: {
    firstSpeechTime: number;
    lastSpeechStartTime: number;
    lastSpeechEndTime: number;
  };
}

export function useTTS(config: TTSConfig = {}) {
  const [state, setState] = useState<TTSState>({
    isSpeaking: false,
    isPaused: false,
    isSupported: typeof speechSynthesis !== 'undefined',
    availableVoices: [],
    currentVoice: null,
    error: null,
    queueLength: 0,
  });

  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const configRef = useRef<TTSConfig>(config);
  const ttsTimingRef = useRef({
    streamStartTime: 0,
    firstSpeechTime: 0,
    lastSpeechStartTime: 0,
    lastSpeechEndTime: 0,
  });

  // Update config ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Initialize voices
  const loadVoices = useCallback(() => {
    if (!speechSynthesis) return;

    const voices = speechSynthesis.getVoices();
    let selectedVoice = null;

    // Try to find the requested voice or a good default
    if (config.voice) {
      selectedVoice = voices.find(voice => 
        voice.name === config.voice || 
        voice.name.toLowerCase().includes(config.voice!.toLowerCase())
      );
    }

    // Fallback to default voice for the language
    if (!selectedVoice && config.lang) {
      selectedVoice = voices.find(voice => voice.lang.startsWith(config.lang!));
    }

    // Last resort: any English voice or first available
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => voice.lang.startsWith('en')) || voices[0];
    }

    setState(prev => ({
      ...prev,
      availableVoices: voices,
      currentVoice: selectedVoice,
    }));

    console.log('[TTS] Voices loaded:', {
      total: voices.length,
      selected: selectedVoice?.name,
      lang: selectedVoice?.lang
    });
  }, [config.voice, config.lang]);

  // Load voices on mount and when they change
  useEffect(() => {
    if (!speechSynthesis) return;

    loadVoices();
    
    // Voices might not be loaded immediately
    const handleVoicesChanged = () => loadVoices();
    speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    };
  }, [loadVoices]);

  // Create utterance with current config
  const createUtterance = useCallback((text: string): SpeechSynthesisUtterance | null => {
    if (!speechSynthesis || !state.currentVoice) {
      console.warn('[TTS] Speech synthesis not available or no voice selected');
      return null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const currentConfig = configRef.current;

    // Apply configuration
    utterance.voice = state.currentVoice;
    utterance.rate = currentConfig.rate ?? 1.0;
    utterance.pitch = currentConfig.pitch ?? 1.0;
    utterance.volume = currentConfig.volume ?? 1.0;
    utterance.lang = currentConfig.lang ?? state.currentVoice.lang;

    console.log('[TTS] Created utterance:', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      voice: utterance.voice?.name,
      rate: utterance.rate,
      pitch: utterance.pitch,
      volume: utterance.volume,
    });

    return utterance;
  }, [state.currentVoice]);

  // Speak text immediately
  const speak = useCallback((text: string, interrupt: boolean = false) => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Speech synthesis not supported' }));
      return;
    }

    if (interrupt) {
      stop();
    }

    const utterance = createUtterance(text);
    if (!utterance) {
      setState(prev => ({ ...prev, error: 'Failed to create speech utterance' }));
      return;
    }

    // Set up event handlers
    utterance.onstart = () => {
      const now = Date.now();
      ttsTimingRef.current.lastSpeechStartTime = now;
      
      // Track first speech time if this is the first utterance
      if (ttsTimingRef.current.firstSpeechTime === 0 && ttsTimingRef.current.streamStartTime > 0) {
        ttsTimingRef.current.firstSpeechTime = now - ttsTimingRef.current.streamStartTime;
        console.log('[TTS] First speech started:', {
          firstSpeechTime: `${ttsTimingRef.current.firstSpeechTime}ms`
        });
      }
      
      console.log('[TTS] Speaking started');
      currentUtteranceRef.current = utterance;
      setState(prev => ({ 
        ...prev, 
        isSpeaking: true, 
        isPaused: false, 
        error: null,
        performanceMetrics: {
          firstSpeechTime: ttsTimingRef.current.firstSpeechTime,
          lastSpeechStartTime: now,
          lastSpeechEndTime: ttsTimingRef.current.lastSpeechEndTime,
        }
      }));
    };

    utterance.onend = () => {
      const now = Date.now();
      ttsTimingRef.current.lastSpeechEndTime = now;
      
      console.log('[TTS] Speaking ended');
      currentUtteranceRef.current = null;
      
      // Process next in queue
      if (utteranceQueueRef.current.length > 0) {
        const nextUtterance = utteranceQueueRef.current.shift()!;
        speechSynthesis.speak(nextUtterance);
      } else {
        setState(prev => ({ 
          ...prev, 
          isSpeaking: false, 
          queueLength: 0,
          performanceMetrics: {
            ...prev.performanceMetrics,
            lastSpeechEndTime: now,
            firstSpeechTime: prev.performanceMetrics.firstSpeechTime || 0,
          }
        }));
      }
    };

    utterance.onerror = (event) => {
      console.error('[TTS] Speech error:', event);
      setState(prev => ({ 
        ...prev, 
        isSpeaking: false, 
        error: `Speech error: ${event.error}` 
      }));
    };

    utterance.onpause = () => {
      setState(prev => ({ ...prev, isPaused: true }));
    };

    utterance.onresume = () => {
      setState(prev => ({ ...prev, isPaused: false }));
    };

    // Speak immediately or add to queue
    if (!state.isSpeaking) {
      speechSynthesis.speak(utterance);
    } else {
      utteranceQueueRef.current.push(utterance);
      setState(prev => ({ 
        ...prev, 
        queueLength: utteranceQueueRef.current.length 
      }));
    }
  }, [state.isSupported, state.isSpeaking, createUtterance]);

  // Enhanced streaming state
  const streamingStateRef = useRef({
    currentStreamId: '',
    accumulatedText: '',
    spokenText: '',
    isStreaming: false,
  });

  // Stop speaking function (defined early to avoid circular dependency)
  const stop = useCallback(() => {
    if (!speechSynthesis) return;

    // Use pause instead of cancel for faster restart
    speechSynthesis.pause();
    speechSynthesis.cancel();
    utteranceQueueRef.current = [];
    currentUtteranceRef.current = null;
    
    // Reset streaming state
    streamingStateRef.current = {
      currentStreamId: '',
      accumulatedText: '',
      spokenText: '',
      isStreaming: false,
    };
    
    setState(prev => ({ 
      ...prev, 
      isSpeaking: false, 
      isPaused: false, 
      queueLength: 0 
    }));
    
    console.log('[TTS] Speaking stopped and streaming state reset');
  }, []);

  // Stream text (speak as chunks come in) - Fixed version
  const speakStream = useCallback((streamId: string, textChunk: string, isComplete: boolean = false) => {
    console.log('[TTS] Stream chunk received:', { streamId, chunk: textChunk.substring(0, 50), isComplete });
    
    // Only reset state if this is genuinely a NEW stream (different ID)
    if (streamingStateRef.current.currentStreamId !== streamId) {
      console.log('[TTS] Starting genuinely new stream:', streamId);
      // Stop any ongoing speech only for truly new streams
      stop();
      
      // Track stream start time for performance metrics
      ttsTimingRef.current.streamStartTime = Date.now();
      ttsTimingRef.current.firstSpeechTime = 0;
      
      streamingStateRef.current = {
        currentStreamId: streamId,
        accumulatedText: '',
        spokenText: '',
        isStreaming: true,
      };
    }

    // Update accumulated text (this grows with each chunk)
    streamingStateRef.current.accumulatedText = textChunk;
    
    // Get text that hasn't been spoken yet
    const spokenLength = streamingStateRef.current.spokenText.length;
    const unspokenText = textChunk.slice(spokenLength);
    
    if (unspokenText.trim()) {
      // Look for complete sentences in the unspoken text
      const sentenceEndPattern = /^(.*?[.!?])\s*/;
      const match = unspokenText.match(sentenceEndPattern);
      
      if (match) {
        // We found a complete sentence, speak it
        const sentenceToSpeak = match[1].trim();
        if (sentenceToSpeak && !state.isSpeaking) { // Only speak if not already speaking
          console.log('[TTS] Speaking new complete sentence:', sentenceToSpeak);
          speak(sentenceToSpeak);
          // Update what we've spoken
          streamingStateRef.current.spokenText = textChunk.slice(0, spokenLength + match[0].length);
        }
      } else if (isComplete && unspokenText.trim()) {
        // Stream is complete, speak any remaining text
        console.log('[TTS] Speaking final remaining text:', unspokenText.trim());
        if (!state.isSpeaking) { // Only if not currently speaking
          speak(unspokenText.trim());
          streamingStateRef.current.spokenText = textChunk;
        }
        streamingStateRef.current.isStreaming = false;
      }
    }
    
    // If stream is complete and nothing left to speak
    if (isComplete && streamingStateRef.current.spokenText.length >= textChunk.length) {
      streamingStateRef.current.isStreaming = false;
    }
  }, [speak, stop, state.isSpeaking]);

  // Get streaming progress
  const getStreamProgress = useCallback(() => {
    const state = streamingStateRef.current;
    return {
      totalText: state.accumulatedText,
      spokenText: state.spokenText,
      remainingText: state.accumulatedText.slice(state.spokenText.length),
      isStreaming: state.isStreaming,
      progress: state.accumulatedText ? (state.spokenText.length / state.accumulatedText.length) : 0,
    };
  }, []);

  // Pause speaking
  const pause = useCallback(() => {
    if (!speechSynthesis || !state.isSpeaking) return;
    
    speechSynthesis.pause();
    console.log('[TTS] Speaking paused');
  }, [state.isSpeaking]);

  // Resume speaking
  const resume = useCallback(() => {
    if (!speechSynthesis || !state.isPaused) return;
    
    speechSynthesis.resume();
    console.log('[TTS] Speaking resumed');
  }, [state.isPaused]);

  // Set voice by name
  const setVoice = useCallback((voiceName: string) => {
    const voice = state.availableVoices.find(v => 
      v.name === voiceName || 
      v.name.toLowerCase().includes(voiceName.toLowerCase())
    );
    
    if (voice) {
      setState(prev => ({ ...prev, currentVoice: voice }));
      console.log('[TTS] Voice changed to:', voice.name);
    }
  }, [state.availableVoices]);

  // Get recommended voices for language
  const getVoicesForLanguage = useCallback((lang: string): SpeechSynthesisVoice[] => {
    return state.availableVoices.filter(voice => 
      voice.lang.startsWith(lang.split('-')[0])
    );
  }, [state.availableVoices]);

  return {
    ...state,
    speak,
    speakStream,
    getStreamProgress,
    stop,
    pause,
    resume,
    setVoice,
    getVoicesForLanguage,
  };
}