export async function playAudioBuffer(audioBuffer: ArrayBuffer, onEnded?: () => void): Promise<void> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBufferSource = await audioContext.decodeAudioData(audioBuffer);
    const source = audioContext.createBufferSource();
    
    source.buffer = audioBufferSource;
    source.connect(audioContext.destination);
    
    if (onEnded) {
      source.onended = onEnded;
    }
    
    source.start(0);
    
    return new Promise((resolve) => {
      source.onended = () => {
        if (onEnded) onEnded();
        resolve();
      };
    });
  } catch (error) {
    console.error('[Audio Utils] Failed to play audio buffer:', error);
    if (onEnded) onEnded();
    throw error;
  }
}

export function createAudioBlob(buffer: ArrayBuffer, mimeType: string = 'audio/mp3'): Blob {
  return new Blob([buffer], { type: mimeType });
}

export function downloadAudioFile(blob: Blob, filename: string = 'audio.mp3'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}