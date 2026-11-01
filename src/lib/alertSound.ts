/** A short beep for when a rest ends. Browsers may refuse sound, and that's fine: the bar shows it too. */
export function playAlert(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    oscillator.onended = () => void context.close();
  } catch {
    // no sound available
  }
}
