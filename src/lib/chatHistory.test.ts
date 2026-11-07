import { describe, expect, it } from 'vitest';

import { chatMeta, chatSummary, chatTakeaways, chatTitle, groupChats, type ChatSessionLike } from '@/lib/chatHistory';

const chat = (id: string, date: string, extra: Partial<ChatSessionLike> = {}): ChatSessionLike => ({
  id,
  session_date: date,
  status: 'closed',
  title: null,
  summary: null,
  summary_json: null,
  message_count: 4,
  ...extra,
});

describe('past chats', () => {
  it('uses the title, else the day', () => {
    expect(chatTitle(chat('a', '2026-11-02', { title: 'Plan for the week' }))).toBe('Plan for the week');
    expect(chatTitle(chat('a', '2026-11-02'))).toBe('Monday 2 Nov');
    expect(chatMeta(chat('a', '2026-11-02', { message_count: 1, title: 'Shoulder' }))).toBe('Monday 2 Nov · 1 message');
    expect(chatMeta(chat('a', '2026-11-02', { message_count: 3 }))).toBe('3 messages');
  });

  it('prefers the one-line summary, and shows nothing when there is none', () => {
    expect(chatSummary(chat('a', '2026-11-02', { summary: 'Long', summary_json: { one_line: 'Short' } }))).toBe('Short');
    expect(chatSummary(chat('a', '2026-11-02', { summary: '  ' }))).toBeNull();
    expect(chatTakeaways(chat('a', '2026-11-02', { summary_json: { decisions: ['Swap the press'], commitments: ['Check in Thursday'] } }))).toEqual([
      'Swap the press',
      'Check in Thursday',
    ]);
  });

  it('keeps today apart and groups the rest by week, then month', () => {
    const { today, groups } = groupChats(
      [
        chat('t', '2026-11-07', { status: 'open' }),
        chat('w', '2026-11-03'),
        chat('l', '2026-10-28'),
        chat('o', '2026-10-05'),
        chat('y', '2025-12-30'),
      ],
      '2026-11-07',
    );
    expect(today?.id).toBe('t');
    expect(groups.map((g) => [g.title, g.sessions.map((s) => s.id)])).toEqual([
      ['This week', ['w']],
      ['Last week', ['l']],
      ['October', ['o']],
      ['December 2025', ['y']],
    ]);
  });
});
