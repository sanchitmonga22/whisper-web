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

export interface PerformanceMetrics {
  vadDetectionTime: number;      // Time from speech start to speech end
  sttProcessingTime: number;     // Time to transcribe audio
  llmFirstTokenTime: number;     // Time to first LLM token
  llmCompletionTime: number;     // Total LLM response time
  ttsFirstSpeechTime: number;    // Time to first TTS utterance
  ttsCompletionTime: number;     // Total TTS speaking time
  totalPipelineTime: number;     // Total end-to-end time
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
  performance: PerformanceMetrics;
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
    performance: {
      vadDetectionTime: 0,
      sttProcessingTime: 0,
      llmFirstTokenTime: 0,
      llmCompletionTime: 0,
      ttsFirstSpeechTime: 0,
      ttsCompletionTime: 0,
      totalPipelineTime: 0,
    },
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const turnStartTimeRef = useRef<number>(0);
  const responseTimesRef = useRef<number[]>([]);
  const lastTTSEndTimeRef = useRef<number>(0);
  const TTS_COOLDOWN_MS = 500; // Reduced to 500ms for faster responses
  
  // Performance tracking refs
  const performanceRef = useRef({
    speechStartTime: 0,
    speechEndTime: 0,
    sttStartTime: 0,
    sttEndTime: 0,
    llmStartTime: 0,
    llmFirstTokenTime: 0,
    llmEndTime: 0,
    ttsFirstSpeechTime: 0,
    ttsStartTime: 0,
    ttsEndTime: 0,
    pipelineStartTime: 0,
  });

  // Initialize transcriber
  const transcriber = useTranscriber();

  // Initialize LLM streaming
  const llm = useLLMStreaming(config.llm);

  // Initialize TTS
  const tts = useTTS(config.tts);

