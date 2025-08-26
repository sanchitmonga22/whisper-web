import { useState, useEffect, useRef, useCallback } from "react";
import { Transcriber } from "../hooks/useTranscriber";
import { useVAD } from "../hooks/useVAD";
import Constants from "../utils/Constants";

interface StreamingTranscriberWithVADProps {
    transcriber: Transcriber;
    onTranscriptUpdate?: (text: string) => void;
}

export default function StreamingTranscriberWithVAD({
    transcriber,
    onTranscriptUpdate,
}: StreamingTranscriberWithVADProps) {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingTranscript, setStreamingTranscript] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [mode, setMode] = useState<'vad' | 'continuous'>('vad');

    const fullTranscriptRef = useRef<string>("");
    const audioContextRef = useRef<AudioContext | null>(null);
    const processingQueueRef = useRef<Float32Array[]>([]);
    const isProcessingRef = useRef(false);

    // VAD configuration and hook
    const vad = useVAD({
        positiveSpeechThreshold: 0.9,
        negativeSpeechThreshold: 0.75,
        minSpeechDuration: 250, // 250ms minimum speech
        preSpeechPadding: 300,  // 300ms padding before speech
        model: 'v5',
        
        onSpeechStart: () => {
            console.log('[StreamingWithVAD] Speech detected - starting capture');
            setIsProcessing(true);
        },
        
        onSpeechEnd: async (audio: Float32Array) => {
            console.log('[StreamingWithVAD] Speech ended - processing audio', {
                samples: audio.length,
                duration: `${(audio.length / 16000).toFixed(2)}s`,
            });
            
            // Add to processing queue
            processingQueueRef.current.push(audio);
            processNextInQueue();
        },
        
        onVADMisfire: () => {
            console.log('[StreamingWithVAD] VAD misfire - audio too short');
            setIsProcessing(false);
        },
    });

    // Process audio queue sequentially
    const processNextInQueue = useCallback(async () => {
        if (isProcessingRef.current || processingQueueRef.current.length === 0) {
            return;
        }

        isProcessingRef.current = true;
        const audio = processingQueueRef.current.shift()!;

        try {
            // Convert Float32Array to AudioBuffer for transcriber
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({
                    sampleRate: Constants.SAMPLING_RATE,
                });
            }

            // VAD outputs 16kHz audio, but our transcriber expects SAMPLING_RATE
            const audioBuffer = audioContextRef.current.createBuffer(
                1,
                audio.length,
                16000 // VAD output sample rate
            );
            audioBuffer.copyToChannel(audio, 0);

            // If sample rates don't match, resample
            let processedBuffer = audioBuffer;
            if (Constants.SAMPLING_RATE !== 16000) {
                // Create offline context for resampling
                const offlineContext = new OfflineAudioContext(
                    1,
                    Math.floor(audio.length * Constants.SAMPLING_RATE / 16000),
                    Constants.SAMPLING_RATE
                );
                
                const source = offlineContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineContext.destination);
                source.start(0);
                
                processedBuffer = await offlineContext.startRendering();
            }

            console.log('[StreamingWithVAD] Sending to transcriber', {
                originalSampleRate: 16000,
                targetSampleRate: Constants.SAMPLING_RATE,
                duration: processedBuffer.duration,
            });

            // Send to transcriber
            transcriber.start(processedBuffer);

        } catch (error) {
            console.error('[StreamingWithVAD] Error processing audio:', error);
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
            
            // Process next in queue if available
            if (processingQueueRef.current.length > 0) {
                setTimeout(() => processNextInQueue(), 100);
            }
        }
    }, [transcriber]);

    // Start streaming with VAD
    const startStreaming = async () => {
        console.log('[StreamingWithVAD] Starting streaming with VAD');
        
        try {
            // Initialize and start VAD
            if (!vad.isInitialized) {
                await vad.initialize();
            }
            
            await vad.startListening();
            
            setIsStreaming(true);
            fullTranscriptRef.current = "";
            setStreamingTranscript("");
            processingQueueRef.current = [];
            
            console.log('[StreamingWithVAD] Streaming started successfully');
        } catch (error) {
            console.error('[StreamingWithVAD] Error starting streaming:', error);
            alert("Failed to start streaming. Please check microphone permissions.");
        }
    };

    // Stop streaming
    const stopStreaming = () => {
        console.log('[StreamingWithVAD] Stopping streaming');
        
        setIsStreaming(false);
        vad.stopListening();
        
        // Clear processing queue
        processingQueueRef.current = [];
        isProcessingRef.current = false;
        
        // Close audio context
        if (audioContextRef.current?.state === "running") {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        
        console.log('[StreamingWithVAD] Streaming stopped');
    };

    // Update transcript when transcriber outputs new data
    useEffect(() => {
        if (transcriber.output && isStreaming) {
            const newText = transcriber.output.text;
            console.log('[StreamingWithVAD] New transcription:', newText);
            
            if (newText && newText.trim()) {
                fullTranscriptRef.current += (fullTranscriptRef.current ? " " : "") + newText;
                setStreamingTranscript(fullTranscriptRef.current);
                onTranscriptUpdate?.(fullTranscriptRef.current);
            }
        }
    }, [transcriber.output, isStreaming, onTranscriptUpdate]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isStreaming) {
                stopStreaming();
            }
        };
    }, []);

    return (
        <div className="flex flex-col items-center gap-4 p-6">
            {/* Mode selector */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setMode('vad')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        mode === 'vad' 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                >
                    VAD Mode (Voice Activated)
                </button>
                <button
                    onClick={() => setMode('continuous')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        mode === 'continuous' 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                    disabled
                    title="Use the regular streaming mode for continuous recording"
                >
                    Continuous Mode
                </button>
            </div>

            {/* VAD Status Indicators */}
            {isStreaming && mode === 'vad' && (
                <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                            vad.isListening ? 'bg-green-500' : 'bg-gray-400'
                        }`}></div>
                        <span className="text-gray-700 dark:text-gray-300">VAD Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                            vad.isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
                        }`}></div>
                        <span className="text-gray-700 dark:text-gray-300">Speaking</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                            isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'
                        }`}></div>
                        <span className="text-gray-700 dark:text-gray-300">Processing</span>
                    </div>
                </div>
            )}

            {/* Main control button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={isStreaming ? stopStreaming : startStreaming}
                    disabled={transcriber.isModelLoading}
                    className={`
                        px-6 py-3 rounded-full font-semibold text-white transition-all duration-200
                        ${isStreaming 
                            ? "bg-red-500 hover:bg-red-600" 
                            : "bg-green-500 hover:bg-green-600"}
                        ${transcriber.isModelLoading 
                            ? "opacity-50 cursor-not-allowed" 
                            : "hover:scale-105 active:scale-95"}
                    `}
                >
                    {transcriber.isModelLoading 
                        ? "Loading Model..." 
                        : isStreaming 
                            ? "🔴 Stop VAD Streaming" 
                            : "🎤 Start VAD Streaming"}
                </button>

                {isStreaming && (
                    <div className="flex items-center gap-2">
                        <div className="animate-pulse">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {vad.isSpeaking 
                                ? "Detecting speech..." 
                                : isProcessing 
                                    ? "Processing..." 
                                    : "Listening for speech..."}
                        </span>
                    </div>
                )}
            </div>

            {/* Model loading progress */}
            {transcriber.progressItems.length > 0 && (
                <div className="w-full max-w-2xl">
                    {transcriber.progressItems.map((item) => (
                        <div key={item.file} className="mb-2">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Loading: {item.file}</div>
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

            {/* Live transcript display */}
            {streamingTranscript && (
                <div className="w-full max-w-4xl p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Live Transcript (VAD Enhanced):
                    </h3>
                    <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                        {streamingTranscript}
                    </p>
                </div>
            )}

            {/* VAD info */}
            {mode === 'vad' && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg max-w-2xl">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">VAD Mode Active</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                        Voice Activity Detection is enabled. The system will automatically detect when you start 
                        and stop speaking, processing only the audio segments containing speech. This reduces 
                        processing overhead and improves transcription accuracy by filtering out silence and noise.
                    </p>
                    <ul className="mt-2 text-xs text-blue-600 dark:text-blue-400 list-disc list-inside">
                        <li>Minimum speech duration: 250ms</li>
                        <li>Pre-speech padding: 300ms</li>
                        <li>Model: Silero VAD v5</li>
                        <li>Sample rate: 16kHz</li>
                    </ul>
                </div>
            )}

            {/* Error display */}
            {vad.error && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg max-w-2xl">
                    <p className="text-sm text-red-700 dark:text-red-300">{vad.error}</p>
                </div>
            )}
        </div>
    );
}