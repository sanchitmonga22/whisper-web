import { useState, useCallback, useRef, useEffect } from 'react';
import { useMoonshine, type MoonshineConfig } from './useMoonshine';
import { useLLMStreaming, type LLMConfig } from './useLLMStreaming';
import { useTTSWithPiper, type TTSConfig } from './useTTSWithPiper';

export interface MoonshineConversationConfig {
  llm: LLMConfig;
  tts: TTSConfig;
  moonshine?: MoonshineConfig;
  autoSpeak?: boolean;
  interruptible?: boolean;
}

export interface MoonshinePerformanceMetrics {
  vadDetectionTime: number;
  sttProcessingTime: number;
  llmFirstTokenTime: number;
  llmCompletionTime: number;
  ttsFirstSpeechTime: number;
  ttsCompletionTime: number;
  totalPipelineTime: number;
  sttEngine: 'moonshine';
  modelUsed: string;
}

export interface MoonshineConversationState {
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
    avgSTTTime: number;
  };
  performance: MoonshinePerformanceMetrics;
}

export function useMoonshineConversation(config: MoonshineConversationConfig) {
  const [state, setState] = useState<MoonshineConversationState>({
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
      avgSTTTime: 0,
    },
    performance: {
      vadDetectionTime: 0,
      sttProcessingTime: 0,
      llmFirstTokenTime: 0,
      llmCompletionTime: 0,
      ttsFirstSpeechTime: 0,
      ttsCompletionTime: 0,
      totalPipelineTime: 0,
      sttEngine: 'moonshine',
      modelUsed: config.moonshine?.model || 'moonshine-tiny',
    },
  });

  const responseTimesRef = useRef<number[]>([]);
  const sttTimesRef = useRef<number[]>([]);
  const lastTTSEndTimeRef = useRef<number>(0);
  const TTS_COOLDOWN_MS = 300;

  // Performance tracking refs
  // 
  // PIPELINE TIMING METHODOLOGY:
  // The total pipeline time represents user-perceived latency - the time from when
  // the user stops talking until they hear the first audio response from the AI.
  //
  // Timeline:
  // 1. User speaks -> speechStartTime recorded
  // 2. User stops speaking -> speechEndTime + pipelineStartTime recorded (processing begins)
  // 3. STT processes audio -> sttProcessingTime calculated
  // 4. LLM receives text and starts processing -> llmStartTime recorded
  // 5. LLM returns first token -> llmFirstTokenTime recorded + TOTAL PIPELINE TIME ENDS
  //    (This is when TTS begins and user starts hearing response)
  // 6. LLM completes -> llmCompletionTime calculated
  // 7. TTS speaks -> ttsCompletionTime calculated
  //
  // Key insight: Total pipeline time = pipelineStartTime to llmFirstTokenTime
  // This captures the user's actual waiting experience from speech end to audio start.
  //
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
    pipelineStartTime: 0, // Set when user stops speaking (processing begins)
  });

  // Initialize Moonshine with custom config
  const moonshine = useMoonshine({
    ...config.moonshine,
    onSpeechStart: () => {
      performanceRef.current.speechStartTime = Date.now();
      setState(prev => ({ ...prev, isListening: true, isProcessingSTT: true }));
    },
    onSpeechEnd: () => {
      performanceRef.current.speechEndTime = Date.now();
      performanceRef.current.pipelineStartTime = Date.now(); // Start pipeline timing when user stops speaking
      const vadTime = performanceRef.current.speechEndTime - performanceRef.current.speechStartTime;
      setState(prev => ({
        ...prev,
        performance: { ...prev.performance, vadDetectionTime: vadTime }
      }));
    },
    onTranscription: (text: string) => {
      handleTranscription(text);
    },
    onError: (error: string) => {
      setState(prev => ({ ...prev, error }));
    },
  });

  // Initialize LLM
  const llm = useLLMStreaming(config.llm);

  // Initialize TTS with Piper as default
  const tts = useTTSWithPiper({
    ...config.tts,
    engine: 'piper', // Use Piper by default
    piperVoiceId: 'en_US-hfc_female-medium',
  });

  // Update statistics
  const updateStats = useCallback((responseTime: number) => {
    responseTimesRef.current.push(responseTime);
    if (responseTimesRef.current.length > 10) {
      responseTimesRef.current.shift();
    }
    
    const avgResponseTime = responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length;
    
    setState(prev => ({
      ...prev,
      stats: {
        ...prev.stats,
        totalTurns: prev.stats.totalTurns + 1,
        avgResponseTime: Math.round(avgResponseTime),
        lastResponseTime: Math.round(responseTime),
      }
    }));
  }, []);

  // Monitor TTS state changes for performance tracking and VAD control
  const prevTTSStateRef = useRef({ isSpeaking: false });
  useEffect(() => {
    const wasSpeaking = prevTTSStateRef.current.isSpeaking;
    const isSpeaking = tts.isSpeaking;
    
    // TTS started speaking
    if (!wasSpeaking && isSpeaking) {
      performanceRef.current.ttsStartTime = Date.now();
      
      setState(prev => ({ ...prev, isSpeaking: true }));
      moonshine.pauseVAD();
      
      // Track first speech time if available
      if (tts.performanceMetrics?.firstSpeechTime && !performanceRef.current.ttsFirstSpeechTime) {
        performanceRef.current.ttsFirstSpeechTime = tts.performanceMetrics.firstSpeechTime;
        setState(prev => ({
          ...prev,
          performance: { ...prev.performance, ttsFirstSpeechTime: tts.performanceMetrics!.firstSpeechTime }
        }));
      }
    }
    
    // TTS stopped speaking
    if (wasSpeaking && !isSpeaking) {
      performanceRef.current.ttsEndTime = Date.now();
      const ttsTime = performanceRef.current.ttsEndTime - performanceRef.current.ttsStartTime;
      
      setState(prev => ({
        ...prev,
        isSpeaking: false,
        performance: { 
          ...prev.performance, 
          ttsCompletionTime: ttsTime
        }
      }));
      
      lastTTSEndTimeRef.current = Date.now();
      setTimeout(() => {
        moonshine.resumeVAD();
      }, TTS_COOLDOWN_MS);

      // Use the pipeline time that was calculated at first LLM token (user-perceived latency)
      const currentTotalPipelineTime = performanceRef.current.llmFirstTokenTime - performanceRef.current.pipelineStartTime;
      updateStats(currentTotalPipelineTime);
    }
    
    prevTTSStateRef.current.isSpeaking = isSpeaking;
  }, [tts.isSpeaking, tts.performanceMetrics, moonshine.pauseVAD, moonshine.resumeVAD, updateStats]);

  // Handle TTS errors
  useEffect(() => {
    if (tts.error) {
      setState(prev => ({
        ...prev,
        error: `TTS Error: ${tts.error}`,
      }));
      moonshine.resumeVAD();
    }
  }, [tts.error, moonshine.resumeVAD]);

  // Speak the response
  const speakResponse = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return;
    
    const timeSinceLastTTS = Date.now() - lastTTSEndTimeRef.current;
    if (timeSinceLastTTS < TTS_COOLDOWN_MS) {
      await new Promise(resolve => setTimeout(resolve, TTS_COOLDOWN_MS - timeSinceLastTTS));
    }
    
    tts.speak(text);
  }, [tts]);

  // Handle transcription from Moonshine
  const handleTranscription = useCallback(async (text: string) => {
    performanceRef.current.sttEndTime = Date.now();
    const sttTime = performanceRef.current.sttEndTime - performanceRef.current.speechEndTime;
    
    // Update STT times for averaging
    sttTimesRef.current.push(sttTime);
    if (sttTimesRef.current.length > 10) {
      sttTimesRef.current.shift();
    }
    const avgSTTTime = sttTimesRef.current.reduce((a, b) => a + b, 0) / sttTimesRef.current.length;

    setState(prev => ({
      ...prev,
      isProcessingSTT: false,
      currentUserInput: text,
      performance: { ...prev.performance, sttProcessingTime: sttTime },
      stats: { ...prev.stats, avgSTTTime: Math.round(avgSTTTime) }
    }));

    console.log(`[MoonshineConversation] Transcription complete: "${text}" (${sttTime}ms)`);

    // Process with LLM if we have text
    if (text && text.trim()) {
      performanceRef.current.llmStartTime = Date.now();
      performanceRef.current.llmFirstTokenTime = 0;
      
      setState(prev => ({
        ...prev,
        isProcessingLLM: true,
        currentAssistantResponse: '',
      }));

      try {
        await llm.sendMessage(
          text,
          // onChunk callback
          (token: string, fullResponse: string) => {
            if (!performanceRef.current.llmFirstTokenTime && token) {
              performanceRef.current.llmFirstTokenTime = Date.now();
              const firstTokenTime = performanceRef.current.llmFirstTokenTime - performanceRef.current.llmStartTime;
              
              // TOTAL PIPELINE TIME: Calculate user-perceived latency
              // From when user stops talking to when they hear the first audio response
              // This represents the true "time to first response" metric
              const totalPipelineTime = performanceRef.current.llmFirstTokenTime - performanceRef.current.pipelineStartTime;
              
              setState(prev => ({
                ...prev,
                performance: { 
                  ...prev.performance, 
                  llmFirstTokenTime: firstTokenTime,
                  totalPipelineTime: totalPipelineTime
                }
              }));
            }
            setState(prev => ({
              ...prev,
              currentAssistantResponse: fullResponse,
            }));
          },
          // onComplete callback
          (fullText: string) => {
            performanceRef.current.llmEndTime = Date.now();
            const llmTime = performanceRef.current.llmEndTime - performanceRef.current.llmStartTime;
            
            setState(prev => ({
              ...prev,
              isProcessingLLM: false,
              currentAssistantResponse: fullText,
              performance: { 
                ...prev.performance, 
                llmCompletionTime: llmTime
                // Note: totalPipelineTime already calculated at first token
              }
            }));

            if (config.autoSpeak !== false) {
              speakResponse(fullText);
            }
          }
        );
      } catch (error) {
        console.error('[MoonshineConversation] LLM error:', error);
        setState(prev => ({
          ...prev,
          isProcessingLLM: false,
          error: `LLM Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }));
      }
    }
  }, [llm, config.autoSpeak, speakResponse]);

  // Start conversation
  const startConversation = useCallback(async () => {
    console.log('[MoonshineConversation] Starting conversation...');
    setState(prev => ({ ...prev, isActive: true, error: null }));
    
    // Initialize moonshine components
    await moonshine.initialize();
    
    // Start listening
    await moonshine.startListening();
    
    console.log('[MoonshineConversation] Conversation started');
  }, [moonshine]);

  // Stop conversation
  const stopConversation = useCallback(() => {
    console.log('[MoonshineConversation] Stopping conversation...');
    
    moonshine.stopListening();
    llm.stop();
    tts.stop();
    
    setState(prev => ({
      ...prev,
      isActive: false,
      isListening: false,
      isProcessingSTT: false,
      isProcessingLLM: false,
      isSpeaking: false,
    }));
    
    console.log('[MoonshineConversation] Conversation stopped');
  }, [moonshine, llm, tts]);

  // Toggle conversation
  const toggleConversation = useCallback(() => {
    if (state.isActive) {
      stopConversation();
    } else {
      startConversation();
    }
  }, [state.isActive, startConversation, stopConversation]);

  // Interrupt current speech
  const interrupt = useCallback(() => {
    if (state.isSpeaking && config.interruptible !== false) {
      console.log('[MoonshineConversation] Interrupting speech...');
      tts.stop();
      moonshine.resumeVAD();
      setState(prev => ({ ...prev, isSpeaking: false }));
    }
  }, [state.isSpeaking, config.interruptible, tts, moonshine]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    llm.clearHistory();
    setState(prev => ({
      ...prev,
      currentUserInput: '',
      currentAssistantResponse: '',
      stats: {
        totalTurns: 0,
        avgResponseTime: 0,
        lastResponseTime: 0,
        avgSTTTime: 0,
      }
    }));
    responseTimesRef.current = [];
    sttTimesRef.current = [];
  }, [llm]);

  return {
    // State
    ...state,
    
    // Moonshine specific state
    interimTranscription: moonshine.interimTranscription,
    isTranscribing: moonshine.isTranscribing,
    
    // Actions
    startConversation,
    stopConversation,
    toggleConversation,
    interrupt,
    clearConversation,
  };
}