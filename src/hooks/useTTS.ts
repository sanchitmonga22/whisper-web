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
        voice.name.toLowerCase().includes(config.voice.toLowerCase())
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
      console.log('[TTS] Speaking started');
      currentUtteranceRef.current = utterance;
      setState(prev => ({ 
        ...prev, 
        isSpeaking: true, 
        isPaused: false, 
        error: null 
      }));
    };

    utterance.onend = () => {
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
          queueLength: 0 
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

  // Stream text (speak as chunks come in)
  const speakStream = useCallback((textChunk: string, isComplete: boolean = false) => {
    // For now, we'll accumulate chunks and speak complete sentences
    // This could be enhanced to speak chunks immediately for faster response
    
    // Simple sentence boundary detection
    const sentenceEnders = /[.!?]\s*/g;
    const sentences = textChunk.split(sentenceEnders).filter(s => s.trim());
    
    if (sentences.length > 0 && (isComplete || textChunk.match(sentenceEnders))) {
      // Speak the complete sentences
      const textToSpeak = sentences.join('. ');
      if (textToSpeak.trim()) {
        speak(textToSpeak);
      }
    }
  }, [speak]);

  // Stop speaking
  const stop = useCallback(() => {
    if (!speechSynthesis) return;

    speechSynthesis.cancel();
    utteranceQueueRef.current = [];
    currentUtteranceRef.current = null;
    
    setState(prev => ({ 
      ...prev, 
      isSpeaking: false, 
      isPaused: false, 
      queueLength: 0 
    }));
    
    console.log('[TTS] Speaking stopped');
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
    stop,
    pause,
    resume,
    setVoice,
    getVoicesForLanguage,
  };
}