import { useState, useCallback, useRef } from 'react';
import OpenAI from 'openai';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface LLMConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  baseUrl?: string;
}

export interface LLMState {
  isStreaming: boolean;
  currentResponse: string;
  isComplete: boolean;
  error: string | null;
  messages: LLMMessage[];
  tokensGenerated: number;
  responseTime: number;
}

export function useLLMStreaming(config: LLMConfig = {}) {
  const [state, setState] = useState<LLMState>({
    isStreaming: false,
    currentResponse: '',
    isComplete: false,
    error: null,
    messages: [],
    tokensGenerated: 0,
    responseTime: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const responseStartTimeRef = useRef<number>(0);
  const clientRef = useRef<OpenAI | null>(null);

  // Initialize OpenAI client when API key is available
  const getClient = useCallback(() => {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    if (!clientRef.current || clientRef.current.apiKey !== config.apiKey) {
      clientRef.current = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        dangerouslyAllowBrowser: true, // Required for browser usage
      });
    }

    return clientRef.current;
  }, [config.apiKey, config.baseUrl]);

  // Send message and stream response using new Responses API
  const sendMessage = useCallback(async (
    userMessage: string, 
    onChunk?: (chunk: string, fullResponse: string) => void,
    onComplete?: (fullResponse: string) => void
  ) => {
    if (state.isStreaming) {
      console.warn('[LLM] Already streaming, aborting previous request');
      abortControllerRef.current?.abort();
    }

    console.log('[LLM] Starting streaming request with new Responses API:', userMessage);
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    responseStartTimeRef.current = Date.now();

    // Add user message to history
    const newMessages: LLMMessage[] = [
      ...state.messages,
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      }
    ];

    setState(prev => ({
      ...prev,
      isStreaming: true,
      currentResponse: '',
      isComplete: false,
      error: null,
      messages: newMessages,
      tokensGenerated: 0,
    }));

    try {
      const client = getClient();

      // Prepare input for new Responses API
      let input: any;
      
      // Check if we have conversation history
      if (newMessages.length > 1) {
        // Multi-turn conversation format
        const conversationMessages = newMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Add system prompt if provided
        if (config.systemPrompt) {
          conversationMessages.unshift({
            role: 'system' as const,
            content: config.systemPrompt
          });
        }

        input = conversationMessages;
      } else {
        // Single message format
        if (config.systemPrompt) {
          input = [
            { role: 'system' as const, content: config.systemPrompt },
            { role: 'user' as const, content: userMessage }
          ];
        } else {
          input = userMessage;
        }
      }

      console.log('[LLM] Using new Responses API with model:', config.model || 'gpt-4o');
      console.log('[LLM] Input format:', typeof input === 'string' ? 'simple text' : `${input.length} messages`);

      // Use the new Responses API with streaming
      const stream = await client.responses.create({
        model: config.model || 'gpt-4o',
        input: input,
        stream: true,
        // Note: max_tokens, temperature etc. are handled by the model automatically in the new API
        ...(config.maxTokens && { max_tokens: config.maxTokens }),
        ...(config.temperature && { temperature: config.temperature }),
      });

      let fullResponse = '';
      let tokenCount = 0;

      // Process streaming response
      for await (const event of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        console.log('[LLM] Received event:', event.type);

        // Handle different event types from the new API
        if (event.type === 'response.content.delta') {
          const content = event.content || '';
          if (content) {
            fullResponse += content;
            tokenCount++;
            
            // Update state with new chunk
            setState(prev => ({
              ...prev,
              currentResponse: fullResponse,
              tokensGenerated: tokenCount,
            }));

            // Call chunk callback
            onChunk?.(content, fullResponse);
          }
        } else if (event.type === 'response.content.done') {
          console.log('[LLM] Response content completed');
          break;
        } else if (event.type === 'error') {
          throw new Error(event.error?.message || 'Streaming error');
        }
      }

      // Complete the response
      const responseTime = Date.now() - responseStartTimeRef.current;
      
      setState(prev => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
        messages: [
          ...prev.messages,
          {
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
          }
        ],
        responseTime,
      }));

      console.log('[LLM] Response completed:', {
        tokens: tokenCount,
        time: `${responseTime}ms`,
        throughput: `${(tokenCount / (responseTime / 1000)).toFixed(1)} tokens/s`
      });

      onComplete?.(fullResponse);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[LLM] Request aborted');
        return;
      }

      // Fallback to legacy Chat Completions API if Responses API fails
      console.warn('[LLM] Responses API failed, falling back to Chat Completions:', error);
      
      try {
        await sendMessageLegacy(userMessage, onChunk, onComplete);
      } catch (legacyError) {
        const errorMessage = legacyError instanceof Error ? legacyError.message : 'Unknown error';
        console.error('[LLM] Both APIs failed:', errorMessage);

        setState(prev => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          error: errorMessage,
        }));
      }
    }
  }, [config, state.messages, state.isStreaming, getClient]);

  // Legacy fallback using Chat Completions API
  const sendMessageLegacy = useCallback(async (
    userMessage: string,
    onChunk?: (chunk: string, fullResponse: string) => void,
    onComplete?: (fullResponse: string) => void
  ) => {
    const client = getClient();
    
    // Prepare messages for legacy API
    const messages: any[] = [];
    
    if (config.systemPrompt) {
      messages.push({
        role: 'system',
        content: config.systemPrompt
      });
    }

    // Add conversation history
    state.messages.forEach(msg => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });

    console.log('[LLM] Using legacy Chat Completions API');

    const stream = await client.chat.completions.create({
      model: config.model || 'gpt-3.5-turbo',
      messages,
      stream: true,
      max_tokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.7,
    });

    let fullResponse = '';
    let tokenCount = 0;

    for await (const chunk of stream) {
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        tokenCount++;
        
        setState(prev => ({
          ...prev,
          currentResponse: fullResponse,
          tokensGenerated: tokenCount,
        }));

        onChunk?.(content, fullResponse);
      }
    }

    // Complete the response
    const responseTime = Date.now() - responseStartTimeRef.current;
    
    setState(prev => ({
      ...prev,
      isStreaming: false,
      isComplete: true,
      messages: [
        ...prev.messages,
        {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
        }
      ],
      responseTime,
    }));

    onComplete?.(fullResponse);
  }, [config, state.messages, getClient]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('[LLM] Streaming stopped by user');
    }
  }, []);

  // Clear conversation
  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      currentResponse: '',
      isComplete: false,
      error: null,
      tokensGenerated: 0,
      responseTime: 0,
    }));
  }, []);

  // Add message without sending (for system messages, etc.)
  const addMessage = useCallback((message: Omit<LLMMessage, 'timestamp'>) => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          ...message,
          timestamp: Date.now(),
        }
      ]
    }));
  }, []);

  return {
    ...state,
    sendMessage,
    stopStreaming,
    clearMessages,
    addMessage,
  };
}