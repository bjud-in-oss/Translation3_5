// Inline worklet using a blob URL
const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Send the Float32Array data to the main thread
      this.port.postMessage(channelData);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onAudioData: (pcmBuffer: ArrayBuffer) => void = () => {};

  // For playback
  private playContext: AudioContext | null = null;
  private nextPlayTime: number = 0;

  constructor() {}

  async startCapture(deviceId: string | undefined, aecOptions: { aec: boolean }, callback: (pcm: ArrayBuffer) => void) {
    this.onAudioData = callback;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: aecOptions.aec,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Capture at exactly 16kHz for Gemini
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(workletUrl);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      this.workletNode.port.onmessage = (event) => {
        const float32Array: Float32Array = event.data;
        // Convert Float32Array to Int16Array
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          let s = Math.max(-1, Math.min(1, float32Array[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.onAudioData(int16Array.buffer);
      };

      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

    } catch (e) {
      console.error("Failed to start capture:", e);
      throw e;
    }
  }

  stopCapture() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Playback of 24kHz PCM from Gemini
  async playPCM24(pcmData: ArrayBuffer) {
    if (!this.playContext) {
      this.playContext = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = this.playContext.currentTime + 0.1; // small buffer
    }

    if (this.playContext.state === 'suspended') {
      await this.playContext.resume();
    }

    if (pcmData.byteLength === 0) return;

    const int16Array = new Int16Array(pcmData);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
    }

    const audioBuffer = this.playContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = this.playContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playContext.destination);

    if (this.nextPlayTime < this.playContext.currentTime) {
      this.nextPlayTime = this.playContext.currentTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  async setOutputDevice(deviceId: string) {
    if (this.playContext && typeof (this.playContext as any).setSinkId === 'function') {
      try {
        await (this.playContext as any).setSinkId(deviceId);
      } catch (e) {
        console.error("Failed to set sink ID. Are we on HTTPS and has user permitted audio?", e);
      }
    }
  }
}
