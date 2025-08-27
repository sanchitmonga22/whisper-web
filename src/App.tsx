import { useTranslation } from "react-i18next";
import LanguageSelector from "./components/LanguageSelector";
import VoiceAssistant from "./components/VoiceAssistant";
import ElevenLabsAssistant from "./components/ElevenLabsAssistant";
import ThemeToggle from "./components/ThemeToggle";
import { useEffect, useState } from "react";

function App() {

    const { i18n } = useTranslation();
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
    const [mode, setMode] = useState<'assistant' | 'elevenlabs'>('elevenlabs');

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
        <div className='flex flex-col min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-all'>
            {/* Header */}
            <header className='w-full py-8 px-6'>
                <div className='max-w-6xl mx-auto'>
                    <div className='text-center'>
                        <h1 className='text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent'>
                            WhisperWeb
                        </h1>
                        <p className='mt-3 text-lg md:text-xl text-slate-600 dark:text-slate-300'>
                            Transcribe speech directly in your browser
                        </p>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className='flex-1 flex items-center justify-center px-6 py-8'>
                <div className='w-full max-w-4xl'>
                    {/* Mode Selection Cards */}
                    <div className='grid md:grid-cols-2 gap-6 mb-8'>
                        <button
                            onClick={() => setMode('assistant')}
                            className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 ${
                                mode === 'assistant'
                                    ? 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 shadow-lg scale-105'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-green-400 hover:shadow-md'
                            }`}
                        >
                            <div className='flex flex-col items-center space-y-3'>
                                <div className={`text-5xl ${mode === 'assistant' ? 'animate-pulse' : ''}`}>
                                    🤖
                                </div>
                                <h3 className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                                    Voice Assistant
                                </h3>
                                <p className='text-sm text-center text-slate-600 dark:text-slate-400'>
                                    Local VAD + STT • Cloud LLM • Local TTS
                                </p>
                                <div className={`absolute top-3 right-3 w-3 h-3 rounded-full ${
                                    mode === 'assistant' ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                                }`} />
                            </div>
                        </button>

                        <button
                            onClick={() => setMode('elevenlabs')}
                            className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 ${
                                mode === 'elevenlabs'
                                    ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 shadow-lg scale-105'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-purple-400 hover:shadow-md'
                            }`}
                        >
                            <div className='flex flex-col items-center space-y-3'>
                                <div className={`text-5xl ${mode === 'elevenlabs' ? 'animate-pulse' : ''}`}>
                                    🎙️
                                </div>
                                <h3 className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                                    ElevenLabs AI
                                </h3>
                                <p className='text-sm text-center text-slate-600 dark:text-slate-400'>
                                    Advanced conversational AI with natural voices
                                </p>
                                <div className={`absolute top-3 right-3 w-3 h-3 rounded-full ${
                                    mode === 'elevenlabs' ? 'bg-purple-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                                }`} />
                            </div>
                        </button>
                    </div>

                    {/* Active Component */}
                    <div className='bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 md:p-8'>
                        {mode === 'elevenlabs' ? (
                            <ElevenLabsAssistant />
                        ) : (
                            <VoiceAssistant />
                        )}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className='w-full py-6 px-6 border-t border-slate-200 dark:border-slate-700'>
                <div className='max-w-6xl mx-auto text-center'>
                    <p className='text-sm font-medium text-slate-600 dark:text-slate-400'>
                        The transcription is performed locally on your device. Your data remains private.
                    </p>
                    <div className='mt-3 text-sm text-slate-500 dark:text-slate-500'>
                        Created by{' '}
                        <a 
                            href="https://github.com/RunanywhereAI/runanywhere-sdks" 
                            className='font-semibold text-blue-600 dark:text-blue-400 hover:underline'
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            Runanywhere Team
                        </a>
                        <span className='mx-2'>•</span>
                        Based on work by{' '}
                        <a 
                            href="https://github.com/PierreMesure/whisper-web" 
                            className='font-medium text-blue-600 dark:text-blue-400 hover:underline'
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            Pierre Mesure
                        </a>
                        {' & '}
                        <a 
                            href="https://github.com/Xenova/whisper-web" 
                            className='font-medium text-blue-600 dark:text-blue-400 hover:underline'
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            Xenova
                        </a>
                    </div>
                </div>
            </footer>
        </div>
        <LanguageSelector
            className='fixed bottom-6 right-6 z-50'
            currentLanguage={currentLanguage}
            onChangeLanguage={handleChangeLanguage}
        />
        </>
    );
}

export default App;
