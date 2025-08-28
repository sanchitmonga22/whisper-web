# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Development
```bash
npm run dev          # Start Vite dev server on http://localhost:5173/web-demo/
npm run build        # TypeScript check + Vite production build
npm run preview      # Preview production build locally
```

### Code Quality
```bash
npm run lint         # Run ESLint with TypeScript support
npm run format       # Format code with Prettier (src/**/*.{js,ts,tsx,css})
npm run clean        # Remove node_modules and dist directories
```

### TypeScript Compilation
```bash
npx tsc --noEmit     # Type-check without emitting files
```

## Architecture Overview

### Application Structure
This is a **dual-pipeline voice AI comparison platform** built with React, TypeScript, and Vite. The app presents two voice AI solutions side-by-side:

1. **RunAnywhere Voice AI (Left Panel)**: Hybrid approach using local STT (Moonshine/Whisper) → Cloud LLM (OpenAI) → Local TTS (Piper)
2. **ElevenLabs AI (Right Panel)**: Fully cloud-based conversational AI using ElevenLabs APIs

### Core Technologies
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite with base path `/web-demo/`
- **Styling**: Tailwind CSS v4 with dark/light mode support
- **STT Engines**: Moonshine (WebGPU-optimized) and Whisper (CPU-focused) via Transformers.js
- **VAD**: Silero V5 via `@ricky0123/vad-web` for automatic speech detection
- **TTS**: Piper TTS (local) and browser SpeechSynthesis API
- **LLM**: OpenAI GPT-4 for RunAnywhere pipeline, ElevenLabs conversational AI for cloud pipeline

### Key Components and Hooks

#### Main Components
- `App.tsx`: Root component with split-view layout for side-by-side comparison
- `VoiceAssistant.tsx`: RunAnywhere Voice AI interface with STT engine selection and performance metrics
- `ElevenLabsAssistant.tsx`: ElevenLabs cloud AI interface with integrated conversation API

#### Critical Hooks
- `useMoonshineConversation.ts`: Moonshine STT with integrated VAD, WebGPU/WASM support
- `useElevenLabsConversation.ts`: ElevenLabs conversation API integration
- `useTTSWithPiper.ts`: Piper TTS service for local voice synthesis
- `useLLMStreaming.ts`: OpenAI streaming integration for RunAnywhere pipeline

### Voice Processing Pipeline

Both pipelines follow this general flow:
1. **VAD Detection**: Silero V5 detects speech start/end
2. **Audio Capture**: Records audio at 16kHz sample rate
3. **STT Processing**: Converts speech to text (local or cloud)
4. **LLM Processing**: Generates response via AI
5. **TTS Synthesis**: Converts response to speech
6. **Performance Tracking**: Measures each pipeline stage

### Important Configuration

#### Environment Variables
Required API keys (create `.env` file):
```
VITE_OPENAI_API_KEY=your_key
VITE_ELEVENLABS_API_KEY=your_key
```

#### VAD Configuration
Shared across both engines (see hooks for tuning):
- `positiveSpeechThreshold`: 0.5
- `negativeSpeechThreshold`: 0.35
- `redemptionFrames`: 24
- `minSpeechFrames`: 9

#### Model Selection
- **Moonshine**: `onnx-community/moonshine-tiny-ONNX` (31MB) or `moonshine-base-ONNX` (218MB)
- **Whisper**: `onnx-community/whisper-tiny` (39MB, forced for stability)
- **Quantization**: q4, q8, or fp32 based on device capabilities

### Performance Considerations

1. **WebGPU Detection**: Moonshine auto-selects WebGPU when available, falls back to WASM
2. **Model Caching**: Transformers.js caches models locally after first download
3. **Audio Context**: Persistent contexts reduce initialization overhead
4. **Echo Prevention**: VAD pauses during TTS playback to prevent feedback loops
5. **Concurrent Processing**: Avoid overlapping STT requests using `isTranscribingRef` guards

### Testing Approach
No formal test framework is configured. Manual testing via:
1. Run `npm run dev` and test voice interactions
2. Check browser console for performance metrics
3. Verify TypeScript compilation with `npx tsc --noEmit`
4. Ensure code quality with `npm run lint`

### Key Files to Understand

For voice pipeline modifications:
- `src/hooks/useMoonshineConversation.ts`: Core Moonshine STT implementation
- `src/hooks/useElevenLabsConversation.ts`: ElevenLabs integration
- `src/services/piperTTSService.ts`: Piper TTS web worker service
- `docs/SPEECH_ARCHITECTURE.md`: Detailed technical documentation

For UI/UX changes:
- `src/components/VoiceAssistant.tsx`: Main voice interface component
- `src/App.tsx`: Layout and component structure
- `tailwind.config.js`: Theme configuration