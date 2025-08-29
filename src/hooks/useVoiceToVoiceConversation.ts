import { useState, useRef, useEffect, useCallback } from 'react';
import { createVoiceToVoiceService, ElevenLabsVoiceToVoiceService } from '../services/elevenlabs-voice-to-voice';
import { playAudioBuffer } from '../utils/audio';
import { trackEvent } from '../utils/analytics';

interface ConversationMetrics {
  totalLatency: number;
  conversationStartTime: number;
  lastInteractionTime: number;
  totalInteractions: number;
  averageLatency: number;
  lastLatency: number;
}

interface UseVoiceToVoiceConversationReturn {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  isVoiceDetected: boolean;
  error: string | null;
  metrics: ConversationMetrics;
  startListening: () => Promise<void>;
  stopListening: () => void;
  updateConfig: (config: { apiKey?: string; voiceId?: string }) => void;
}

export const useVoiceToVoiceConversation = (
  apiKey: string,
  voiceId?: string
): UseVoiceToVoiceConversationReturn => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ConversationMetrics>({
    totalLatency: 0,
    conversationStartTime: 0,
    lastInteractionTime: 0,
    totalInteractions: 0,
    averageLatency: 0,
    lastLatency: 0,
  });
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);

  const serviceRef = useRef<ElevenLabsVoiceToVoiceService | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const voiceActivityRef = useRef<boolean>(false);
  const continuousMode = useRef<boolean>(true);

  useEffect(() => {
    if (apiKey) {
      try {
        serviceRef.current = createVoiceToVoiceService({
          apiKey,
          voiceId,
        });
        console.log('[VoiceToVoice Hook] Service initialized');
      } catch (err) {
        console.error('[VoiceToVoice Hook] Failed to initialize service:', err);
        setError('Failed to initialize ElevenLabs service');
      }
    }
  }, [apiKey, voiceId]);

  const processAudio = useCallback(async () => {
    if (!serviceRef.current || audioChunksRef.current.length === 0) {
      console.log('[VoiceToVoice Hook] No service or audio chunks to process');
      return;
    }

    setIsProcessing(true);
    setError(null);
    const processingStartTime = performance.now();

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('[VoiceToVoice Hook] Processing audio blob:', audioBlob.size, 'bytes');

      const result = await serviceRef.current.speechToSpeech(audioBlob);
      
      const totalLatency = performance.now() - processingStartTime;
      console.log(`[VoiceToVoice Hook] Total latency: ${totalLatency.toFixed(0)}ms`);

      setMetrics(prev => {
        const newTotal = prev.totalInteractions + 1;
        const newTotalLatency = prev.totalLatency + totalLatency;
        return {
          ...prev,
          totalLatency: newTotalLatency,
          lastInteractionTime: Date.now(),
          totalInteractions: newTotal,
          averageLatency: newTotalLatency / newTotal,
          lastLatency: totalLatency,
        };
      });

      trackEvent('voice_to_voice_interaction', {
        latency: totalLatency,
        audioSize: audioBlob.size,
      });

      if (result.audioBuffer && result.audioBuffer.byteLength > 0) {
        setIsSpeaking(true);
        await playAudioBuffer(result.audioBuffer, () => {
          setIsSpeaking(false);
          console.log('[VoiceToVoice Hook] Audio playback completed');
          // In continuous mode, start listening again after speaking
          if (continuousMode.current && streamRef.current && mediaRecorderRef.current) {
            setTimeout(() => {
              startRecording();
            }, 500); // Small delay to avoid audio feedback
          }
        });
      }
    } catch (err) {
      console.error('[VoiceToVoice Hook] Processing error:', err);
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
      audioChunksRef.current = [];
    }
  }, []);

  const detectVoiceActivity = useCallback(() => {
    if (!analyserRef.current) return false;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
    const threshold = 20; // Adjust for sensitivity

    const hasVoice = average > threshold;
    setIsVoiceDetected(hasVoice);

    if (hasVoice) {
      voiceActivityRef.current = true;
      // Clear any existing silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    } else if (voiceActivityRef.current && !silenceTimeoutRef.current) {
      // Start silence timeout - stop recording after 1.5s of silence
      silenceTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording' && audioChunksRef.current.length > 0) {
          console.log('[VoiceToVoice Hook] Silence detected, processing...');
          voiceActivityRef.current = false;
          mediaRecorderRef.current.stop();
        }
      }, 1500);
    }

    return hasVoice;
  }, []);

  const startRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !streamRef.current) return;

    audioChunksRef.current = [];
    mediaRecorderRef.current.start(100); // Collect data every 100ms for real-time
    
    // Start voice activity detection
    const checkVoice = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        detectVoiceActivity();
        requestAnimationFrame(checkVoice);
      }
    };
    checkVoice();
  }, [detectVoiceActivity]);

  const startListening = useCallback(async () => {
    if (!serviceRef.current) {
      setError('Service not initialized. Please check your API key.');
      return;
    }

    try {
      console.log('[VoiceToVoice Hook] Starting real-time listening...');
      continuousMode.current = true;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Set up analyser for voice activity detection
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          console.log('[VoiceToVoice Hook] Auto-processing after voice activity...');
          processAudio();
        }
      };

      setIsListening(true);
      setError(null);

      if (metrics.conversationStartTime === 0) {
        setMetrics(prev => ({
          ...prev,
          conversationStartTime: Date.now(),
        }));
      }

      // Start recording immediately in continuous mode
      startRecording();
      console.log('[VoiceToVoice Hook] Real-time listening active');
    } catch (err) {
      console.error('[VoiceToVoice Hook] Failed to start listening:', err);
      setError('Failed to access microphone');
    }
  }, [processAudio, metrics.conversationStartTime, startRecording]);

  const stopListening = useCallback(() => {
    console.log('[VoiceToVoice Hook] Stopping listening...');
    
    continuousMode.current = false;
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    setIsVoiceDetected(false);
    voiceActivityRef.current = false;
    console.log('[VoiceToVoice Hook] Listening stopped');
  }, []);

  const updateConfig = useCallback((config: { apiKey?: string; voiceId?: string }) => {
    if (serviceRef.current) {
      serviceRef.current.updateConfig(config);
      console.log('[VoiceToVoice Hook] Config updated');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    isVoiceDetected,
    error,
    metrics,
    startListening,
    stopListening,
    updateConfig,
  };
};