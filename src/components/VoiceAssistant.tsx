import { useState, useRef, useEffect } from 'react';
import { useVoiceConversation, type ConversationConfig } from '../hooks/useVoiceConversation';

interface VoiceAssistantProps {
  config?: Partial<ConversationConfig>;
}

export default function VoiceAssistant({ config = {} }: VoiceAssistantProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('voiceai_api_key') || '');
  const [selectedVoice, setSelectedVoice] = useState(localStorage.getItem('voiceai_voice') || '');
  const [llmModel, setLLMModel] = useState(localStorage.getItem('voiceai_model') || 'gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState(
    localStorage.getItem('voiceai_prompt') || 
    'You are a helpful voice assistant. Keep responses concise and conversational, typically 1-2 sentences unless more detail is specifically requested.'
  );
  
  const textInputRef = useRef<HTMLInputElement>(null);

  // Create conversation config
  const conversationConfig: ConversationConfig = {
    llm: {
      apiKey,
      model: llmModel,
      systemPrompt,
      maxTokens: 500,
      temperature: 0.7,
      ...config.llm,
    },
    tts: {
      voice: selectedVoice,
      rate: 1.1,
      pitch: 1.0,
      volume: 0.9,
      ...config.tts,
    },
    vad: {
      positiveSpeechThreshold: 0.9,
      negativeSpeechThreshold: 0.75,
      minSpeechDuration: 300,
      preSpeechPadding: 400,
      ...config.vad,
    },
    autoSpeak: true,
    interruptible: true,
  };

  // Initialize voice conversation
  const conversation = useVoiceConversation(conversationConfig);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('voiceai_api_key', apiKey);
    localStorage.setItem('voiceai_voice', selectedVoice);
    localStorage.setItem('voiceai_model', llmModel);
    localStorage.setItem('voiceai_prompt', systemPrompt);
  }, [apiKey, selectedVoice, llmModel, systemPrompt]);

  // Handle text input
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = textInputRef.current?.value.trim();
    if (text && conversation.isActive) {
      conversation.sendTextMessage(text);
      textInputRef.current!.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Voice AI Assistant
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Local VAD + STT • Cloud LLM (GPT-4o) • Local TTS
        </p>
        <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
          ⚡ Hybrid architecture with real-time streaming at every stage
        </p>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                LLM Model
              </label>
              <select
                value={llmModel}
                onChange={(e) => setLLMModel(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              >
                <option value="gpt-4o">GPT-4o (Recommended)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</option>
                <option value="o1-preview">o1-Preview (Reasoning)</option>
                <option value="o1-mini">o1-Mini (Reasoning)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Voice ({conversation.tts.availableVoices.length} available)
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              >
                <option value="">Default Voice</option>
                {conversation.tts.availableVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                placeholder="Instructions for the AI assistant..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Control Panel */}
      <div className="flex items-center gap-4">
        <button
          onClick={conversation.isActive ? conversation.stopConversation : conversation.startConversation}
          disabled={conversation.transcriber.isModelLoading || (!conversation.isActive && !apiKey)}
          className={`
            px-8 py-4 rounded-full font-bold text-white text-lg transition-all duration-200
            ${conversation.isActive 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-green-500 hover:bg-green-600"}
            ${(conversation.transcriber.isModelLoading || (!conversation.isActive && !apiKey))
              ? "opacity-50 cursor-not-allowed" 
              : "hover:scale-105 active:scale-95"}
          `}
        >
          {conversation.transcriber.isModelLoading 
            ? "Loading Models..." 
            : conversation.isActive 
              ? "🔴 Stop Assistant" 
              : "🎤 Start Assistant"}
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Settings"
        >
          ⚙️
        </button>

        {conversation.isActive && (
          <button
            onClick={conversation.interrupt}
            disabled={!conversation.isSpeaking}
            className="p-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
            title="Interrupt"
          >
            ✋
          </button>
        )}

        {conversation.isActive && (
          <button
            onClick={conversation.clearHistory}
            className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white"
            title="Clear History"
          >
            🗑️
          </button>
        )}
      </div>

      {/* Status Indicators */}
      {conversation.isActive && (
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              conversation.vad.isListening ? 'bg-green-500' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">VAD Ready</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              conversation.isListening ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">Listening</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              conversation.isProcessingSTT ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">STT</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              conversation.isProcessingLLM ? 'bg-purple-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">LLM</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              conversation.isSpeaking ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">TTS</span>
          </div>
        </div>
      )}

      {/* Model Loading Progress */}
      {conversation.transcriber.progressItems.length > 0 && (
        <div className="w-full max-w-2xl">
          {conversation.transcriber.progressItems.map((item) => (
            <div key={item.file} className="mb-2">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Loading: {item.file}
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${item.progress || 0}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current Interaction */}
      {conversation.isActive && (
        <div className="w-full space-y-4">
          {/* User Input */}
          {conversation.currentUserInput && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                You said:
              </div>
              <div className="text-blue-800 dark:text-blue-300">
                {conversation.currentUserInput}
              </div>
            </div>
          )}

          {/* Assistant Response */}
          {conversation.currentAssistantResponse && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-sm font-semibold text-green-900 dark:text-green-200 mb-1 flex items-center gap-2">
                Assistant:
                {conversation.isProcessingLLM && (
                  <span className="text-xs px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded">
                    Thinking...
                  </span>
                )}
                {conversation.isSpeaking && (
                  <span className="text-xs px-2 py-1 bg-red-200 dark:bg-red-800 rounded animate-pulse">
                    Speaking
                  </span>
                )}
              </div>
              <div className="text-green-800 dark:text-green-300 whitespace-pre-wrap">
                {conversation.currentAssistantResponse}
                {conversation.isProcessingLLM && (
                  <span className="animate-pulse">|</span>
                )}
                {/* Show TTS streaming progress */}
                {conversation.tts.streamProgress.isStreaming && conversation.tts.streamProgress.spokenText && (
                  <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                    <div className="flex items-center gap-2">
                      <span>🔊 Speaking:</span>
                      <div className="flex-1 bg-green-200 dark:bg-green-800 rounded-full h-1">
                        <div 
                          className="bg-green-600 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${conversation.tts.streamProgress.progress * 100}%` }}
                        ></div>
                      </div>
                      <span>{Math.round(conversation.tts.streamProgress.progress * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Text Input Fallback */}
          <form onSubmit={handleTextSubmit} className="flex gap-2">
            <input
              ref={textInputRef}
              type="text"
              placeholder="Type a message or just speak..."
              className="flex-1 p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              disabled={conversation.isProcessingLLM}
            />
            <button
              type="submit"
              disabled={conversation.isProcessingLLM}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Stats & Conversation History */}
      {conversation.isActive && conversation.stats.totalTurns > 0 && (
        <div className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Conversation Stats
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Total Turns</div>
              <div className="text-2xl font-bold text-blue-600">{conversation.stats.totalTurns}</div>
            </div>
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Last Response</div>
              <div className="text-2xl font-bold text-green-600">
                {conversation.stats.lastResponseTime}ms
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Avg Response</div>
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(conversation.stats.avgResponseTime)}ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Messages */}
      {conversation.llm.messages.length > 0 && (
        <div className="w-full">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Conversation History
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {conversation.llm.messages
              .filter(m => m.role !== 'system')
              .slice(-6)
              .map((message, index) => (
              <div
                key={index}
                className={`p-2 rounded text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                }`}
              >
                <strong className="capitalize">{message.role}:</strong> {message.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {(conversation.error || conversation.vad.error) && (
        <div className="w-full p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="text-sm text-red-700 dark:text-red-300">
            {conversation.error || conversation.vad.error}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
        <p className="mb-2">
          This hybrid voice AI processes speech locally using Whisper STT and Silero VAD, 
          streams text to cloud LLM, and speaks responses using local browser TTS.
        </p>
        <p>
          <strong>Tip:</strong> Just speak naturally - VAD will detect when you start and stop talking!
        </p>
      </div>
    </div>
  );
}