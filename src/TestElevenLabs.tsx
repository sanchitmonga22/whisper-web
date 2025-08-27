import ElevenLabsAssistant from './components/ElevenLabsAssistant';
import ThemeToggle from './components/ThemeToggle';

export default function TestElevenLabs() {
    return (
        <>
            <ThemeToggle />
            <div className='flex flex-col min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800'>
                <header className='w-full py-4 px-6'>
                    <h1 className='text-3xl font-bold text-center text-purple-600 dark:text-purple-400'>
                        ElevenLabs AI Test Page
                    </h1>
                </header>
                <main className='flex-1 flex items-center justify-center px-6 py-4'>
                    <div className='w-full max-w-4xl bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6'>
                        <ElevenLabsAssistant />
                    </div>
                </main>
            </div>
        </>
    );
}