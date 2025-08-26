import React, { useEffect, useState, useCallback, JSX } from "react";
import axios from "axios";
import Modal from "./modal/Modal";
import { UrlInput } from "./modal/UrlInput";
import AudioPlayer from "./AudioPlayer";
import { TranscribeButton } from "./TranscribeButton";
import Constants, {
    AudioSource,
    DTYPES,
    LANGUAGES,
    MODELS,
} from "../utils/Constants";
import { Transcriber } from "../hooks/useTranscriber";
import Progress from "./Progress";
import AudioRecorder from "./AudioRecorder";
import { t } from "i18next";
import { Trans, useTranslation } from "react-i18next";

function titleCase(str: string) {
    str = str.toLowerCase();
    return (str.match(/\w+.?/g) || [])
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join("");
}

export function AudioManager(props: { transcriber: Transcriber }) {
    const [progress, setProgress] = useState<number | undefined>(0);
    const [audioData, setAudioData] = useState<
        | {
              buffer: AudioBuffer;
              url: string;
              source: AudioSource;
              mimeType: string;
          }
        | undefined
    >(undefined);
    const [audioDownloadUrl, setAudioDownloadUrl] = useState<
        string | undefined
    >(undefined);

    const resetAudio = () => {
        setAudioData(undefined);
        setAudioDownloadUrl(undefined);
    };

    const setAudioFromDownload = async (
        data: ArrayBuffer,
        mimeType: string,
    ) => {
        const audioCTX = new AudioContext({
            sampleRate: Constants.SAMPLING_RATE,
        });
        const blobUrl = URL.createObjectURL(
            new Blob([data], { type: "audio/*" }),
        );
        const decoded = await audioCTX.decodeAudioData(data);
        setAudioData({
            buffer: decoded,
            url: blobUrl,
            source: AudioSource.URL,
            mimeType: mimeType,
        });
    };

    const setAudioFromRecording = async (data: Blob) => {
        resetAudio();
        setProgress(0);
        const blobUrl = URL.createObjectURL(data);
        const fileReader = new FileReader();
        fileReader.onprogress = (event) => {
            setProgress(event.loaded / event.total || 0);
        };
        fileReader.onloadend = async () => {
            const audioCTX = new AudioContext({
                sampleRate: Constants.SAMPLING_RATE,
            });
            const arrayBuffer = fileReader.result as ArrayBuffer;
            const decoded = await audioCTX.decodeAudioData(arrayBuffer);
            setProgress(undefined);
            setAudioData({
                buffer: decoded,
                url: blobUrl,
                source: AudioSource.RECORDING,
                mimeType: data.type,
            });
        };
        fileReader.readAsArrayBuffer(data);
    };

    const downloadAudioFromUrl = useCallback(
        async (requestAbortController: AbortController) => {
            if (audioDownloadUrl) {
                try {
                    setAudioData(undefined);
                    setProgress(0);
                    const { data, headers } = (await axios.get(
                        audioDownloadUrl,
                        {
                            signal: requestAbortController.signal,
                            responseType: "arraybuffer",
                            onDownloadProgress(progressEvent) {
                                setProgress(progressEvent.progress || 0);
                            },
                        },
                    )) as {
                        data: ArrayBuffer;
                        headers: { "content-type": string };
                    };

                    let mimeType = headers["content-type"];
                    if (!mimeType || mimeType === "audio/wave") {
                        mimeType = "audio/wav";
                    }
                    setAudioFromDownload(data, mimeType);
                } catch (error) {
                    console.log("Request failed or aborted", error);
                    setProgress(undefined);
                }
            }
        },
        [audioDownloadUrl],
    );

    // When URL changes, download audio
    useEffect(() => {
        if (audioDownloadUrl) {
            const requestAbortController = new AbortController();
            downloadAudioFromUrl(requestAbortController);
            return () => {
                requestAbortController.abort();
            };
        }
    }, [audioDownloadUrl, downloadAudioFromUrl]);

    return (
        <>
            <div className='flex flex-col justify-center items-center rounded-lg bg-white shadow-xl shadow-black/5 ring-1 ring-slate-700/10'>
                <div className='flex flex-row space-x-2 py-2 w-full px-2'>
                    <UrlTile
                        icon={<AnchorIcon />}
                        text={t("manager.from_url")}
                        onUrlUpdate={(e) => {
                            props.transcriber.onInputChange();
                            setAudioDownloadUrl(e);
                        }}
                    />
                    <VerticalBar />
                    <FileTile
                        icon={<FolderIcon />}
                        text={t("manager.from_file")}
                        onFileUpdate={(decoded, blobUrl, mimeType) => {
                            props.transcriber.onInputChange();
                            setAudioData({
                                buffer: decoded,
                                url: blobUrl,
                                source: AudioSource.FILE,
                                mimeType: mimeType,
                            });
                        }}
                    />
                    {navigator.mediaDevices && (
                        <>
                            <VerticalBar />
                            <RecordTile
                                icon={<MicrophoneIcon />}
                                text={t("manager.record")}
                                setAudioData={(e) => {
                                    props.transcriber.onInputChange();
                                    setAudioFromRecording(e);
                                }}
                            />
                        </>
                    )}
                </div>
                <AudioDataBar
                    progress={
                        progress !== undefined && audioData
                            ? 1
                            : (progress ?? 0)
                    }
                />
            </div>

            {audioData && (
                <>
                    <AudioPlayer
                        audioUrl={audioData.url}
                        mimeType={audioData.mimeType}
                    />

                    <div className='relative w-full flex justify-center items-center'>
                        <TranscribeButton
                            onClick={() => {
                                props.transcriber.start(audioData.buffer);
                            }}
                            isModelLoading={props.transcriber.isModelLoading}
                            isTranscribing={props.transcriber.isBusy}
                        />
                    </div>
                    {props.transcriber.progressItems.length > 0 && (
                        <div className='relative z-10 p-4 w-full text-center'>
                            <label className="text-slate-900 dark:text-slate-100">{t("manager.loading")}</label>
                            {props.transcriber.progressItems.map((data) => (
                                <div key={data.file}>
                                    <Progress
                                        text={data.file}
                                        percentage={data.progress}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            <InfoTile
                className='fixed bottom-4 right-28 z-20'
                icon={<InfoIcon />}
                title={t("manager.info_title")}
                content={
                    <Trans i18nKey='manager.info_content'>
                        Whisper-web is a small website to help you transcribe
                        audio speech into text.
                        <br />
                        The first time you give it a file, it will download an
                        open AI model and perform the transcription locally in
                        your browser. This means that your audio file never
                        leaves your device. It also means that the transcription
                        will be slow or fail if your computer/smartphone is not
                        powerful enough to perform it. In the settings (bottom
                        right corner), you can pick among different models and
                        various quantisation levels. A smaller model with a
                        lower quantisation will be faster but make more
                        mistakes. By default, Whisper-web uses small models but
                        you can try a bigger one and see if it works on your
                        device. For most languages, it is best to use{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://openai.com/index/whisper/'
                        >
                            OpenAI's official models
                        </a>{" "}
                        (Multilingual) but for Swedish or Norwegian, it is
                        recommended to use versions that have been specifically
                        trained for them. The Swedish models are called{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://huggingface.co/KBLab/kb-whisper-tiny'
                        >
                            KB-whisper
                        </a>{" "}
                        and have been trained by the{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://kb.se/samverkan-och-utveckling/nytt-fran-kb/nyheter-samverkan-och-utveckling/2025-02-20-valtranad-ai-modell-forvandlar-tal-till-text.html'
                        >
                            national library
                        </a>{" "}
                        on data from parliament debates and the Swedish public
                        service. The Norwegian ones are named{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://huggingface.co/collections/NbAiLab/nb-whisper-65cb8322877f943912afcd9f'
                        >
                            nb-whisper
                        </a>{" "}
                        and have also been trained by the country's{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://arxiv.org/abs/2402.01917'
                        >
                            national library
                        </a>
                        . This project's source code is available on{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://github.com/PierreMesure/whisper-web'
                        >
                            Github
                        </a>
                        . Feel free to reuse or contribute to it. The website is
                        hosted on{" "}
                        <a
                            className='underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'
                            target='_blank'
                            href='https://www.statichost.eu'
                        >
                            statichost.eu
                        </a>
                        , a privacy-friendly service to host static sites.
                    </Trans>
                }
            />
            <SettingsTile
                className='fixed bottom-4 right-4'
                transcriber={props.transcriber}
                icon={<SettingsIcon />}
            />
        </>
    );
}

function InfoTile(props: {
    icon: JSX.Element;
    className?: string;
    title: string;
    content: string | JSX.Element;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    return (
        <div className={props.className}>
            <Tile icon={props.icon} onClick={onClick} />
            <Modal
                show={showModal}
                submitEnabled={false}
                onClose={onClose}
                title={props.title}
                content={props.content}
            />
        </div>
    );
}

function SettingsTile(props: {
    icon: JSX.Element;
    className?: string;
    transcriber: Transcriber;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    const onSubmit = () => {
        onClose();
    };

    return (
        <div className={props.className}>
            <Tile icon={props.icon} onClick={onClick} />
            <SettingsModal
                show={showModal}
                onSubmit={onSubmit}
                onClose={onClose}
                transcriber={props.transcriber}
            />
        </div>
    );
}

function SettingsModal(props: {
    show: boolean;
    onSubmit: (url: string) => void;
    onClose: () => void;
    transcriber: Transcriber;
}) {
    const names = Object.values(LANGUAGES).map(titleCase);

    const [isMultilingual, setIsMultilingual] = useState(false);

    useEffect(() => {
        const model = props.transcriber.model;
        const isModelMultilingual =
            !model.endsWith(".en") && MODELS[model] && MODELS[model][1] === "";
        setIsMultilingual(isModelMultilingual);
    }, [props.transcriber.model]);

    // @ts-expect-error navigator.gpu not yet supported
    const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

    const [cacheSize, setCacheSize] = useState<number>(0);

    async function fetchCacheSize() {
        if ("storage" in navigator && "estimate" in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const usage = Number(estimate.usage);
            setCacheSize(~~(usage / 1000000));
        } else {
            setCacheSize(-1);
        }
    }

    fetchCacheSize();

    // Get the language code of the selected model
    const getModelLanguage = () => {
        if (props.transcriber.model in MODELS) {
            const [, lang] = MODELS[props.transcriber.model];
            return lang || props.transcriber.language;
        }
        return props.transcriber.language;
    };

    return (
        <Modal
            show={props.show}
            title={t("manager.settings")}
            content={
                <>
                    <label>{t("manager.select_model")}</label>
                    <select
                        className='mt-1 mb-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                        value={props.transcriber.model}
                        onChange={(e) => {
                            props.transcriber.setModel(e.target.value);
                        }}
                    >
                        {Object.entries(
                            // Create a mapping of display names to full model keys
                            Object.entries(MODELS).reduce(
                                (acc, [modelKey, [displayName, group]]) => {
                                    const groupName =
                                        group &&
                                        LANGUAGES[
                                            group as keyof typeof LANGUAGES
                                        ]
                                            ? titleCase(
                                                  LANGUAGES[
                                                      group as keyof typeof LANGUAGES
                                                  ],
                                              )
                                            : "Multilingual";
                                    acc[groupName] = acc[groupName] || [];
                                    // Store both the display name and the full model key
                                    acc[groupName].push([
                                        displayName,
                                        modelKey,
                                        group,
                                    ]);
                                    return acc;
                                },
                                {} as {
                                    [group: string]: [string, string, string][];
                                },
                            ),
                        ).map(([group, models]) => (
                            <optgroup key={group} label={group}>
                                {models.map(([displayName, modelKey]) => (
                                    <option key={modelKey} value={modelKey}>
                                        {displayName}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <select
                        className='mt-1 mb-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                        defaultValue={props.transcriber.dtype}
                        onChange={(e) => {
                            props.transcriber.setDtype(e.target.value);
                        }}
                    >
                        {DTYPES.map((value, index) => (
                            <option key={index} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                    <div className='flex justify-between items-center mb-3 px-1'>
                        <div className='flex'>
                            <input
                                id='gpu'
                                type='checkbox'
                                checked={props.transcriber.gpu}
                                disabled={!IS_WEBGPU_AVAILABLE}
                                onChange={(e) => {
                                    props.transcriber.setGPU(e.target.checked);
                                }}
                            ></input>
                            <label htmlFor={"gpu"} className='ms-1'>
                                {IS_WEBGPU_AVAILABLE
                                    ? t("manager.gpu")
                                    : t("manager.gpu_disabled")}
                            </label>
                        </div>
                    </div>

                    <label>{t("manager.select_language")}</label>
                    <select
                        className='mt-1 mb-3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
                        value={
                            isMultilingual
                                ? props.transcriber.language
                                : getModelLanguage()
                        }
                        onChange={(e) => {
                            props.transcriber.setLanguage(e.target.value);
                        }}
                        disabled={!isMultilingual}
                    >
                        {Object.keys(LANGUAGES).map((key, i) => (
                            <option key={key} value={key}>
                                {names[i]}
                            </option>
                        ))}
                    </select>

                    <label>{t("manager.select_task")}</label>
                    <select
                        className='mt-1 mb-3 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
                        value={
                            isMultilingual
                                ? props.transcriber.subtask
                                : "transcribe"
                        }
                        onChange={(e) => {
                            props.transcriber.setSubtask(e.target.value);
                        }}
                        disabled={!isMultilingual}
                    >
                        <option value={"transcribe"}>
                            {t("manager.transcribe")}
                        </option>
                        <option value={"translate"}>
                            {t("manager.translate")}
                        </option>
                    </select>
                </>
            }
            onClose={props.onClose}
            onSubmit={() => {}}
            cacheSize={cacheSize}
        />
    );
}

function VerticalBar() {
    return <div className='w-[1px] bg-slate-200 dark:bg-slate-600'></div>;
}

function AudioDataBar(props: { progress: number }) {
    return <ProgressBar progress={`${Math.round(props.progress * 100)}%`} />;
}

function ProgressBar(props: { progress: string }) {
    return (
        <div className='w-full rounded-full h-1 bg-gray-200 dark:bg-gray-700'>
            <div
                className='bg-blue-600 h-1 rounded-full transition-all duration-100'
                style={{ width: props.progress }}
            ></div>
        </div>
    );
}

function UrlTile(props: {
    icon: JSX.Element;
    text: string;
    onUrlUpdate: (url: string) => void;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    const onSubmit = (url: string) => {
        props.onUrlUpdate(url);
        onClose();
    };
    return (
        <>
            <Tile icon={props.icon} text={props.text} onClick={onClick} />
            <UrlModal show={showModal} onSubmit={onSubmit} onClose={onClose} />
        </>
    );
}

function UrlModal(props: {
    show: boolean;
    onSubmit: (url: string) => void;
    onClose: () => void;
}) {
    const { i18n } = useTranslation();
    const [url, setUrl] = useState(Constants.getDefaultAudioUrl(i18n.language));

    useEffect(() => {
        setUrl(Constants.getDefaultAudioUrl(i18n.language));
    }, [i18n.language]);

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(event.target.value);
    };

    const onSubmit = () => {
        props.onSubmit(url);
    };

    return (
        <Modal
            show={props.show}
            title={t("manager.from_url")}
            content={
                <>
                    {t("manager.from_url_description")}
                    <UrlInput onChange={onChange} value={url} />
                </>
            }
            onClose={props.onClose}
            submitText={t("manager.submit")}
            onSubmit={onSubmit}
        />
    );
}

function FileTile(props: {
    icon: JSX.Element;
    text: string;
    onFileUpdate: (
        decoded: AudioBuffer,
        blobUrl: string,
        mimeType: string,
    ) => void;
}) {
    // Create hidden input element
    const elem = document.createElement("input");
    elem.type = "file";
    elem.oninput = (event) => {
        // Make sure we have files to use
        const files = (event.target as HTMLInputElement).files;
        if (!files) return;

        // Create a blob that we can use as an src for our audio element
        const urlObj = URL.createObjectURL(files[0]);
        const mimeType = files[0].type;

        const reader = new FileReader();
        reader.addEventListener("load", async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer; // Get the ArrayBuffer
            if (!arrayBuffer) return;

            const audioCTX = new AudioContext({
                sampleRate: Constants.SAMPLING_RATE,
            });

            const decoded = await audioCTX.decodeAudioData(arrayBuffer);

            props.onFileUpdate(decoded, urlObj, mimeType);
        });
        reader.readAsArrayBuffer(files[0]);

        // Reset files
        elem.value = "";
    };

    return (
        <Tile
            icon={props.icon}
            text={props.text}
            onClick={() => elem.click()}
        />
    );
}

function RecordTile(props: {
    icon: JSX.Element;
    text: string;
    setAudioData: (data: Blob) => void;
}) {
    const [showModal, setShowModal] = useState(false);

    const onClick = () => {
        setShowModal(true);
    };

    const onClose = () => {
        setShowModal(false);
    };

    const onSubmit = (data: Blob | undefined) => {
        if (data) {
            props.setAudioData(data);
            onClose();
        }
    };

    return (
        <>
            <Tile icon={props.icon} text={props.text} onClick={onClick} />
            <RecordModal
                show={showModal}
                onSubmit={onSubmit}
                onProgress={() => {}}
                onClose={onClose}
            />
        </>
    );
}

function RecordModal(props: {
    show: boolean;
    onProgress: (data: Blob | undefined) => void;
    onSubmit: (data: Blob | undefined) => void;
    onClose: () => void;
}) {
    const [audioBlob, setAudioBlob] = useState<Blob>();

    const onRecordingComplete = (blob: Blob) => {
        setAudioBlob(blob);
    };

    const onSubmit = () => {
        props.onSubmit(audioBlob);
        setAudioBlob(undefined);
    };

    const onClose = () => {
        props.onClose();
        setAudioBlob(undefined);
    };

    return (
        <Modal
            show={props.show}
            title={t("manager.record")}
            content={
                <>
                    {t("manager.record_description")}
                    <AudioRecorder
                        onRecordingProgress={(blob) => {
                            props.onProgress(blob);
                        }}
                        onRecordingComplete={onRecordingComplete}
                    />
                </>
            }
            onClose={onClose}
            submitText={t("manager.submit")}
            submitEnabled={audioBlob !== undefined}
            onSubmit={onSubmit}
        />
    );
}

function Tile(props: {
    icon: JSX.Element;
    text?: string;
    onClick?: () => void;
}) {
    return (
        <button
            onClick={props.onClick}
            className='flex items-center justify-center rounded-lg p-2 bg-blue text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all duration-200 mr-0'
        >
            <div className='w-7 h-7'>{props.icon}</div>
            {props.text && (
                <div className='ml-2 break-text text-center text-md mw-30'>
                    {props.text}
                </div>
            )}
        </button>
    );
}

function AnchorIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.5'
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
            />
        </svg>
    );
}

function FolderIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.5'
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776'
            />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.75'
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z'
            />
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
            />
        </svg>
    );
}

function InfoIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='currentColor'
        >
            <path d='M12 17q.425 0 .713-.288T13 16v-4q0-.425-.288-.712T12 11t-.712.288T11 12v4q0 .425.288.713T12 17m0-8q.425 0 .713-.288T13 8t-.288-.712T12 7t-.712.288T11 8t.288.713T12 9m0 13q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22m0-2q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4T6.325 6.325T4 12t2.325 5.675T12 20m0-8'></path>
        </svg>
    );
}

function MicrophoneIcon() {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth={1.5}
            stroke='currentColor'
        >
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z'
            />
        </svg>
    );
}
