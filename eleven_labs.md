# ElevenLabs Speech-to-Speech API Integration in TypeScript

## Overview

ElevenLabs' Speech-to-Speech (STS) API allows you to transform audio from one voice to another while maintaining the original emotion, timing, and delivery. This is perfect for voice conversion, character voice creation, and audio editing applications.[1]

## API Endpoint and Authentication

**Base Endpoint:** `https://api.elevenlabs.io/v1/speech-to-speech/{voice_id}`[2]

**Method:** POST

**Headers Required:**
- `xi-api-key`: Your ElevenLabs API key[3]
- `Content-Type`: `multipart/form-data`[4]

## Getting Your API Key

1. Create an account at [ElevenLabs](https://elevenlabs.io)[5]
2. Navigate to Profile → API Keys in your dashboard[3]
3. Copy your API key and store it securely[6]

## Direct HTTP Implementation (TypeScript/JavaScript)

### Basic Fetch Implementation

```typescript
interface SpeechToSpeechOptions {
  voiceId: string;
  audioFile: File | Blob;
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  outputFormat?: string;
  optimizeStreamingLatency?: number;
  removeBackgroundNoise?: boolean;
}

async function speechToSpeech(options: SpeechToSpeechOptions): Promise<ArrayBuffer> {
  const {
    voiceId,
    audioFile,
    modelId = 'eleven_multilingual_sts_v2',
    voiceSettings,
    outputFormat = 'mp3_44100_128',
    optimizeStreamingLatency = 0,
    removeBackgroundNoise = false
  } = options;

  const formData = new FormData();
  formData.append('audio', audioFile);
  formData.append('model_id', modelId);
  formData.append('output_format', outputFormat);
  formData.append('optimize_streaming_latency', optimizeStreamingLatency.toString());
  formData.append('remove_background_noise', removeBackgroundNoise.toString());

  if (voiceSettings) {
    formData.append('voice_settings', JSON.stringify(voiceSettings));
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': 'YOUR_API_KEY', // Replace with your actual API key
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.arrayBuffer();
}
```

### Usage Example

```typescript
// Example usage with file input
const fileInput = document.getElementById('audioFile') as HTMLInputElement;
const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;

async function convertSpeech() {
  if (!fileInput.files?.[0]) {
    console.error('No audio file selected');
    return;
  }

  try {
    const audioBuffer = await speechToSpeech({
      voiceId: voiceSelect.value,
      audioFile: fileInput.files[0],
      voiceSettings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
      removeBackgroundNoise: true,
    });

    // Create audio blob and play
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();

  } catch (error) {
    console.error('Error converting speech:', error);
  }
}
```

## Using Official TypeScript SDK

### Installation

```bash
# For Node.js applications
npm install elevenlabs

# For browser applications  
npm install @elevenlabs/client
```

### Node.js SDK Implementation

```typescript
import { ElevenLabsClient } from 'elevenlabs';

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY, // Your API key
});

async function speechToSpeechWithSDK(voiceId: string, audioFile: File) {
  try {
    const response = await client.speechToSpeech.convert(voiceId, {
      audio: audioFile,
      modelId: 'eleven_multilingual_sts_v2',
      voiceSettings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    });

    return response;
  } catch (error) {
    console.error('Speech conversion failed:', error);
    throw error;
  }
}
```

### Browser Client SDK

```typescript
import { ElevenLabs } from '@elevenlabs/client';

const client = new ElevenLabs({
  apiKey: 'YOUR_API_KEY', // Note: For production, get this from your backend
});

// Note: The browser SDK is primarily for Conversational AI
// For speech-to-speech, use the direct HTTP approach shown above
```

## Complete Web Application Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>ElevenLabs Speech-to-Speech</title>
</head>
<body>
    <div>
        <h2>Voice Converter</h2>
        <input type="file" id="audioFile" accept="audio/*">
        <select id="voiceSelect">
            <option value="21m00Tcm4TlvDq8ikWAM">Rachel</option>
            <option value="AZnzlk1XvdvUeBnXmlld">Domi</option>
            <!-- Add more voice IDs as needed -->
        </select>
        <button onclick="convertVoice()">Convert Voice</button>
        <audio id="audioPlayer" controls style="display:none;"></audio>
    </div>

    <script>
        async function convertVoice() {
            const fileInput = document.getElementById('audioFile');
            const voiceSelect = document.getElementById('voiceSelect');
            const audioPlayer = document.getElementById('audioPlayer');

            if (!fileInput.files[0]) {
                alert('Please select an audio file');
                return;
            }

            try {
                const formData = new FormData();
                formData.append('audio', fileInput.files[0]);
                formData.append('model_id', 'eleven_multilingual_sts_v2');
                formData.append('output_format', 'mp3_44100_128');

                const response = await fetch(
                    `https://api.elevenlabs.io/v1/speech-to-speech/${voiceSelect.value}`, 
                    {
                        method: 'POST',
                        headers: {
                            'xi-api-key': 'YOUR_API_KEY', // Replace with your key
                        },
                        body: formData,
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const audioBuffer = await response.arrayBuffer();
                const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                audioPlayer.src = audioUrl;
                audioPlayer.style.display = 'block';
                audioPlayer.play();

            } catch (error) {
                console.error('Error:', error);
                alert('Error converting voice: ' + error.message);
            }
        }
    </script>
</body>
</html>
```

## Available Models for Speech-to-Speech

- `eleven_multilingual_sts_v2` - Multilingual model supporting 29 languages[7]
- `eleven_english_sts_v2` - English-only model[7]

## Voice Settings Parameters

```typescript
interface VoiceSettings {
  stability: number;        // 0.0 to 1.0 - Voice consistency
  similarity_boost: number; // 0.0 to 1.0 - Voice similarity to original
  style: number;           // 0.0 to 1.0 - Style exaggeration
  use_speaker_boost: boolean; // Enhance speaker characteristics
}
```

## Output Formats

Available formats include:[2]
- `mp3_22050_32` - MP3 at 22kHz, 32kbps
- `mp3_44100_128` - MP3 at 44kHz, 128kbps
- `pcm_16000` - PCM at 16kHz
- `pcm_22050` - PCM at 22kHz
- `pcm_44100` - PCM at 44kHz

## Error Handling

```typescript
async function handleSpeechConversion(voiceId: string, audioFile: File) {
  try {
    const result = await speechToSpeech({
      voiceId,
      audioFile,
    });
    return result;
  } catch (error) {
    if (error instanceof Response) {
      const errorText = await error.text();
      console.error('API Error:', errorText);
    } else {
      console.error('Network Error:', error);
    }
    throw error;
  }
}
```

## Security Considerations

1. **Never expose your API key in client-side code** - Store it in environment variables[8]
2. **Use HTTPS** for all API requests
3. **Implement rate limiting** to avoid exceeding API quotas
4. **Validate file uploads** on both client and server side

## Getting Voice IDs

To get available voice IDs:[9]

```typescript
async function getAvailableVoices() {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': 'YOUR_API_KEY',
    },
  });
  
  const voices = await response.json();
  return voices.voices;
}
```

This comprehensive guide provides everything you need to integrate ElevenLabs Speech-to-Speech API into your TypeScript web application. The API is powerful and flexible, allowing you to create sophisticated voice conversion applications with natural-sounding results.[1]

[1](https://elevenlabs.io/docs/capabilities/voice-changer)
[2](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert)
[3](https://11labs-ai.com/create-speech-api-documentation/)
[4](https://drdroid.io/integration-diagnosis-knowledge/elevenlabs-error-handling-multipart-requests)
[5](https://elevenlabs.io/developers)
[6](https://11labs-ai.com/api-key/)
[7](https://elevenlabs.io/docs/models)
[8](https://www.npmjs.com/package/@elevenlabs/client?activeTab=readme)
[9](https://elevenlabs-sdk.mintlify.app/api-reference/getting-started)
[10](https://www.youtube.com/watch?v=IrOulguDIjo)
[11](https://zuplo.com/learning-center/elevenlabs-api)
[12](https://www.segmind.com/models/sts-eleven-labs/api)
[13](https://konfigthis.com/sdk/eleven-labs/typescript/)
[14](https://n8n.io/workflows/2245-generate-text-to-speech-using-elevenlabs-via-api/)
[15](https://elevenlabs.io/docs/capabilities/text-to-speech)
[16](https://neon.com/guides/pulse)
[17](https://github.com/elevenlabs/elevenlabs-examples)
[18](https://www.reddit.com/r/ElevenLabs/comments/1kbguhk/can_the_api_be_used_to_generate_speech_to_speech/)
[19](https://github.com/elevenlabs/elevenlabs-docs/blob/main/fern/conversational-ai/pages/guides/nextjs.mdx?plain=1)
[20](https://www.reddit.com/r/shortcuts/comments/1h0vq3c/elevenlabs_text_to_voice_api/)
[21](https://github.com/konfig-sdks/eleven-labs-typescript-sdk)
[22](https://drdroid.io/integration-diagnosis-knowledge/elevenlabs-missing-required-parameters)
[23](https://www.reddit.com/r/ElevenLabs/comments/1k16xb6/need_help_on_api_implementation_on_trypescript/)
[24](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
[25](https://www.npmjs.com/package/elevenlabs?activeTab=code)
[26](https://www.storyblok.com/tp/integrating-elevenlabs-ai-text-to-speech-headless-cms)
[27](https://community.activepieces.com/t/how-to-format-post-for-elevenlabs-api-text-to-speech-api/771)
[28](https://www.youtube.com/watch?v=9yno3cFLc-Q)
[29](https://json2video.com/docs/v2/api-reference/ai-integrations/elevenlabs)
[30](https://developers.cloudflare.com/ai-gateway/usage/providers/elevenlabs/)
[31](https://www.reddit.com/r/shortcuts/comments/11jvp2v/elevenlabs_api/)
[32](https://www.npmjs.com/package/@memberjunction%2Fai-elevenlabs)
[33](https://dev.to/ssk14/getting-started-with-elevenlabs-text-to-speech-api-21j4)
[34](https://elevenlabs.io)
[35](https://github.com/elevenlabs/elevenlabs-js)
[36](https://elevenlabs.io/docs/cookbooks/text-to-speech/streaming)
[37](https://blog.getbind.co/2025/08/19/how-to-use-elevenlabs-voice-ai-in-your-applications/)
[38](https://www.youtube.com/watch?v=CE4iPp7kd7Q)
[39](https://www.youtube.com/watch?v=uhqJvIUES7k)
[40](https://github.com/CyberT33N/ElevenLabs-VoiceApp)
[41](https://elevenlabs.io/docs/cookbooks/voice-changer)
[42](https://elevenlabs.io/docs/quickstart)
[43](https://forum.bubble.io/t/how-to-convert-text-to-speech-via-eleven-labs-api/252558)
[44](https://daext.com/blog/convert-text-to-speech-with-elevenlabs-and-php/)
[45](https://www.youtube.com/watch?v=vVS4gMFHPNs)
[46](https://community.make.com/t/elevenlab-speech-to-speech-missing-boundary-in-multipart/65768)
[47](https://www.youtube.com/watch?v=3BMy5KPa_kQ)
[48](https://creatomate.com/blog/how-to-create-voice-over-videos-using-an-api)