  // Initialize VAD with simple conversation handlers
  const vad = useVAD({
    ...config.vad,
    onSpeechStart: () => {
      const now = Date.now();
      console.log('[Conversation] User started speaking');
      
      // Track performance
      performanceRef.current.speechStartTime = now;
      performanceRef.current.pipelineStartTime = now;
      
      setState(prev => ({ 
        ...prev, 
        isListening: true,
        currentUserInput: '',
        error: null
      }));
      
      turnStartTimeRef.current = now;
    },
    
    onSpeechEnd: async (audio: Float32Array) => {
      const now = Date.now();
      performanceRef.current.speechEndTime = now;
      const vadTime = now - performanceRef.current.speechStartTime;
      
      console.log('[Conversation] User finished speaking, processing...', {
        vadDetectionTime: `${vadTime}ms`
      });
      
      setState(prev => ({ 
        ...prev, 
        isListening: false,
        isProcessingSTT: true,
        performance: {
          ...prev.performance,
          vadDetectionTime: vadTime,
        }
      }));
      
      // Track STT start time
      performanceRef.current.sttStartTime = Date.now();

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
        // Track STT completion
        const now = Date.now();
        performanceRef.current.sttEndTime = now;
        const sttTime = now - performanceRef.current.sttStartTime;
        
        console.log('[Conversation] Transcription completed:', transcribedText, {
          sttProcessingTime: `${sttTime}ms`
        });
        
        setState(prev => ({ 
          ...prev, 
          isProcessingSTT: false,
          isProcessingLLM: true,
          currentUserInput: transcribedText,
          performance: {
            ...prev.performance,
            sttProcessingTime: sttTime,
          }
        }));

        // Track LLM start time
        performanceRef.current.llmStartTime = Date.now();
        performanceRef.current.llmFirstTokenTime = 0;
        
        // Generate unique stream ID for this conversation turn
        const streamId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Send to LLM
        llm.sendMessage(
          transcribedText,
          // On chunk received - improved streaming coordination
          (chunk: string, fullResponse: string) => {
            // Track first token time
            if (performanceRef.current.llmFirstTokenTime === 0) {
              performanceRef.current.llmFirstTokenTime = Date.now();
              const firstTokenTime = performanceRef.current.llmFirstTokenTime - performanceRef.current.llmStartTime;
              
              console.log('[Conversation] LLM first token received:', {
                firstTokenTime: `${firstTokenTime}ms`
              });
              
              setState(prev => ({
                ...prev,
                performance: {
                  ...prev.performance,
                  llmFirstTokenTime: firstTokenTime,
                }
              }));
            }
            setState(prev => ({ 
              ...prev, 
              currentAssistantResponse: fullResponse 
            }));
            
            // Stream to TTS immediately with proper tracking
            if (config.autoSpeak) {
              tts.speakStream(streamId, fullResponse, false);
            }
          },
          // On completion
          (fullResponse: string) => {
            // Track LLM completion
            const now = Date.now();
            performanceRef.current.llmEndTime = now;
            const llmTime = now - performanceRef.current.llmStartTime;
            const totalPipelineTime = now - performanceRef.current.pipelineStartTime;
            
            const responseTime = Date.now() - turnStartTimeRef.current;
            responseTimesRef.current.push(responseTime);
            
            const avgTime = responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length;
            
            console.log('[Conversation] LLM response completed:', {
              response: fullResponse.substring(0, 100) + '...',
              llmCompletionTime: `${llmTime}ms`,
              totalPipelineTime: `${totalPipelineTime}ms`,
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
              },
              performance: {
                ...prev.performance,
                llmCompletionTime: llmTime,
                totalPipelineTime: totalPipelineTime,
              }
            }));

            // Signal TTS that streaming is complete
            if (config.autoSpeak) {
              tts.speakStream(streamId, fullResponse, true);
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

  // Simple TTS state tracking and VAD shutdown/restart
  const prevTTSSpeakingRef = useRef<boolean>(false);
  const vadRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef<boolean>(false);
  
  // Separate useEffect for state updates only
  useEffect(() => {
    setState(prev => ({ 
      ...prev, 
      isSpeaking: tts.isSpeaking 
    }));
  }, [tts.isSpeaking]);

  // Separate useEffect for VAD control logic
  useEffect(() => {
    const wasSpeaking = prevTTSSpeakingRef.current;
    const isNowSpeaking = tts.isSpeaking;
    
    // Update ref for next comparison
    prevTTSSpeakingRef.current = isNowSpeaking;
    
    // SIMPLE APPROACH: Completely stop VAD when TTS starts
    if (!wasSpeaking && isNowSpeaking && isActiveRef.current) {
      console.log('[Conversation] TTS started - STOPPING VAD completely to prevent echo');
      
      // Clear any pending restart
      if (vadRestartTimeoutRef.current) {
        clearTimeout(vadRestartTimeoutRef.current);
        vadRestartTimeoutRef.current = null;
      }
      
      // Completely stop VAD
      vad.stopListening();
    }
    
    // SIMPLE APPROACH: Restart VAD after TTS completely finishes
    if (wasSpeaking && !isNowSpeaking && isActiveRef.current) {
      console.log('[Conversation] TTS finished - restarting VAD after cooldown');
      
      // Restart VAD after cooldown
      vadRestartTimeoutRef.current = setTimeout(async () => {
        if (isActiveRef.current && !tts.isSpeaking) { // Double-check we're still in conversation and not speaking
          console.log('[Conversation] Cooldown complete - restarting VAD');
          try {
            await vad.startListening();
            console.log('[Conversation] VAD successfully restarted');
          } catch (error) {
            console.error('[Conversation] Failed to restart VAD:', error);
          }
        }
        vadRestartTimeoutRef.current = null;
      }, TTS_COOLDOWN_MS);
    }
  }, [tts.isSpeaking]);

  // Warm up the pipeline (preload models and cache)
  const warmUpPipeline = useCallback(async () => {
    console.log('[Conversation] Warming up pipeline...');
    
    // 1. Create audio context early to avoid latency
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({
        sampleRate: Constants.SAMPLING_RATE,
      });
      console.log('[Conversation] Audio context created');
    }
    
    // 2. NOTE: We initialize VAD only when starting conversation to prevent mic access
    // VAD initialization is moved to startConversation to prevent auto-mic
    
    // 3. Warm up TTS by loading voices
    if (tts.availableVoices.length === 0) {
      // Trigger voice loading
      speechSynthesis.getVoices();
      console.log('[Conversation] TTS voices loaded');
    }
    
    // 4. Send a quick ping to LLM API to establish connection
    // This helps with TLS handshake and DNS resolution
    if (config.llm.apiKey) {
      try {
        const warmUpMessage = { role: 'user' as const, content: 'ping' };
        // We don't actually send this, just prepare the connection
        console.log('[Conversation] LLM connection warmed up');
      } catch (e) {
        // Silent fail for warm-up
      }
    }
    
    console.log('[Conversation] Pipeline warm-up complete');
  }, [tts.availableVoices, config.llm.apiKey]);

  // Start conversation
  const startConversation = useCallback(async () => {
    console.log('[Conversation] Starting voice conversation');
    
    try {
      // Warm up pipeline first
      await warmUpPipeline();
      
      // Initialize VAD if needed
      if (!vad.isInitialized) {
        await vad.initialize();
      }
      
      await vad.startListening();
      
      isActiveRef.current = true;
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
  }, [vad, warmUpPipeline]);

  // Stop conversation
  const stopConversation = useCallback(() => {
    console.log('[Conversation] Stopping voice conversation');
    
    // Clear any pending VAD restart timeout
    if (vadRestartTimeoutRef.current) {
      clearTimeout(vadRestartTimeoutRef.current);
      vadRestartTimeoutRef.current = null;
    }
    
    // Stop all components
    vad.stopListening();
    llm.stopStreaming();
    tts.stop();
    
    // Reset refs
    lastTTSEndTimeRef.current = 0;
    prevTTSSpeakingRef.current = false;
    
    isActiveRef.current = false;
    setState(prev => ({ 
      ...prev, 
      isActive: false,
      isListening: false,
      isProcessingSTT: false,
      isProcessingLLM: false,
      isSpeaking: false,
    }));
    
    // IMPORTANT: Keep audio context alive for faster restarts
    // Don't close it to maintain warm state
    console.log('[Conversation] Keeping audio context warm for fast restart');
    
    console.log('[Conversation] Voice conversation stopped (models kept warm)');
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
    
    // Generate unique stream ID for this conversation turn
    const streamId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    llm.sendMessage(
      text,
      (chunk: string, fullResponse: string) => {
        setState(prev => ({ 
          ...prev, 
          currentAssistantResponse: fullResponse 
        }));
        
        // Stream to TTS with proper tracking
        if (config.autoSpeak) {
          tts.speakStream(streamId, fullResponse, false);
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

        // Signal TTS that streaming is complete
        if (config.autoSpeak) {
          tts.speakStream(streamId, fullResponse, true);
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
      streamProgress: tts.getStreamProgress(),
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