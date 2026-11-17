import type { AmbientSoundscape } from '../types/akane';

class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentMode: AmbientSoundscape = 'off';

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setSoundscape(mode: AmbientSoundscape, volume: number): void {
    if (mode === 'off') {
      this.stop();
      this.currentMode = 'off';
      return;
    }

    const ctx = this.ensureContext();
    const clampedVolume = Math.max(0, Math.min(1, volume)) * 0.28;

    if (this.currentMode === mode && this.sourceNode && this.gainNode) {
      this.gainNode.gain.setTargetAtTime(clampedVolume, ctx.currentTime, 0.12);
      return;
    }

    this.stopSourceOnly();
    this.currentMode = mode;

    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (mode === 'whitenoise') {
      // Soft pink-tinted white noise
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.08;
      }
    } else {
      // Rain texture: filtered brown noise + gentle droplet modulation
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.03 * white) / 1.03;
        const droplet = Math.random() < 0.0018 ? (Math.random() * 2 - 1) * 0.18 : 0;
        data[i] = lastOut * 2.1 + droplet;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'rain' ? 1350 : 2200;

    source.connect(filter);
    if (this.gainNode) {
      filter.connect(this.gainNode);
      this.gainNode.gain.setTargetAtTime(clampedVolume, ctx.currentTime, 0.2);
    }

    source.start();
    this.sourceNode = source;
  }

  private stopSourceOnly(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
      this.sourceNode = null;
    }
  }

  public stop(): void {
    if (this.ctx && this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    this.stopSourceOnly();
  }
}

export const ambientAudio = new AmbientAudioEngine();
