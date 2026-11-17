import type { VoiceEmotion } from '../types/akane';

export class VoiceEmotionService {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private pcmData: Float32Array | null = null;
  private energyHistory: number[] = [];
  private lastDetected: VoiceEmotion = 'neutral';

  public init(stream: MediaStream): void {
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.pcmData = new Float32Array(this.analyser.frequencyBinCount);
    } catch {
      // Ignore audio context errors
    }
  }

  public detectEmotion(): VoiceEmotion {
    if (!this.analyser || !this.pcmData) return this.lastDetected;

    (this.analyser as any).getFloatTimeDomainData(this.pcmData);
    let sumSquares = 0;
    for (let i = 0; i < this.pcmData.length; i++) {
      sumSquares += this.pcmData[i] * this.pcmData[i];
    }
    const rms = Math.sqrt(sumSquares / this.pcmData.length);

    this.energyHistory.push(rms);
    if (this.energyHistory.length > 25) {
      this.energyHistory.shift();
    }

    if (rms < 0.01) {
      return this.lastDetected;
    }

    const avg = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const variance =
      this.energyHistory.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) /
      this.energyHistory.length;

    if (rms > 0.18 && variance > 0.008) {
      this.lastDetected = 'hurried';
    } else if (variance > 0.005 && rms > 0.08) {
      this.lastDetected = 'cheerful';
    } else if (rms > 0.12 && variance < 0.002) {
      this.lastDetected = 'stressed';
    } else if (rms < 0.04 && avg < 0.03) {
      this.lastDetected = 'tired';
    } else {
      this.lastDetected = 'neutral';
    }

    return this.lastDetected;
  }

  public dispose(): void {
    try {
      this.audioCtx?.close();
    } catch {
      // Ignore
    }
    this.audioCtx = null;
    this.analyser = null;
    this.pcmData = null;
  }
}

export const voiceEmotionService = new VoiceEmotionService();
