import { useState, useEffect, useRef, useCallback } from "react";
import { Transcriber } from "../hooks/useTranscriber";
import Constants from "../utils/Constants";

interface StreamingTranscriberProps {
    transcriber: Transcriber;
    onTranscriptUpdate?: (text: string) => void;
}

export default function StreamingTranscriber({
    transcriber,
    onTranscriptUpdate,
}: StreamingTranscriberProps) {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingTranscript, setStreamingTranscript] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isStreamingRef = useRef<boolean>(false);
    
    const audioChunksRef = useRef<Blob[]>([]);
    const fullTranscriptRef = useRef<string>("");
    
    const CHUNK_DURATION_MS = 3000; // Process audio every 3 seconds

    const processAudioChunk = useCallback(async () => {
        console.log("[StreamingTranscriber] processAudioChunk called");
        console.log("[StreamingTranscriber] isProcessing:", isProcessing);
        console.log("[StreamingTranscriber] audioChunks length:", audioChunksRef.current.length);
        
        if (isProcessing || audioChunksRef.current.length === 0) {
            console.log("[StreamingTranscriber] Skipping processing - already processing or no chunks");
            return;
        }
        
        setIsProcessing(true);
        
        try {
            // Combine all audio chunks
            const totalSize = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
            console.log("[StreamingTranscriber] Combining audio chunks, total size:", totalSize);
            
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            audioChunksRef.current = [];
            
            // Convert blob to array buffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log("[StreamingTranscriber] ArrayBuffer size:", arrayBuffer.byteLength);
            
            // Create AudioContext if not exists
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({
                    sampleRate: Constants.SAMPLING_RATE,
                });
                console.log("[StreamingTranscriber] Created AudioContext with sample rate:", Constants.SAMPLING_RATE);
            }
            
            // Decode audio data
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            console.log("[StreamingTranscriber] Decoded audio buffer:", {
                duration: audioBuffer.duration,
                numberOfChannels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate,
                length: audioBuffer.length
            });
            
            // Send to transcriber
            console.log("[StreamingTranscriber] Sending audio to transcriber");
            transcriber.start(audioBuffer);
            
        } catch (error) {
            console.error("[StreamingTranscriber] Error processing audio chunk:", error);
        } finally {
            setIsProcessing(false);
            console.log("[StreamingTranscriber] Processing complete");
        }
    }, [transcriber, isProcessing]);

    const startStreaming = async () => {
        console.log("[StreamingTranscriber] Starting streaming...");
        try {
            // Request microphone access
            streamRef.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            console.log("[StreamingTranscriber] Got media stream", streamRef.current);

            // Create MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
            console.log("[StreamingTranscriber] Using mimeType:", mimeType);
            mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
                mimeType,
            });
            console.log("[StreamingTranscriber] MediaRecorder created");

            // Handle data available
            mediaRecorderRef.current.ondataavailable = async (event) => {
                console.log("[StreamingTranscriber] Data available, size:", event.data.size);
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    console.log("[StreamingTranscriber] Added chunk, total chunks:", audioChunksRef.current.length);
                    
                    // Process the chunk immediately when data is available
                    if (mediaRecorderRef.current?.state === "inactive") {
                        console.log("[StreamingTranscriber] Recorder stopped, processing chunk now");
                        await processAudioChunk();
                        
                        // Restart recording after processing
                        setTimeout(() => {
                            console.log("[StreamingTranscriber] Attempting to restart recorder");
                            if (isStreamingRef.current && mediaRecorderRef.current) {
                                audioChunksRef.current = [];
                                mediaRecorderRef.current.start();
                                console.log("[StreamingTranscriber] Recorder restarted");
                            }
                        }, 100);
                    }
                }
            };

            // Start recording
            mediaRecorderRef.current.start();
            console.log("[StreamingTranscriber] MediaRecorder started");

            // Set up interval to process chunks
            intervalRef.current = setInterval(() => {
                console.log("[StreamingTranscriber] Interval triggered, recorder state:", mediaRecorderRef.current?.state);
                if (mediaRecorderRef.current?.state === "recording") {
                    // Stop recorder - this will trigger ondataavailable which handles processing
                    console.log("[StreamingTranscriber] Stopping recorder to get data");
                    mediaRecorderRef.current.stop();
                    // Processing and restart will happen in ondataavailable handler
                }
            }, CHUNK_DURATION_MS);

            setIsStreaming(true);
            isStreamingRef.current = true;
            fullTranscriptRef.current = "";
            setStreamingTranscript("");
            console.log("[StreamingTranscriber] Streaming started successfully");
        } catch (error) {
            console.error("[StreamingTranscriber] Error starting streaming:", error);
            alert("Failed to access microphone. Please check permissions.");
        }
    };

    const stopStreaming = () => {
        setIsStreaming(false);
        isStreamingRef.current = false;

        // Clear interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // Stop media recorder
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current?.state === "running") {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // Stop media stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        // Clear buffers
        audioChunksRef.current = [];
    };

    // Update transcript when transcriber outputs new data
    useEffect(() => {
        console.log("[StreamingTranscriber] Transcriber output updated:", transcriber.output);
        if (transcriber.output && isStreaming) {
            const newText = transcriber.output.text;
            console.log("[StreamingTranscriber] New text from transcriber:", newText);
            if (newText && newText.trim()) {
                fullTranscriptRef.current += (fullTranscriptRef.current ? " " : "") + newText;
                setStreamingTranscript(fullTranscriptRef.current);
                onTranscriptUpdate?.(fullTranscriptRef.current);
                console.log("[StreamingTranscriber] Updated full transcript:", fullTranscriptRef.current);
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
                            ? "🔴 Stop Streaming" 
                            : "🎤 Start Streaming"}
                </button>

                {isStreaming && (
                    <div className="flex items-center gap-2">
                        <div className="animate-pulse">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {isProcessing ? "Processing..." : "Listening..."}
                        </span>
                    </div>
                )}
            </div>

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

            {streamingTranscript && (
                <div className="w-full max-w-4xl p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Live Transcript:</h3>
                    <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                        {streamingTranscript}
                    </p>
                </div>
            )}
        </div>
    );
}