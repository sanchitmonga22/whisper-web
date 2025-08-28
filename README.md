# RunAnywhere Voice Pipeline

A real-time voice AI comparison platform demonstrating the capabilities of on-device AI versus cloud-based solutions. Experience the future of voice interactions with dual AI pipelines running side-by-side.

![RunAnywhere Voice Pipeline](./screenshot.png)

## Overview

RunAnywhere Voice Pipeline showcases two distinct approaches to voice AI:

- **RunAnywhere Voice AI**: Local STT (Moonshine/Whisper) → Cloud LLM → Local TTS (Piper)
- **ElevenLabs AI**: Fully cloud-based conversational AI pipeline

Compare latency, accuracy, and user experience between on-device and cloud solutions in real-time.

## Features

### Dual Voice Pipelines
- **Side-by-side comparison** of local and cloud AI solutions
- **Real-time performance metrics** for each pipeline
- **Seamless voice interactions** with automatic speech detection

### RunAnywhere Voice AI (Left Panel)
- **Local Speech-to-Text**: Choose between Moonshine (optimized) or Whisper (traditional)
- **Cloud LLM Integration**: OpenAI GPT-4 for intelligent responses
- **Local Text-to-Speech**: Piper TTS for on-device voice synthesis
- **WebGPU Acceleration**: Leverages GPU for faster processing when available

### ElevenLabs AI (Right Panel)
- **Cloud-based STT**: ElevenLabs speech recognition
- **Integrated LLM**: Built-in conversational AI
- **Premium TTS**: High-quality ElevenLabs voice synthesis
- **Unified Pipeline**: Single API for complete voice interaction

### Technical Features
- **Voice Activity Detection (VAD)**: Silero V5 for automatic speech detection
- **Multiple STT Models**: Support for tiny and base model variants
- **Quantization Options**: Choose between q4, q8, or fp32 for performance tuning
- **Performance Metrics**: Track pipeline timing from speech to response
- **Dark/Light Mode**: Adaptive UI with theme toggle
- **Progressive Web App**: Install for offline usage

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Modern browser with WebGPU support (Chrome/Edge recommended)
- API keys for:
  - OpenAI (for LLM in RunAnywhere pipeline)
  - ElevenLabs (for cloud pipeline)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/runanywhere/voice-pipeline.git
cd voice-pipeline
npm install
```

2. Set up environment variables:
Create a `.env` file with your API keys:
```
VITE_OPENAI_API_KEY=your_openai_key_here
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:5173/web-demo/](http://localhost:5173/web-demo/) in your browser

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run clean        # Clean dependencies and build
```

### Project Structure

```
src/
├── components/          # React components
│   ├── VoiceAssistant.tsx      # RunAnywhere Voice AI interface
│   ├── ElevenLabsAssistant.tsx # ElevenLabs AI interface
│   └── ThemeToggle.tsx         # Dark/light mode toggle
├── hooks/              # Custom React hooks
│   ├── useMoonshineConversation.ts  # Moonshine STT integration
│   ├── useElevenLabsConversation.ts # ElevenLabs integration
│   └── useTTSWithPiper.ts          # Piper TTS integration
├── services/           # External service integrations
│   ├── piperTTSService.ts  # Piper TTS service
│   └── elevenlabs.ts       # ElevenLabs API client
└── utils/              # Utility functions
```

### Architecture

The application implements a dual-pipeline architecture for voice processing:

1. **RunAnywhere Pipeline** (Local + Cloud Hybrid):
   - VAD detects speech → Moonshine/Whisper STT (local) → OpenAI GPT-4 (cloud) → Piper TTS (local)
   - Optimized for privacy and reduced latency

2. **ElevenLabs Pipeline** (Full Cloud):
   - VAD detects speech → ElevenLabs Conversation API → Streaming response
   - Optimized for quality and simplicity

See [docs/SPEECH_ARCHITECTURE.md](./docs/SPEECH_ARCHITECTURE.md) for detailed technical documentation.

## Deployment

### Production Build

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

### Deployment Options

1. **Static Hosting**: Deploy the `dist/` folder to any static hosting service
2. **Docker**: Use the provided Dockerfile for containerized deployment
3. **Vercel/Netlify**: Direct deployment from GitHub

### Configuration

- Base path is configured in `vite.config.ts` (currently `/web-demo/`)
- Modify for your deployment environment as needed

## Performance Optimization

### Model Selection
- **Moonshine Tiny**: Best for quick responses (31MB)
- **Moonshine Base**: Better accuracy (218MB)
- **Whisper Tiny**: Maximum compatibility (39MB)

### Device Optimization
- **WebGPU Available**: Automatically uses GPU acceleration
- **CPU Only**: Falls back to optimized WASM implementation

### Caching
- Models are cached locally after first download
- Subsequent loads are significantly faster

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Acknowledgments

- Built on the foundation of [Xenova/whisper-web](https://github.com/xenova/whisper-web)
- Powered by [Transformers.js](https://github.com/xenova/transformers.js) for on-device AI
- [Moonshine STT](https://github.com/usefulsensors/moonshine) for optimized speech recognition
- [Piper TTS](https://github.com/rhasspy/piper) for local text-to-speech
- [ElevenLabs](https://elevenlabs.io) for cloud voice AI

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/runanywhere/voice-pipeline/issues) page.

---

Built with ❤️ by [RunAnywhere AI](https://runanywhere.ai)