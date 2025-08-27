import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TestElevenLabs from "./TestElevenLabs";
import "./css/index.css";
import './i18n.ts'

// Check URL for test mode
const urlParams = new URLSearchParams(window.location.search);
const isTestMode = urlParams.get('test') === 'elevenlabs';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        {isTestMode ? <TestElevenLabs /> : <App />}
    </React.StrictMode>,
);
