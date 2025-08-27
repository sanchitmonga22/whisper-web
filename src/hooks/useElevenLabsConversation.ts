import { useState, useRef, useCallback, useEffect } from 'react';
import { ElevenLabsService, ConversationMessage, ElevenLabsConfig } from '../services/elevenlabs';
import OpenAI from 'openai';

interface UseElevenLabsConversationConfig extends ElevenLabsConfig {
  onMessage?: (message: ConversationMessage) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConversationStatus) => void;
  autoSpeak?: boolean;
  openaiApiKey?: string;
  openaiModel?: string;
}

type ConversationStatus = 'idle' | 'listening' | 'processing-stt' | 'processing-llm' | 'speaking' | 'error';

interface ConversationStats {
  totalMessages: number;
  lastResponseTime: number;
  avgResponseTime: number;
}

export const useElevenLabsConversation = (config: UseElevenLabsConversationConfig) => {
  const [service, setService] = useState<ElevenLabsService | null>(null);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<any[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [stats, setStats] = useState<ConversationStats>({
    totalMessages: 0,
    lastResponseTime: 0,
    avgResponseTime: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const responseTimeRef = useRef<number>(0);

  // Initialize service when API key changes
  useEffect(() => {
    if (config.apiKey) {
      try {
        const newService = new ElevenLabsService(config);
        setService(newService);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize ElevenLabs service');
      }
    }
  }, [config.apiKey, config.voiceId, config.modelId]);

  // Load available voices
  useEffect(() => {
    const loadVoices = async () => {
      if (service) {
        try {
          const availableVoices = await service.getAvailableVoices();
          setVoices(availableVoices);
        } catch (err) {
          console.error('Failed to load voices:', err);
        }
      }
    };
    loadVoices();
  }, [service]);

  const updateStatus = useCallback((newStatus: ConversationStatus) => {
    setStatus(newStatus);
    config.onStatusChange?.(newStatus);
  }, [config.onStatusChange]);

  const addMessage = useCallback((message: ConversationMessage) => {
    setMessages(prev => [...prev, message]);
    config.onMessage?.(message);
    
    // Update stats
    const now = Date.now();
    if (message.role === 'assistant' && responseTimeRef.current > 0) {
      const responseTime = now - responseTimeRef.current;
      setStats(prev => ({
        totalMessages: prev.totalMessages + 1,
        lastResponseTime: responseTime,
        avgResponseTime: (prev.avgResponseTime * prev.totalMessages + responseTime) / (prev.totalMessages + 1),
      }));
    }
  }, [config.onMessage]);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    updateStatus('error');
    config.onError?.(errorMessage);
  }, [config.onError, updateStatus]);

  const playAudioResponse = useCallback(async (text: string) => {
    if (!service || !config.autoSpeak) return;

    try {
      updateStatus('speaking');
      
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const audioBuffer = await service.textToSpeech(text, config.voiceId);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        updateStatus('listening');
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        handleError('Failed to play audio response');
      };
      
      await audio.play();
    } catch (err) {
      handleError(`TTS Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [service, config.autoSpeak, config.voiceId, updateStatus, handleError]);

  const processWithLLM = useCallback(async (userMessage: string): Promise<string> => {
    // Check if OpenAI API key is available
    const openaiKey = config.openaiApiKey || localStorage.getItem('openai_api_key');
    
    if (!openaiKey) {
      // Fallback to simple response if no OpenAI key
      return `I heard you say: "${userMessage}". Please set your OpenAI API key in settings to enable AI responses.`;
    }

    try {
      const openai = new OpenAI({
        apiKey: openaiKey,
        dangerouslyAllowBrowser: true, // Required for browser usage
      });

      const completion = await openai.chat.completions.create({
        model: config.openaiModel || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Keep your responses concise and friendly.',
          },
          ...messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      return completion.choices[0]?.message?.content || 'Sorry, I could not process that.';
    } catch (error) {
      console.error('OpenAI API Error:', error);
      return `I heard: "${userMessage}". (AI processing error - check API key and try again)`;
    }
  }, [config.openaiApiKey, config.openaiModel, messages]);

  const processUserInput = useCallback(async (inputText: string) => {
    if (!service) return;

    try {
      responseTimeRef.current = Date.now();
      updateStatus('processing-llm');

      // Add user message
      const userMessage: ConversationMessage = {
        role: 'user',
        content: inputText,
        timestamp: new Date(),
      };
      addMessage(userMessage);
      service.addToConversationHistory(userMessage);

      // Process with LLM (you can integrate OpenAI, Anthropic, etc. here)
      const response = await processWithLLM(inputText);
      setCurrentResponse(response);

      // Add assistant message
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      addMessage(assistantMessage);
      service.addToConversationHistory(assistantMessage);

      // Play response if auto-speak is enabled
      await playAudioResponse(response);
      
    } catch (err) {
      handleError(`Processing Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [service, updateStatus, addMessage, processWithLLM, playAudioResponse, handleError]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      streamRef.current = stream;

      // Use webm format which is widely supported
      const options = {
        mimeType: 'audio/webm;codecs=opus'
      };
      
      // Fallback to default if webm is not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log('WebM not supported, using default format');
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
      } else {
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;
      }
      
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        if (!service || audioChunksRef.current.length === 0) return;

        // Create blob with proper MIME type
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
        });
        
        // Only process if we have actual audio data
        if (audioBlob.size > 0) {
          try {
            updateStatus('processing-stt');
            const result = await service.speechToText(audioBlob);
            
            if (result.text.trim()) {
              setCurrentInput(result.text);
              await processUserInput(result.text);
            } else {
              updateStatus('idle');
            }
          } catch (err) {
            handleError(`STT Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          updateStatus('idle');
        }
      };

      mediaRecorderRef.current.start();
      updateStatus('listening');
    } catch (err) {
      handleError(`Microphone Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [service, updateStatus, processUserInput, handleError]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startConversation = useCallback(async () => {
    if (!service || !config.apiKey) {
      handleError('ElevenLabs service not initialized or API key missing');
      return;
    }

    try {
      setIsActive(true);
      setError(null);
      updateStatus('idle'); // Start in idle state, not listening yet
    } catch (err) {
      handleError(`Failed to start conversation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [service, config.apiKey, handleError, updateStatus]);

  const stopConversation = useCallback(() => {
    setIsActive(false);
    updateStatus('idle');
    
    // Stop recording
    stopListening();
    
    // Stop any playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    
    // Clean up media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [updateStatus, stopListening]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!isActive) return;
    await processUserInput(text);
  }, [isActive, processUserInput]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setCurrentInput('');
    setCurrentResponse('');
    setStats({
      totalMessages: 0,
      lastResponseTime: 0,
      avgResponseTime: 0,
    });
    service?.clearConversationHistory();
  }, [service]);

  const interrupt = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      updateStatus('listening');
    }
  }, [updateStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  return {
    // State
    isActive,
    status,
    error,
    voices,
    messages,
    currentInput,
    currentResponse,
    stats,
    
    // Actions
    startConversation,
    stopConversation,
    sendTextMessage,
    startListening,
    stopListening,
    clearHistory,
    interrupt,
    
    // Service methods
    service,
    
    // Status checks
    isListening: status === 'listening',
    isProcessingSTT: status === 'processing-stt',
    isProcessingLLM: status === 'processing-llm',
    isSpeaking: status === 'speaking',
  };
};