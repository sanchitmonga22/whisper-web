import { useState, useRef, useEffect } from 'react';
import { useElevenLabsConversation } from '../hooks/useElevenLabsConversation';

export default function ElevenLabsAssistant() {
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('elevenlabs_api_key') || '');
  const [selectedVoice, setSelectedVoice] = useState(localStorage.getItem('elevenlabs_voice') || '');
  const [autoSpeak, setAutoSpeak] = useState(localStorage.getItem('elevenlabs_autospeak') !== 'false');
  
  const textInputRef = useRef<HTMLInputElement>(null);

  // Initialize ElevenLabs conversation
  const conversation = useElevenLabsConversation({
    apiKey,
    voiceId: selectedVoice || undefined,
    autoSpeak,
    onError: (error) => {
      console.error('ElevenLabs conversation error:', error);
    },
    onStatusChange: (status) => {
      console.log('Status changed:', status);
    },
  });

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('elevenlabs_api_key', apiKey);
    localStorage.setItem('elevenlabs_voice', selectedVoice);
    localStorage.setItem('elevenlabs_autospeak', autoSpeak.toString());
  }, [apiKey, selectedVoice, autoSpeak]);

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
          ElevenLabs AI Assistant
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Direct ElevenLabs API Integration • Advanced STT & TTS
        </p>
        <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
          🚀 Full conversational AI with ElevenLabs Speech-to-Text & Text-to-Speech
        </p>
      </div>

      {/* API Key Warning */}
      {!apiKey && (
        <div className="w-full p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-yellow-800 dark:text-yellow-200 text-center">
            ⚠️ Please set your ElevenLabs API key in settings to get started
          </p>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
          <h3 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">ElevenLabs Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ElevenLabs API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Get your API key from{' '}
                <a 
                  href="https://elevenlabs.io/app/settings/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  ElevenLabs Dashboard
                </a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Voice ({conversation.voices.length} available)
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                disabled={!conversation.voices.length}
              >
                <option value="">Default Voice</option>
                {conversation.voices.map((voice, index) => (
                  <option key={voice.voice_id || `voice-${index}`} value={voice.voice_id}>
                    {voice.name} ({voice.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(e) => setAutoSpeak(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Auto-speak responses
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Main Control Panel */}
      <div className="flex items-center gap-4">
        <button
          onClick={conversation.isActive ? conversation.stopConversation : conversation.startConversation}
          disabled={!apiKey}
          className={`
            px-8 py-4 rounded-full font-bold text-white text-lg transition-all duration-200
            ${conversation.isActive 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-purple-500 hover:bg-purple-600"}
            ${!apiKey
              ? "opacity-50 cursor-not-allowed" 
              : "hover:scale-105 active:scale-95"}
          `}
        >
          {conversation.isActive 
            ? "🔴 Stop Assistant" 
            : "🎤 Start ElevenLabs Assistant"}
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
              conversation.isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
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
              conversation.isProcessingLLM ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">LLM</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              conversation.isSpeaking ? 'bg-purple-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-gray-700 dark:text-gray-300">TTS</span>
          </div>
        </div>
      )}

      {/* Current Interaction */}
      {conversation.isActive && (
        <div className="w-full space-y-4">
          {/* User Input */}
          {conversation.currentInput && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                You said:
              </div>
              <div className="text-blue-800 dark:text-blue-300">
                {conversation.currentInput}
              </div>
            </div>
          )}

          {/* Assistant Response */}
          {conversation.currentResponse && (
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1 flex items-center gap-2">
                ElevenLabs Assistant:
                {conversation.isProcessingLLM && (
                  <span className="text-xs px-2 py-1 bg-blue-200 dark:bg-blue-800 rounded">
                    Thinking...
                  </span>
                )}
                {conversation.isSpeaking && (
                  <span className="text-xs px-2 py-1 bg-purple-200 dark:bg-purple-800 rounded animate-pulse">
                    Speaking
                  </span>
                )}
              </div>
              <div className="text-purple-800 dark:text-purple-300 whitespace-pre-wrap">
                {conversation.currentResponse}
                {conversation.isProcessingLLM && (
                  <span className="animate-pulse">|</span>
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
              className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Stats & Conversation History */}
      {conversation.isActive && conversation.stats.totalMessages > 0 && (
        <div className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Conversation Stats
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Total Messages</div>
              <div className="text-2xl font-bold text-purple-600">{conversation.stats.totalMessages}</div>
            </div>
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Last Response</div>
              <div className="text-2xl font-bold text-green-600">
                {conversation.stats.lastResponseTime}ms
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Avg Response</div>
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(conversation.stats.avgResponseTime)}ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Messages */}
      {conversation.messages.length > 0 && (
        <div className="w-full">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Conversation History
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {conversation.messages
              .slice(-6)
              .map((message, index) => (
              <div
                key={index}
                className={`p-2 rounded text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                }`}
              >
                <strong className="capitalize">{message.role}:</strong> {message.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {conversation.error && (
        <div className="w-full p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="text-sm text-red-700 dark:text-red-300">
            {conversation.error}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
        <p className="mb-2">
          This voice AI assistant uses ElevenLabs APIs directly for high-quality speech recognition, 
          processing, and natural voice synthesis with 5,000+ available voices.
        </p>
        <p>
          <strong>Features:</strong> Real-time STT • Advanced TTS • Voice Selection • Full Conversation History
        </p>
        <p className="mt-2 text-xs">
          <strong>API Costs:</strong> Speech-to-text and text-to-speech usage will be billed to your ElevenLabs account
        </p>
      </div>
    </div>
  );
}