/**
 * Sons de plateau synthetises a la volee : aucun fichier a charger, et rien a
 * precharger avant une partie. Le contexte audio doit etre debloque par un
 * geste utilisateur — d'ou `unlock()`, appele au premier clic de chaque page.
 */

type ToneOptions = {
  freq?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  slide?: number;
  delay?: number;
};

class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  unlock(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone({ freq = 440, dur = 0.16, type = 'sine', gain = 0.16, slide = 0, delay = 0 }: ToneOptions = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private chord(freqs: number[], step = 0.09, opts: ToneOptions = {}) {
    freqs.forEach((freq, i) => this.tone({ freq, dur: 0.22, gain: 0.15, ...opts, delay: i * step }));
  }

  tick()   { this.tone({ freq: 620, dur: 0.09, type: 'triangle', gain: 0.1 }); }
  go()     { this.tone({ freq: 880, dur: 0.28, type: 'triangle', gain: 0.16, slide: 320 }); }
  buzz()   { this.tone({ freq: 180, dur: 0.42, type: 'sawtooth', gain: 0.2, slide: -60 });
             this.tone({ freq: 270, dur: 0.4, type: 'square', gain: 0.07 }); }
  good()   { this.chord([523, 659, 880]); }
  great()  { this.chord([523, 659, 784, 1046], 0.085, { type: 'triangle', dur: 0.24 }); }
  bad()    { this.tone({ freq: 200, dur: 0.3, type: 'sawtooth', gain: 0.12, slide: -80 }); }
  reveal() { this.chord([392, 587], 0.1, { dur: 0.4, gain: 0.13 }); }
  win()    { this.chord([523, 659, 784, 1046, 1318], 0.11, { type: 'triangle', dur: 0.5, gain: 0.14 }); }
}

export const sfx = new Sfx();
