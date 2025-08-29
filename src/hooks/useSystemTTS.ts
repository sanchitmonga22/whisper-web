import { useCallback, useRef, useState } from 'react';

interface UseSystemTTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
}

export const useSystemTTS = (options: UseSystemTTSOptions = {}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const initialize = useCallback(() => {
    try {
      if (!('speechSynthesis' in window)) {
        throw new Error('Speech synthesis not supported in this browser');
      }
      
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      console.error('Failed to initialize system TTS:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize TTS');
      setIsInitialized(false);
    }
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        if (!isInitialized) {
          initialize();
        }

        if (!('speechSynthesis' in window)) {
          reject(new Error('Speech synthesis not supported'));
          return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Apply options - get fresh values
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

        // Try to find a preferred voice - get fresh voice value
        const voices = window.speechSynthesis.getVoices();
        console.log('[SystemTTS] Available voices:', voices.length);
        console.log('[SystemTTS] Selected voice from options:', options.voice);
        
        if (options.voice && options.voice !== '') {
          const voice = voices.find(v => v.name === options.voice);
          if (voice) {
            utterance.voice = voice;
            console.log('[SystemTTS] Successfully set voice:', voice.name);
          } else {
            console.log('[SystemTTS] Voice not found:', options.voice, 'Available:', voices.map(v => v.name));
          }
        } else {
          // Default to first available English voice
          const englishVoice = voices.find(v => v.lang.startsWith('en'));
          if (englishVoice) {
            utterance.voice = englishVoice;
            console.log('[SystemTTS] Using default English voice:', englishVoice.name);
          }
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };

        utterance.onerror = (event) => {
          setIsSpeaking(false);
          // Don't treat interruption as an error - it's expected when stopping
          if (event.error === 'interrupted') {
            console.log('[SystemTTS] Speech interrupted (expected during stop)');
            resolve();
          } else {
            const errorMessage = `TTS Error: ${event.error}`;
            setError(errorMessage);
            reject(new Error(errorMessage));
          }
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);

      } catch (err) {
        setIsSpeaking(false);
        const errorMessage = err instanceof Error ? err.message : 'TTS failed';
        setError(errorMessage);
        reject(new Error(errorMessage));
      }
    });
  }, [isInitialized, initialize, options.rate, options.pitch, options.volume, options.voice]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const getVoices = useCallback((): SpeechSynthesisVoice[] => {
    if ('speechSynthesis' in window) {
      return window.speechSynthesis.getVoices();
    }
    return [];
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isInitialized,
    initialize,
    getVoices,
    error
  };
};