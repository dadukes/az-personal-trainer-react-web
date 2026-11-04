import { describe, expect, it } from 'vitest';

import {
  isStreamStalled,
  newClientMessageId,
  runningTurnInHistory,
  STILL_WORKING_AFTER_MS,
  STREAM_STALL_MS,
  stillWorkingNote,
} from '@/lib/chatTurn';

describe('chat turns', () => {
  it('makes a UUID per message', () => {
    const a = newClientMessageId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientMessageId()).not.toBe(a);
  });

  it('adds a still-working line only after a while, worded for plans', () => {
    expect(stillWorkingNote(0, STILL_WORKING_AFTER_MS - 1, true)).toBeNull();
    expect(stillWorkingNote(0, STILL_WORKING_AFTER_MS, true)).toBe('Plans take the longest. Up to a minute.');
    expect(stillWorkingNote(0, STILL_WORKING_AFTER_MS, false)).toBe('Still going. This can take up to a minute.');
  });

  it('calls a stream stalled only past the ping allowance', () => {
    expect(isStreamStalled(0, STREAM_STALL_MS)).toBe(false);
    expect(isStreamStalled(0, STREAM_STALL_MS + 1)).toBe(true);
  });

  it('finds a running turn only when it is the last message', () => {
    expect(runningTurnInHistory([])).toBeNull();
    expect(runningTurnInHistory([{ role: 'user', turn_status: 'running', client_message_id: 'c1' }])).toBe('c1');
    expect(
      runningTurnInHistory([
        { role: 'user', turn_status: 'running', client_message_id: 'c1' },
        { role: 'model' },
      ]),
    ).toBeNull();
    expect(runningTurnInHistory([{ role: 'user', turn_status: 'done', client_message_id: 'c1' }])).toBeNull();
    expect(runningTurnInHistory([{ role: 'user', turn_status: 'running' }])).toBeNull();
  });
});
