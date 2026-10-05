import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({})) },
  TABLE_NAME: 'stageright',
}));

import { getLandingPicks, upsertLandingPick, getNextSetIndex, deleteLandingPick } from '@/lib/db/landing-picks';
import { dynamodb } from '@/lib/aws/dynamodb';
import { QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

beforeEach(() => { vi.clearAllMocks(); });

describe('getLandingPicks', () => {
  it('groups records by room slug, sorted by setIndex', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom#1', enabled: true,
          picks: { Modern: 'b1.jpg' }, heroByStyle: { Modern: 'h1.jpg' },
          updatedAt: '2026-05-02T01:00:00Z' },
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0', enabled: true,
          picks: { Modern: 'b0.jpg' }, heroByStyle: { Modern: 'h0.jpg' },
          updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK', sk: 'ROOM#kitchen#0', enabled: false,
          picks: {}, heroByStyle: {}, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    } as never);

    const result = await getLandingPicks();
    expect(result.bedroom).toHaveLength(2);
    expect(result.bedroom?.[0].picks.Modern).toBe('b0.jpg');
    expect(result.bedroom?.[1].picks.Modern).toBe('b1.jpg');
    expect(result.kitchen).toHaveLength(1);
    expect(result.kitchen?.[0].enabled).toBe(false);
  });

  it('treats legacy ROOM#{slug} sk as setIndex=0', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom', enabled: true,
          picks: { Modern: 'old.jpg' }, updatedAt: '2026-04-29T00:00:00Z' },
      ],
    } as never);
    const result = await getLandingPicks();
    expect(result.bedroom).toHaveLength(1);
    expect(result.bedroom?.[0].picks.Modern).toBe('old.jpg');
  });

  it('returns empty object when no records', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as never);
    const result = await getLandingPicks();
    expect(result).toEqual({});
  });
});

describe('upsertLandingPick', () => {
  it('writes to ROOM#{slug}#{setIndex} sk', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({ Item: undefined } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', 0, {
      enabled: true,
      picks: { Modern: 'm.jpg' },
      heroByStyle: { Modern: 'h.jpg' },
    });

    const get = vi.mocked(dynamodb.send).mock.calls[0][0] as GetCommand;
    expect(get.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0' });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0' });
    expect(upd.input.ExpressionAttributeValues?.[':enabled']).toBe(true);
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({ Modern: 'm.jpg' });
  });

  it('writes to setIndex=2 when specified', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({ Item: undefined } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', 2, { enabled: true });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#2' });
  });

  it('keeps existing fields when caller sends only enabled toggle', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({
        Item: {
          pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0',
          enabled: true, picks: { Modern: 'm.jpg' },
          heroByStyle: { Modern: 'h.jpg' }, updatedAt: '2026-05-01T00:00:00Z',
        },
      } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', 0, { enabled: false });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.ExpressionAttributeValues?.[':enabled']).toBe(false);
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({ Modern: 'm.jpg' });
    expect(upd.input.ExpressionAttributeValues?.[':heroes']).toEqual({ Modern: 'h.jpg' });
  });
});

describe('getNextSetIndex', () => {
  it('returns 0 when no records exist for a room', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as never);
    expect(await getNextSetIndex('bedroom')).toBe(0);
  });

  it('returns lowest available index when there are gaps', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { sk: 'ROOM#bedroom#0' },
        { sk: 'ROOM#bedroom#2' },
      ],
    } as never);
    expect(await getNextSetIndex('bedroom')).toBe(1);
  });

  it('returns next consecutive index when no gaps', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { sk: 'ROOM#bedroom#0' },
        { sk: 'ROOM#bedroom#1' },
      ],
    } as never);
    expect(await getNextSetIndex('bedroom')).toBe(2);
  });

  it('treats legacy unsuffixed sk as setIndex 0', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [{ sk: 'ROOM#bedroom' }],
    } as never);
    expect(await getNextSetIndex('bedroom')).toBe(1);
  });
});

describe('deleteLandingPick', () => {
  it('deletes by sk = ROOM#{slug}#{setIndex}', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({} as never);
    await deleteLandingPick('bedroom', 1);
    const cmd = vi.mocked(dynamodb.send).mock.calls[0][0] as DeleteCommand;
    expect(cmd).toBeInstanceOf(DeleteCommand);
    expect(cmd.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#1' });
  });
});
