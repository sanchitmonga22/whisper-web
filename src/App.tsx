import { AudioManager } from "./components/AudioManager";
import Transcript from "./components/Transcript";
import { useTranscriber } from "./hooks/useTranscriber";

function App() {
    const transcriber = useTranscriber();

    return (
        <div className='flex flex-col justify-center items-center min-h-screen'>
            <div className='container flex flex-col justify-center items-center'>
                <h1 className='text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl text-center'>
                    Whisper Web
                </h1>
                <h2 className='mt-3 mb-5 px-4 text-center text-1xl font-semibold tracking-tight text-slate-900 sm:text-2xl'>
                    Transcribe speech directly in your browser!
                </h2>
                <AudioManager transcriber={transcriber} />
                <Transcript transcribedData={transcriber.output} />
            </div>

            <footer className='text-center my-4'>
                <b>The transcription is performed locally on your device. Your data remains private.</b>
                <br/>Created by {" "}
                <a
                    className='underline'
                    href='https://github.com/PierreMesure/whisper-web'
                >
                    Pierre Mesure
                </a> based on a demo by {" "}
                <a
                    className='underline'
                    href='https://github.com/Xenova/whisper-web'
                >
                    Xenova
                </a> ♥️
            </footer>
        </div>
    );
}

export default App;
