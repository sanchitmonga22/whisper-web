import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2, AlertCircle, Activity, Zap } from 'lucide-react';
import { useVoiceToVoiceConversation } from '../hooks/useVoiceToVoiceConversation';

const VoiceToVoiceAssistant: React.FC = () => {
  const [apiKey, setApiKey] = useState(() => 
    localStorage.getItem('elevenlabs_api_key') || ''
  );
  const [voiceId, setVoiceId] = useState(() => 
    localStorage.getItem('elevenlabs_voice_id') || 'JBFqnCBsd6RMkjVDRZzb'
  );

  const {
    isListening,
    isProcessing,
    isSpeaking,
    isVoiceDetected,
    error,
    metrics,
    startListening,
    stopListening,
    updateConfig,
  } = useVoiceToVoiceConversation(apiKey, voiceId);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('elevenlabs_api_key', apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    if (voiceId) {
      localStorage.setItem('elevenlabs_voice_id', voiceId);
    }
  }, [voiceId]);

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const formatLatency = (ms: number) => {
    if (ms === 0) return '--';
    return `${ms.toFixed(0)}ms`;
  };

  const formatTime = (timestamp: number) => {
    if (timestamp === 0) return '--';
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-lg">
        <h2 className="text-2xl font-bold mb-2">Voice-to-Voice Assistant</h2>
        <p className="text-purple-100">
          Direct speech-to-speech conversion with minimal latency
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-b-lg p-6">
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ElevenLabs API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                updateConfig({ apiKey: e.target.value });
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter your API key"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Voice ID
            </label>
            <input
              type="text"
              value={voiceId}
              onChange={(e) => {
                setVoiceId(e.target.value);
                updateConfig({ voiceId: e.target.value });
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
              placeholder="Voice ID"
            />
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <div className="relative">
            <button
              onClick={handleToggleListening}
              disabled={!apiKey}
              className={`
                relative p-8 rounded-full transition-all duration-300 transform
                ${isListening 
                  ? isVoiceDetected 
                    ? 'bg-green-500 scale-110 animate-pulse' 
                    : 'bg-blue-500 scale-105'
                  : 'bg-purple-500 hover:bg-purple-600 hover:scale-105'
                }
                ${!apiKey ? 'opacity-50 cursor-not-allowed' : ''}
                text-white shadow-lg
              `}
            >
              {isProcessing ? (
                <Loader2 className="w-12 h-12 animate-spin" />
              ) : isListening ? (
                <MicOff className="w-12 h-12" />
              ) : (
                <Mic className="w-12 h-12" />
              )}
            </button>
            {isVoiceDetected && (
              <div className="absolute inset-0 rounded-full bg-green-400 animate-ping pointer-events-none" />
            )}
          </div>
        </div>

        <div className="text-center mb-6">
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
            {isProcessing ? (
              <span className="text-blue-600 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing voice...
              </span>
            ) : isSpeaking ? (
              <span className="text-purple-600 flex items-center justify-center gap-2">
                <Activity className="w-5 h-5 animate-pulse" />
                Speaking response...
              </span>
            ) : isListening ? (
              isVoiceDetected ? (
                <span className="text-green-600 flex items-center justify-center gap-2">
                  <Activity className="w-5 h-5 animate-pulse" />
                  Detecting voice activity...
                </span>
              ) : (
                <span className="text-blue-600 flex items-center justify-center gap-2">
                  <Mic className="w-5 h-5" />
                  Listening for voice...
                </span>
              )
            ) : (
              <span className="text-gray-600">Click microphone to start real-time conversation</span>
            )}
          </p>
          {isListening && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Speak naturally - I'll respond when you pause
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-600" />
            Performance Metrics
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Response</p>
              <p className="text-2xl font-bold text-purple-600">
                {metrics.totalInteractions > 0 && metrics.lastLatency > 0 
                  ? formatLatency(metrics.lastLatency) 
                  : '--'}
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Latency</p>
              <p className="text-2xl font-bold text-pink-600">
                {metrics.averageLatency > 0 ? formatLatency(metrics.averageLatency) : '--'}
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Interactions</p>
              <p className="text-2xl font-bold text-blue-600">
                {metrics.totalInteractions}
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Session Start</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {formatTime(metrics.conversationStartTime)}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                🚀 Real-Time Voice Processing
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Voice activity detection automatically processes your speech when you pause
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                ⚡ Single API Call
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Direct speech-to-speech reduces latency by ~60% vs traditional pipeline
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceToVoiceAssistant;