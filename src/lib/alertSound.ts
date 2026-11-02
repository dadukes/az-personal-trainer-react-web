import type { HoldCue } from '@/lib/holdTimer';

// ── Timer beeps: one context, opened by the click that starts a timer, so later beeps may play ──

let holdContext: AudioContext | null = null;

function openContext(): AudioContext | null {
  try {
    holdContext ??= new AudioContext();
    if (holdContext.state === 'suspended') void holdContext.resume();
    return holdContext;
  } catch {
    return null;
  }
}

/** Call from the click that starts a timer: browsers only allow sound after one. */
export function prepareTimerSounds(): void {
  openContext();
}

function tone(context: AudioContext, frequency: number, startAt: number, seconds: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  // A short fade each end, so it doesn't click.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.2, startAt + 0.01);
  gain.gain.setValueAtTime(0.2, startAt + seconds - 0.01);
  gain.gain.linearRampToValueAtTime(0, startAt + seconds);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + seconds);
}

/** Mirrors the phone's beeps: a short one to count, two rising for a switch, side two or the end. */
export function playHoldCue(cue: HoldCue, soundOn: boolean): void {
  try {
    navigator.vibrate?.(cue === 'count' ? 40 : [120, 80, 120]);
  } catch {
    // no vibration here
  }
  if (!soundOn) return;
  const context = openContext();
  if (!context) return;
  const now = context.currentTime;
  if (cue === 'count') {
    tone(context, 880, now, 0.13);
  } else {
    tone(context, 988, now, 0.16);
    tone(context, 1319, now + 0.22, 0.42);
  }
}

const TIMER_SOUNDS_KEY = 'forma:timer-sounds';

/** On unless switched off in this browser. */
export function readTimerSounds(): boolean {
  try {
    return localStorage.getItem(TIMER_SOUNDS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveTimerSounds(on: boolean): void {
  try {
    localStorage.setItem(TIMER_SOUNDS_KEY, on ? '1' : '0');
  } catch {
    // private mode: it lasts this visit
  }
}
