import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface SpeechToTextResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export class ElevenLabsService {
  private client: ElevenLabsClient;
  private config: ElevenLabsConfig;
  private conversationHistory: ConversationMessage[] = [];

  constructor(config: ElevenLabsConfig) {
    this.config = {
      modelId: 'eleven_multilingual_v2',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb', // Default voice
      ...config,
    };
    
    this.client = new ElevenLabsClient({
      apiKey: this.config.apiKey,
    });
  }

  async getAvailableVoices() {
    try {
      const response = await this.client.voices.getAll();
      return response.voices || [];
    } catch (error) {
      console.error('Failed to fetch voices:', error);
      return [];
    }
  }

  async textToSpeech(text: string, voiceId?: string): Promise<ArrayBuffer> {
    try {
      const audioResponse = await this.client.textToSpeech.convert(
        voiceId || this.config.voiceId!,
        {
          text,
          modelId: this.config.modelId,
        }
      );

      return audioResponse as unknown as ArrayBuffer;
    } catch (error) {
      console.error('Text-to-speech conversion failed:', error);
      throw error;
    }
  }

  async streamTextToSpeech(text: string, voiceId?: string) {
    try {
      const audioStream = await this.client.textToSpeech.stream(
        voiceId || this.config.voiceId!,
        {
          text,
          modelId: this.config.modelId,
        }
      );

      return audioStream;
    } catch (error) {
      console.error('Streaming text-to-speech failed:', error);
      throw error;
    }
  }

  async speechToText(audioBlob: Blob): Promise<SpeechToTextResult> {
    try {
      // Convert blob to proper audio format if needed
      const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mpeg' });
      
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('model_id', 'whisper-1'); // Using Whisper model
      
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('STT API Error:', response.status, errorText);
        throw new Error(`Speech-to-text failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return {
        text: data.text || '',
        confidence: data.confidence || 0.9,
        isFinal: true,
      };
    } catch (error) {
      console.error('Speech-to-text conversion failed:', error);
      throw error;
    }
  }

  addToConversationHistory(message: ConversationMessage) {
    this.conversationHistory.push(message);
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  clearConversationHistory() {
    this.conversationHistory = [];
  }

  setVoice(voiceId: string) {
    this.config.voiceId = voiceId;
  }

  setModel(modelId: string) {
    this.config.modelId = modelId;
  }

  getConfig(): ElevenLabsConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ElevenLabsConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.apiKey) {
      this.client = new ElevenLabsClient({
        apiKey: newConfig.apiKey,
      });
    }
  }
}

export const createElevenLabsService = (config: ElevenLabsConfig): ElevenLabsService => {
  return new ElevenLabsService(config);
};