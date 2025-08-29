export interface VoiceToVoiceConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
}

export interface VoiceToVoiceResult {
  audioBuffer: ArrayBuffer;
  latency: number;
}

export class ElevenLabsVoiceToVoiceService {
  private config: VoiceToVoiceConfig;

  constructor(config: VoiceToVoiceConfig) {
    console.log('[VoiceToVoice] Constructor called with:', {
      hasApiKey: !!config.apiKey,
      voiceId: config.voiceId,
      modelId: config.modelId
    });
    
    if (!config.apiKey) {
      throw new Error('[VoiceToVoice] API key is required');
    }
    
    this.config = {
      modelId: 'eleven_multilingual_sts_v2',
      outputFormat: 'mp3_44100_128',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb',
      ...config,
    };
  }

  async speechToSpeech(audioBlob: Blob): Promise<VoiceToVoiceResult> {
    const startTime = performance.now();
    
    console.log('[VoiceToVoice] speechToSpeech called:', {
      blobSize: audioBlob.size,
      blobType: audioBlob.type,
      voiceId: this.config.voiceId,
      modelId: this.config.modelId
    });
    
    if (audioBlob.size === 0) {
      throw new Error('Cannot process empty audio');
    }
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('model_id', this.config.modelId!);
      formData.append('output_format', this.config.outputFormat!);
      
      const url = `https://api.elevenlabs.io/v1/speech-to-speech/${this.config.voiceId}`;
      console.log('[VoiceToVoice] Sending request to:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'Accept': 'audio/mpeg',
        },
        body: formData,
      });
      
      console.log('[VoiceToVoice] Response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[VoiceToVoice] API Error:', response.status, errorText);
        throw new Error(`Voice-to-voice failed: ${response.status} ${errorText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const latency = performance.now() - startTime;
      
      console.log('[VoiceToVoice] Success:', {
        audioSize: audioBuffer.byteLength,
        latency: `${latency.toFixed(0)}ms`
      });
      
      return {
        audioBuffer,
        latency
      };
    } catch (error) {
      console.error('[VoiceToVoice] Speech-to-speech failed:', error);
      throw error;
    }
  }

  setVoice(voiceId: string) {
    this.config.voiceId = voiceId;
  }

  updateConfig(newConfig: Partial<VoiceToVoiceConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): VoiceToVoiceConfig {
    return { ...this.config };
  }
}

export const createVoiceToVoiceService = (config: VoiceToVoiceConfig): ElevenLabsVoiceToVoiceService => {
  return new ElevenLabsVoiceToVoiceService(config);
};