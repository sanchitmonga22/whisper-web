import { useRef, useEffect } from "react";

import { TranscriberData } from "../hooks/useTranscriber";
import { formatAudioTimestamp, formatSrtTimeRange } from "../utils/AudioUtils";
import { t } from "i18next";

interface Props {
    transcribedData: TranscriberData | undefined;
}

export default function Transcript({ transcribedData }: Props) {
    const divRef = useRef<HTMLDivElement>(null);

    const saveBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };
    const exportTXT = () => {
        const chunks = transcribedData?.chunks ?? [];
        const text = chunks
            .map((chunk) => chunk.text)
            .join("")
            .trim();

        const blob = new Blob([text], { type: "text/plain" });
        saveBlob(blob, "transcript.txt");
    };
    const exportJSON = () => {
        let jsonData = JSON.stringify(transcribedData?.chunks ?? [], null, 2);

        // post-process the JSON to make it more readable
        const regex = /( {4}"timestamp": )\[\s+(\S+)\s+(\S+)\s+\]/gm;
        jsonData = jsonData.replace(regex, "$1[$2 $3]");

        const blob = new Blob([jsonData], { type: "application/json" });
        saveBlob(blob, "transcript.json");
    };
    const exportSRT = () => {
        const chunks = transcribedData?.chunks ?? [];
        let srt = "";
        for (let i = 0; i < chunks.length; i++) {
            srt += `${i + 1}\n`;
            // TODO - Check why 2nd timestamp is number | null
            srt += `${formatSrtTimeRange(chunks[i].timestamp[0], chunks[i].timestamp[1] ?? chunks[i].timestamp[0])}\n`;
            srt += `${chunks[i].text}\n\n`;
        }
        const blob = new Blob([srt], { type: "text/plain" });
        saveBlob(blob, "transcript.srt");
    };

    const exportButtons = [
        { name: "TXT", onClick: exportTXT },
        { name: "JSON", onClick: exportJSON },
        { name: "SRT", onClick: exportSRT },
    ];

    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: "auto" });
    }, [transcribedData?.chunks]);

    return (
        <div
            ref={divRef}
            className='w-full flex flex-col mt-2 p-4 overflow-y-auto'
        >
            {transcribedData?.chunks &&
                transcribedData.chunks.map((chunk, i) => (
                    <div
                        key={`${i}-${chunk.text}`}
                        className={`w-full flex flex-row mb-2 ${transcribedData?.isBusy ? "bg-gray-100 dark:bg-gray-700" : "bg-white dark:bg-gray-800"} rounded-lg p-4 shadow-xl shadow-black/5 dark:shadow-black/20 ring-1 ring-slate-700/10 dark:ring-slate-600/20`}
                    >
                        <div className='mr-5 text-gray-500 dark:text-gray-400'>
                            {formatAudioTimestamp(chunk.timestamp[0])}
                        </div>
                        {chunk.text}
                    </div>
                ))}
            {transcribedData && !transcribedData.isBusy && (
                <div className='w-full text-center'>
                    {exportButtons.map((button, i) => (
                        <button
                            key={i}
                            onClick={button.onClick}
                            className='text-white bg-green-500 hover:bg-green-600 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-4 py-2 text-center mr-2 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800 inline-flex items-center'
                        >
                            {t("transcript.export")} {button.name}
                        </button>
                    ))}
                </div>
            )}
            {transcribedData?.tps && (
                <p className='text-sm text-center mt-4'>
                    <span className='font-semibold text-black dark:text-white'>
                        {transcribedData?.tps.toFixed(2)}
                    </span>{" "}
                    <span className='text-gray-500 dark:text-gray-400'>
                        {t("transcript.tokens_per_second")}
                    </span>
                </p>
            )}
            <div ref={endOfMessagesRef} />
        </div>
    );
}
