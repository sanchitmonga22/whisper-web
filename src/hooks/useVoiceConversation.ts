import { useState, useCallback, useRef, useEffect } from 'react';
import { useVAD } from './useVAD';
import { useTranscriber } from './useTranscriber';
import { useLLMStreaming, type LLMConfig } from './useLLMStreaming';
import { useTTS, type TTSConfig } from './useTTS';
import Constants from '../utils/Constants';

export interface ConversationConfig {
  llm: LLMConfig;
  tts: TTSConfig;
  vad?: {
    positiveSpeechThreshold?: number;
    negativeSpeechThreshold?: number;
    minSpeechDuration?: number;
    preSpeechPadding?: number;
  };
  autoSpeak?: boolean;
  interruptible?: boolean;
}

export interface ConversationState {
  isActive: boolean;
  isListening: boolean;
  isProcessingSTT: boolean;
  isProcessingLLM: boolean;
  isSpeaking: boolean;
  currentUserInput: string;
  currentAssistantResponse: string;
  error: string | null;
  stats: {
    totalTurns: number;
    avgResponseTime: number;
    lastResponseTime: number;
  };
}

export function useVoiceConversation(config: ConversationConfig) {
  const [state, setState] = useState<ConversationState>({
    isActive: false,
    isListening: false,
    isProcessingSTT: false,
    isProcessingLLM: false,
    isSpeaking: false,
    currentUserInput: '',
    currentAssistantResponse: '',
    error: null,
    stats: {
      totalTurns: 0,
      avgResponseTime: 0,
      lastResponseTime: 0,
    },
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const turnStartTimeRef = useRef<number>(0);
  const responseTimesRef = useRef<number[]>([]);

  // Initialize transcriber
  const transcriber = useTranscriber();

  // Initialize LLM streaming
  const llm = useLLMStreaming(config.llm);

  // Initialize TTS
  const tts = useTTS(config.tts);

  // Initialize VAD with conversation-specific handlers
  const vad = useVAD({
    ...config.vad,
    onSpeechStart: () => {
      console.log('[Conversation] User started speaking');
      
      // Interrupt TTS if configured to do so
      if (config.interruptible && tts.isSpeaking) {
        console.log('[Conversation] Interrupting assistant speech');
        tts.stop();
      }
      
      setState(prev => ({ 
        ...prev, 
        isListening: true,
        currentUserInput: '',
        error: null
      }));
      
      turnStartTimeRef.current = Date.now();
    },
    
    onSpeechEnd: async (audio: Float32Array) => {
      console.log('[Conversation] User finished speaking, processing...');
      
      setState(prev => ({ 
        ...prev, 
        isListening: false,
        isProcessingSTT: true
      }));

      try {
        // Convert VAD audio to AudioBuffer for Whisper
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext({
            sampleRate: Constants.SAMPLING_RATE,
          });
        }

        // Handle sample rate conversion if needed
        let processedBuffer: AudioBuffer;
        const vadSampleRate = 16000; // VAD outputs at 16kHz
        
        if (Constants.SAMPLING_RATE === vadSampleRate) {
          // Direct conversion
          processedBuffer = audioContextRef.current.createBuffer(1, audio.length, vadSampleRate);
          processedBuffer.copyToChannel(audio, 0);
        } else {
          // Resample using OfflineAudioContext
          const offlineContext = new OfflineAudioContext(
            1,
            Math.floor(audio.length * Constants.SAMPLING_RATE / vadSampleRate),
            Constants.SAMPLING_RATE
          );
          
          const vadBuffer = audioContextRef.current.createBuffer(1, audio.length, vadSampleRate);
          vadBuffer.copyToChannel(audio, 0);
          
          const source = offlineContext.createBufferSource();
          source.buffer = vadBuffer;
          source.connect(offlineContext.destination);
          source.start(0);
          
          processedBuffer = await offlineContext.startRendering();
        }

        // Send to transcriber
        transcriber.start(processedBuffer);

      } catch (error) {
        console.error('[Conversation] STT processing error:', error);
        setState(prev => ({
          ...prev,
          isProcessingSTT: false,
          error: `Speech processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
      }
    }
  });

  // Handle transcription results
  useEffect(() => {
    if (transcriber.output && !transcriber.isBusy && state.isProcessingSTT) {
      const transcribedText = transcriber.output.text?.trim();
      
      if (transcribedText) {
        console.log('[Conversation] Transcription completed:', transcribedText);
        
        setState(prev => ({ 
          ...prev, 
          isProcessingSTT: false,
          isProcessingLLM: true,
          currentUserInput: transcribedText
        }));

        // Send to LLM
        llm.sendMessage(
          transcribedText,
          // On chunk received
          (chunk: string, fullResponse: string) => {
            setState(prev => ({ 
              ...prev, 
              currentAssistantResponse: fullResponse 
            }));
            
            // Start speaking early if autoSpeak is enabled
            if (config.autoSpeak && !tts.isSpeaking) {
              tts.speakStream(fullResponse, false);
            }
          },
          // On completion
          (fullResponse: string) => {
            const responseTime = Date.now() - turnStartTimeRef.current;
            responseTimesRef.current.push(responseTime);
            
            const avgTime = responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length;
            
            console.log('[Conversation] LLM response completed:', {
              response: fullResponse.substring(0, 100) + '...',
              time: `${responseTime}ms`,
              avgTime: `${avgTime.toFixed(0)}ms`
            });
            
            setState(prev => ({ 
              ...prev, 
              isProcessingLLM: false,
              currentAssistantResponse: fullResponse,
              stats: {
                totalTurns: prev.stats.totalTurns + 1,
                avgResponseTime: avgTime,
                lastResponseTime: responseTime,
              }
            }));

            // Speak the complete response if not already speaking
            if (config.autoSpeak && !tts.isSpeaking) {
              tts.speak(fullResponse);
            }
          }
        );
      } else {
        console.warn('[Conversation] Empty transcription received');
        setState(prev => ({ 
          ...prev, 
          isProcessingSTT: false,
          error: 'No speech detected in audio'
        }));
      }
    }
  }, [transcriber.output, transcriber.isBusy, state.isProcessingSTT, llm, tts, config.autoSpeak]);

  // Track TTS state
  useEffect(() => {
    setState(prev => ({ 
      ...prev, 
      isSpeaking: tts.isSpeaking 
    }));
  }, [tts.isSpeaking]);

  // Start conversation
  const startConversation = useCallback(async () => {
    console.log('[Conversation] Starting voice conversation');
    
    try {
      // Initialize VAD
      if (!vad.isInitialized) {
        await vad.initialize();
      }
      
      await vad.startListening();
      
      setState(prev => ({ 
        ...prev, 
        isActive: true,
        error: null,
        currentUserInput: '',
        currentAssistantResponse: '',
      }));
      
      console.log('[Conversation] Voice conversation started successfully');
    } catch (error) {
      console.error('[Conversation] Failed to start conversation:', error);
      setState(prev => ({
        ...prev,
        error: `Failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
    }
  }, [vad]);

  // Stop conversation
  const stopConversation = useCallback(() => {
    console.log('[Conversation] Stopping voice conversation');
    
    // Stop all components
    vad.stopListening();
    llm.stopStreaming();
    tts.stop();
    
    setState(prev => ({ 
      ...prev, 
      isActive: false,
      isListening: false,
      isProcessingSTT: false,
      isProcessingLLM: false,
      isSpeaking: false,
    }));
    
    // Clean up audio context
    if (audioContextRef.current?.state === 'running') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    console.log('[Conversation] Voice conversation stopped');
  }, [vad, llm, tts]);

  // Manual text input (for testing or fallback)
  const sendTextMessage = useCallback((text: string) => {
    if (!state.isActive) return;
    
    console.log('[Conversation] Sending text message:', text);
    
    setState(prev => ({ 
      ...prev, 
      isProcessingLLM: true,
      currentUserInput: text,
      currentAssistantResponse: ''
    }));
    
    turnStartTimeRef.current = Date.now();
    
    llm.sendMessage(
      text,
      (chunk: string, fullResponse: string) => {
        setState(prev => ({ 
          ...prev, 
          currentAssistantResponse: fullResponse 
        }));
        
        if (config.autoSpeak && !tts.isSpeaking) {
          tts.speakStream(fullResponse, false);
        }
      },
      (fullResponse: string) => {
        const responseTime = Date.now() - turnStartTimeRef.current;
        responseTimesRef.current.push(responseTime);
        
        setState(prev => ({ 
          ...prev, 
          isProcessingLLM: false,
          stats: {
            ...prev.stats,
            totalTurns: prev.stats.totalTurns + 1,
            lastResponseTime: responseTime,
          }
        }));

        if (config.autoSpeak && !tts.isSpeaking) {
          tts.speak(fullResponse);
        }
      }
    );
  }, [state.isActive, llm, tts, config.autoSpeak]);

  // Interrupt assistant (stop speaking)
  const interrupt = useCallback(() => {
    if (tts.isSpeaking) {
      console.log('[Conversation] Interrupting assistant');
      tts.stop();
    }
  }, [tts]);

  // Clear conversation history
  const clearHistory = useCallback(() => {
    llm.clearMessages();
    responseTimesRef.current = [];
    setState(prev => ({
      ...prev,
      currentUserInput: '',
      currentAssistantResponse: '',
      stats: {
        totalTurns: 0,
        avgResponseTime: 0,
        lastResponseTime: 0,
      }
    }));
    console.log('[Conversation] History cleared');
  }, [llm]);

  return {
    // State
    ...state,
    
    // Component states
    vad: {
      isInitialized: vad.isInitialized,
      isListening: vad.isListening,
      isSpeaking: vad.isSpeaking,
      error: vad.error,
    },
    
    llm: {
      isStreaming: llm.isStreaming,
      messages: llm.messages,
      tokensGenerated: llm.tokensGenerated,
    },
    
    tts: {
      availableVoices: tts.availableVoices,
      currentVoice: tts.currentVoice,
      isSupported: tts.isSupported,
    },

    transcriber: {
      isModelLoading: transcriber.isModelLoading,
      progressItems: transcriber.progressItems,
    },
    
    // Actions
    startConversation,
    stopConversation,
    sendTextMessage,
    interrupt,
    clearHistory,
    
    // Direct component access for advanced usage
    vadActions: vad,
    llmActions: llm,
    ttsActions: tts,
    transcriberActions: transcriber,
  };
}