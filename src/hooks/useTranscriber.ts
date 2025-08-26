import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorker } from "./useWorker";
import { useTranslation } from "react-i18next";
import Constants from "../utils/Constants";

interface ProgressItem {
    file: string;
    loaded: number;
    progress: number;
    total: number;
    name: string;
    status: string;
}

interface TranscriberUpdateData {
    data: {
        text: string;
        chunks: { text: string; timestamp: [number, number | null] }[];
        tps: number;
    };
}

export interface TranscriberData {
    isBusy: boolean;
    tps?: number;
    text: string;
    chunks: { text: string; timestamp: [number, number | null] }[];
}

export interface Transcriber {
    onInputChange: () => void;
    isBusy: boolean;
    isModelLoading: boolean;
    progressItems: ProgressItem[];
    start: (audioData: AudioBuffer | undefined) => void;
    output?: TranscriberData;
    model: string;
    setModel: (model: string) => void;
    dtype: string;
    setDtype: (dtype: string) => void;
    gpu: boolean;
    setGPU: (gpu: boolean) => void;
    subtask: string;
    setSubtask: (subtask: string) => void;
    language?: string;
    setLanguage: (language: string) => void;
}

export function useTranscriber(): Transcriber {
    const [transcript, setTranscript] = useState<TranscriberData | undefined>(
        undefined,
    );
    const [isBusy, setIsBusy] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);

    const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);

    const webWorker = useWorker((event) => {
        const message = event.data;
        console.log("[useTranscriber] Web worker message received:", message.status, message);
        // Update the state with the result
        switch (message.status) {
            case "progress":
                // Model file progress: update one of the progress items.
                setProgressItems((prev) =>
                    prev.map((item) => {
                        if (item.file === message.file) {
                            return { ...item, progress: message.progress };
                        }
                        return item;
                    }),
                );
                break;
            case "update":
            case "complete": {
                const busy = message.status === "update";
                const updateMessage = message as TranscriberUpdateData;
                console.log("[useTranscriber] Transcription update/complete:", {
                    text: updateMessage.data.text,
                    chunks: updateMessage.data.chunks,
                    tps: updateMessage.data.tps
                });
                setTranscript({
                    isBusy: busy,
                    text: updateMessage.data.text,
                    tps: updateMessage.data.tps,
                    chunks: updateMessage.data.chunks,
                });
                setIsBusy(busy);
                break;
            }
            case "initiate":
                // Model file start load: add a new progress item to the list.
                console.log("[useTranscriber] Model loading initiated");
                setIsModelLoading(true);
                setProgressItems((prev) => [...prev, message]);
                break;
            case "ready":
                console.log("[useTranscriber] Model ready");
                setIsModelLoading(false);
                break;
            case "error":
                console.error("[useTranscriber] Error from worker:", message.data);
                setIsBusy(false);
                alert(
                    `An error occurred: "${message.data.message}". Please file a bug report.`,
                );
                break;
            case "done":
                // Model file loaded: remove the progress item from the list.
                console.log("[useTranscriber] File loaded:", message.file);
                setProgressItems((prev) =>
                    prev.filter((item) => item.file !== message.file),
                );
                break;

            default:
                // initiate/download/done
                console.log("[useTranscriber] Unhandled message status:", message.status);
                break;
        }
    });

    const { i18n } = useTranslation();

    const [model, setModel] = useState<string>(
        Constants.getDefaultModel(i18n.language),
    );

    const [subtask, setSubtask] = useState<string>(Constants.DEFAULT_SUBTASK);
    const [dtype, setDtype] = useState<string>(Constants.DEFAULT_DTYPE);
    const [gpu, setGPU] = useState<boolean>(Constants.DEFAULT_GPU);
    const [language, setLanguage] = useState<string>(
        Constants.getDefaultLanguage(i18n.language),
    );

    useEffect(() => {
        setModel(Constants.getDefaultModel(i18n.language));
        setLanguage(Constants.getDefaultLanguage(i18n.language));
    }, [i18n.language]);

    const onInputChange = useCallback(() => {
        setTranscript(undefined);
    }, []);

    const postRequest = useCallback(
        async (audioData: AudioBuffer | undefined) => {
            console.log("[useTranscriber] postRequest called with audioData:", audioData);
            if (audioData) {
                console.log("[useTranscriber] AudioBuffer details:", {
                    duration: audioData.duration,
                    length: audioData.length,
                    numberOfChannels: audioData.numberOfChannels,
                    sampleRate: audioData.sampleRate
                });
                setTranscript(undefined);
                setIsBusy(true);

                let audio;
                if (audioData.numberOfChannels === 2) {
                    const SCALING_FACTOR = Math.sqrt(2);

                    const left = audioData.getChannelData(0);
                    const right = audioData.getChannelData(1);

                    audio = new Float32Array(left.length);
                    for (let i = 0; i < audioData.length; ++i) {
                        audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
                    }
                } else {
                    // If the audio is not stereo, we can just use the first channel:
                    audio = audioData.getChannelData(0);
                }

                console.log("[useTranscriber] Sending to web worker:", {
                    audioLength: audio.length,
                    model,
                    dtype,
                    gpu,
                    subtask: !model.endsWith(".en") ? subtask : null,
                    language: !model.endsWith(".en") && language !== "auto" ? language : null,
                });

                webWorker.postMessage({
                    audio,
                    model,
                    dtype,
                    gpu,
                    subtask: !model.endsWith(".en") ? subtask : null,
                    language:
                        !model.endsWith(".en") && language !== "auto"
                            ? language
                            : null,
                });
            }
        },
        [webWorker, model, dtype, gpu, subtask, language],
    );

    const transcriber = useMemo(() => {
        return {
            onInputChange,
            isBusy,
            isModelLoading,
            progressItems,
            start: postRequest,
            output: transcript,
            model,
            setModel,
            dtype,
            setDtype,
            gpu,
            setGPU,
            subtask,
            setSubtask,
            language,
            setLanguage,
        };
    }, [
        onInputChange,
        isBusy,
        isModelLoading,
        progressItems,
        postRequest,
        transcript,
        model,
        dtype,
        gpu,
        subtask,
        language,
    ]);

    return transcriber;
}
