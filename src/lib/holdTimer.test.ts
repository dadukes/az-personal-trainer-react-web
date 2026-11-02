import { describe, expect, it } from 'vitest';

import {
  countdownCue,
  displaySeconds,
  extendSwitch,
  heldSeconds,
  holdCue,
  holdEndsAt,
  holdPosition,
  pauseHold,
  restartHold,
  resumeHold,
  startHold,
  startSideTwo,
} from '@/lib/holdTimer';

const T0 = 1_000_000;
const single = () => startHold({ blockKey: 'a', setIndex: 0, holdSeconds: 30, perSide: false }, T0);
const sides = () => startHold({ blockKey: 'a', setIndex: 0, holdSeconds: 30, perSide: true }, T0);

describe('holdPosition', () => {
  it('counts one hold down to done', () => {
    const t = single();
    expect(holdPosition(t, T0)).toMatchObject({ phase: 'hold', side: 1, remainingMs: 30_000, paused: false });
    expect(displaySeconds(holdPosition(t, T0 + 10_200))).toBe(20);
    expect(holdPosition(t, T0 + 30_000).phase).toBe('done');
    expect(holdEndsAt(t)).toBe(T0 + 30_000);
  });

  it('runs side one, a five second break, then side two', () => {
    const t = sides();
    expect(holdPosition(t, T0 + 29_000)).toMatchObject({ phase: 'hold', side: 1 });
    expect(holdPosition(t, T0 + 31_000)).toMatchObject({ phase: 'switch', side: 2, remainingMs: 4_000, partMs: 5_000 });
    expect(holdPosition(t, T0 + 35_000)).toMatchObject({ phase: 'hold', side: 2, remainingMs: 30_000 });
    expect(holdPosition(t, T0 + 65_000).phase).toBe('done');
    expect(holdEndsAt(t)).toBe(T0 + 65_000);
  });
});

describe('pause, resume and restart', () => {
  it('freezes while paused and carries on where it stopped', () => {
    const paused = pauseHold(single(), T0 + 10_000);
    expect(holdPosition(paused, T0 + 50_000)).toMatchObject({ phase: 'hold', remainingMs: 20_000, paused: true });
    expect(holdEndsAt(paused)).toBeNull();
    const resumed = resumeHold(paused, T0 + 60_000);
    expect(holdPosition(resumed, T0 + 65_000).remainingMs).toBe(15_000);
    expect(holdEndsAt(resumed)).toBe(T0 + 80_000);
  });

  it('restarts from the top, running, with the usual break', () => {
    const longer = extendSwitch(sides(), T0 + 31_000);
    const again = restartHold(pauseHold(longer, T0 + 32_000), T0 + 40_000);
    expect(holdPosition(again, T0 + 40_000)).toMatchObject({ phase: 'hold', side: 1, remainingMs: 30_000, paused: false });
    expect(again.switchMs).toBe(5_000);
  });
});

describe('the break between sides', () => {
  it('adds five seconds, only during the break', () => {
    expect(extendSwitch(sides(), T0 + 10_000).switchMs).toBe(5_000);
    const longer = extendSwitch(sides(), T0 + 32_000);
    expect(holdPosition(longer, T0 + 32_000).remainingMs).toBe(8_000);
  });

  it('starts side two now, on a full clock', () => {
    const now = startSideTwo(sides(), T0 + 32_000);
    expect(holdPosition(now, T0 + 32_000)).toMatchObject({ phase: 'hold', side: 2, remainingMs: 30_000 });
    expect(holdEndsAt(now)).toBe(T0 + 62_000);
  });

  it('starts side two from a pause too', () => {
    const now = startSideTwo(pauseHold(sides(), T0 + 32_000), T0 + 50_000);
    expect(holdPosition(now, T0 + 50_000)).toMatchObject({ phase: 'hold', side: 2, remainingMs: 30_000, paused: false });
  });
});

describe('heldSeconds', () => {
  it('is the time on the side being worked', () => {
    expect(heldSeconds(single(), T0 + 12_700)).toBe(12);
    expect(heldSeconds(sides(), T0 + 32_000)).toBe(30);
    expect(heldSeconds(sides(), T0 + 45_000)).toBe(10);
  });
});

describe('holdCue', () => {
  const t = sides();
  it('beeps for the last three seconds of each part', () => {
    expect(holdCue(t, 26_900, 27_100)).toBe('count');
    expect(holdCue(t, 27_100, 27_300)).toBeNull();
    expect(holdCue(t, 31_900, 32_100)).toBe('count');
  });

  it('marks the switch, the start of side two and the end', () => {
    expect(holdCue(t, 29_900, 30_100)).toBe('switch');
    expect(holdCue(t, 34_900, 35_100)).toBe('go');
    expect(holdCue(t, 64_900, 65_100)).toBe('done');
    expect(holdCue(single(), 29_900, 30_100)).toBe('done');
  });

  it('stays quiet about what it missed asleep, except the finish', () => {
    expect(holdCue(t, 20_000, 40_000)).toBeNull();
    expect(holdCue(t, 20_000, 70_000)).toBe('done');
  });

  it('says nothing going backwards', () => {
    expect(holdCue(t, 30_100, 0)).toBeNull();
  });
});

describe('countdownCue', () => {
  const end = 90_000;
  it('counts the last three seconds, then says go', () => {
    expect(countdownCue(end, 86_900, 87_100)).toBe('count');
    expect(countdownCue(end, 88_900, 89_100)).toBe('count');
    expect(countdownCue(end, 89_900, 90_100)).toBe('go');
  });

  it('is quiet before then, after a sleep, and going backwards', () => {
    expect(countdownCue(end, 80_000, 80_200)).toBeNull();
    expect(countdownCue(end, 60_000, 95_000)).toBeNull();
    expect(countdownCue(end, 90_100, 89_900)).toBeNull();
  });
});
