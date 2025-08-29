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
  const speechQueueRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);

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

  // Speak text immediately (internal function)
  const speakImmediate = useCallback(async (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        if (!isInitialized) {
          initialize();
        }

        if (!('speechSynthesis' in window)) {
          reject(new Error('Speech synthesis not supported'));
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Apply options
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

        // Try to find a preferred voice
        const voices = window.speechSynthesis.getVoices();
        if (options.voice) {
          const voice = voices.find(v => v.name === options.voice);
          if (voice) {
            utterance.voice = voice;
          }
        } else {
          // Default to first available English voice
          const englishVoice = voices.find(v => v.lang.startsWith('en'));
          if (englishVoice) {
            utterance.voice = englishVoice;
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
          const errorMessage = `TTS Error: ${event.error}`;
          setError(errorMessage);
          reject(new Error(errorMessage));
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
  }, [isInitialized, initialize, options]);

  // Process the speech queue
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || speechQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    
    while (speechQueueRef.current.length > 0) {
      const text = speechQueueRef.current.shift();
      if (!text) continue;
      
      try {
        await speakImmediate(text);
      } catch (error) {
        console.error('[useSystemTTS] Error processing speech queue:', error);
      }
    }
    
    isProcessingQueueRef.current = false;
  }, [speakImmediate]);

  // Public speak function that queues text
  const speak = useCallback(async (text: string): Promise<void> => {
    speechQueueRef.current.push(text);
    await processQueue();
  }, [processQueue]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    // Clear the queue
    speechQueueRef.current = [];
    isProcessingQueueRef.current = false;
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