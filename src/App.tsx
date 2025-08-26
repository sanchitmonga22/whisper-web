import { t } from "i18next";
import { AudioManager } from "./components/AudioManager";
import Transcript from "./components/Transcript";
import { useTranscriber } from "./hooks/useTranscriber";
import { Trans, useTranslation } from "react-i18next";
import LanguageSelector from "./components/LanguageSelector";
import StreamingTranscriber from "./components/StreamingTranscriber";
import StreamingTranscriberWithVAD from "./components/StreamingTranscriberWithVAD";
import ThemeToggle from "./components/ThemeToggle";
import { useEffect, useState } from "react";

function App() {
    const transcriber = useTranscriber();

    const { i18n } = useTranslation();
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
    const [mode, setMode] = useState<'classic' | 'streaming' | 'vad'>('vad');

    const handleChangeLanguage = (newLanguage: string) => {
        setCurrentLanguage(newLanguage);
        i18n.changeLanguage(newLanguage);
    };

    useEffect(() => {
        setCurrentLanguage(i18n.language);
    }, [i18n.language]);

    return (
        <>
        <ThemeToggle />
        <div className='flex flex-col justify-center items-center min-h-screen py-4 bg-white dark:bg-slate-900 transition-colors'>
            <div className='container flex flex-col justify-center items-center'>
                <h1 className='text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-7xl text-center'>
                    {t('app.title')}
                </h1>
                <h2 className='mt-3 mb-5 px-4 text-center text-1xl font-semibold tracking-tight text-slate-900 dark:text-slate-200 sm:text-2xl'>
                    {t('app.subtitle')}
                </h2>
                
                {/* Mode Toggle */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setMode('vad')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            mode === 'vad' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        VAD Streaming
                    </button>
                    <button
                        onClick={() => setMode('streaming')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            mode === 'streaming' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        Continuous Streaming
                    </button>
                    <button
                        onClick={() => setMode('classic')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            mode === 'classic' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        Classic Mode
                    </button>
                </div>

                {mode === 'vad' ? (
                    <StreamingTranscriberWithVAD transcriber={transcriber} />
                ) : mode === 'streaming' ? (
                    <StreamingTranscriber transcriber={transcriber} />
                ) : (
                    <>
                        <AudioManager transcriber={transcriber} />
                        <Transcript transcribedData={transcriber.output} />
                    </>
                )}
            </div>

            <footer className='text-center m-4 text-slate-700 dark:text-slate-300'>
                <b>{t('app.footer')}</b>
                <br/>
                <Trans
                  i18nKey="app.footer_credits"
                  components={{
                    authorLink: <a className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300" href="https://github.com/PierreMesure/whisper-web" />,
                    demoLink: <a className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300" href="https://github.com/Xenova/whisper-web" />
                  }}
                />
            </footer>
        </div>
        <LanguageSelector
            className='fixed bottom-4 right-16'
            currentLanguage={currentLanguage}
            onChangeLanguage={handleChangeLanguage}
        />
        </>
    );
}

export default App;
