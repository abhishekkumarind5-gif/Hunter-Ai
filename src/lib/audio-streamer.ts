/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private playbackQueue: Int16Array[] = [];
  private isPlaying = false;
  private sampleRate = 16000;
  private outputSampleRate = 24000;

  constructor(private onAudioData: (data: string) => void) {}

  async start() {
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // ScriptProcessor is deprecated but widely supported and easier for raw PCM
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = this.floatTo16BitPCM(inputData);
      const base64Data = this.arrayBufferToBase64(pcmData.buffer);
      this.onAudioData(base64Data);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.source = null;
    this.playbackQueue = [];
    this.isPlaying = false;
  }

  addPlaybackChunk(base64Data: string) {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    this.playbackQueue.push(pcmData);
    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  private async playNextChunk() {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const pcmData = this.playbackQueue.shift()!;
    
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.outputSampleRate });
    }

    const floatData = this.pcm16ToFloat32(pcmData);
    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, this.outputSampleRate);
    audioBuffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this.playNextChunk();
    source.start();
  }

  clearPlaybackQueue() {
    this.playbackQueue = [];
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const pcm16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16Array;
  }

  private pcm16ToFloat32(pcm16Array: Int16Array): Float32Array {
    const float32Array = new Float32Array(pcm16Array.length);
    for (let i = 0; i < pcm16Array.length; i++) {
      float32Array[i] = pcm16Array[i] / 32768;
    }
    return float32Array;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
