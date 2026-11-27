import type { AlertSoundId } from '@shared/types/modules-data';

export interface AlertSoundOption {
  id: AlertSoundId;
  label: string;
}

export const ALERT_SOUND_OPTIONS: AlertSoundOption[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'chime-high', label: 'High Chime' },
  { id: 'siren', label: 'Siren' },
  { id: 'ping', label: 'Sonar Ping' },
  { id: 'radar', label: 'Radar Sweep' },
  { id: 'alarm', label: 'Red Alarm' },
  { id: 'klaxon', label: 'Klaxon' },
  { id: 'horn', label: 'Fleet Horn' },
  { id: 'double-beep', label: 'Double Beep' },
  { id: 'bell', label: 'Ship Bell' },
  { id: 'alert-pulse', label: 'Alert Pulse' },
  { id: 'subtle-tick', label: 'Subtle Tick' },
  { id: 'none', label: 'Silent (None)' }
];

type ToneStep = {
  freq: number;
  endFreq?: number;
  delay: number;
  duration: number;
  type: OscillatorType;
  gainScale?: number;
};

const SOUND_PATTERNS: Record<Exclude<AlertSoundId, 'none'>, ToneStep[]> = {
  chime: [
    { freq: 880, delay: 0, duration: 0.25, type: 'sine', gainScale: 1 },
    { freq: 1174.66, delay: 0.12, duration: 0.35, type: 'sine', gainScale: 0.85 }
  ],
  'chime-high': [
    { freq: 1046.5, delay: 0, duration: 0.18, type: 'triangle', gainScale: 0.9 },
    { freq: 1318.5, delay: 0.1, duration: 0.18, type: 'triangle', gainScale: 0.9 },
    { freq: 1567.98, delay: 0.2, duration: 0.32, type: 'triangle', gainScale: 0.85 }
  ],
  siren: [
    { freq: 620, endFreq: 960, delay: 0, duration: 0.22, type: 'sawtooth', gainScale: 0.7 },
    { freq: 960, endFreq: 580, delay: 0.22, duration: 0.24, type: 'sawtooth', gainScale: 0.7 }
  ],
  ping: [
    { freq: 1320, endFreq: 1280, delay: 0, duration: 0.28, type: 'sine', gainScale: 0.95 }
  ],
  radar: [
    { freq: 1080, delay: 0, duration: 0.09, type: 'sine', gainScale: 0.85 },
    { freq: 1440, delay: 0.14, duration: 0.24, type: 'sine', gainScale: 0.75 }
  ],
  alarm: [
    { freq: 740, delay: 0, duration: 0.11, type: 'square', gainScale: 0.6 },
    { freq: 740, delay: 0.15, duration: 0.11, type: 'square', gainScale: 0.6 },
    { freq: 740, delay: 0.3, duration: 0.14, type: 'square', gainScale: 0.65 }
  ],
  klaxon: [
    { freq: 440, endFreq: 370, delay: 0, duration: 0.2, type: 'sawtooth', gainScale: 0.75 },
    { freq: 440, endFreq: 370, delay: 0.26, duration: 0.24, type: 'sawtooth', gainScale: 0.75 }
  ],
  horn: [
    { freq: 220, endFreq: 210, delay: 0, duration: 0.48, type: 'sawtooth', gainScale: 0.75 },
    { freq: 330, endFreq: 315, delay: 0, duration: 0.48, type: 'triangle', gainScale: 0.45 }
  ],
  'double-beep': [
    { freq: 980, delay: 0, duration: 0.09, type: 'sine', gainScale: 0.9 },
    { freq: 980, delay: 0.13, duration: 0.09, type: 'sine', gainScale: 0.9 }
  ],
  bell: [
    { freq: 1567.98, delay: 0, duration: 0.5, type: 'sine', gainScale: 0.9 },
    { freq: 2349.32, delay: 0, duration: 0.35, type: 'sine', gainScale: 0.4 }
  ],
  'alert-pulse': [
    { freq: 520, endFreq: 880, delay: 0, duration: 0.15, type: 'triangle', gainScale: 0.9 },
    { freq: 520, endFreq: 1040, delay: 0.18, duration: 0.2, type: 'triangle', gainScale: 0.9 }
  ],
  'subtle-tick': [
    { freq: 1650, endFreq: 900, delay: 0, duration: 0.055, type: 'triangle', gainScale: 0.65 }
  ]
};

export function playAlertSound(soundId: AlertSoundId | undefined, volumePct = 70): void {
  if (!soundId || soundId === 'none') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const masterGain = Math.max(0, Math.min(1, volumePct / 100)) * 0.24;
    const now = ctx.currentTime;
    const steps = SOUND_PATTERNS[soundId] ?? SOUND_PATTERNS.chime;

    for (const step of steps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.type;
      const startAt = now + step.delay;
      const stopAt = startAt + step.duration;
      osc.frequency.setValueAtTime(step.freq, startAt);
      if (step.endFreq !== undefined) {
        osc.frequency.linearRampToValueAtTime(step.endFreq, stopAt);
      }
      const peak = Math.max(0.001, masterGain * (step.gainScale ?? 1));
      gain.gain.setValueAtTime(peak, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, stopAt);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(stopAt + 0.02);
    }

    const maxEnd = Math.max(...steps.map((s) => s.delay + s.duration));
    window.setTimeout(() => void ctx.close(), Math.ceil((maxEnd + 0.15) * 1000));
  } catch {
    // ignore WebAudio errors
  }
}

