import { describe, it, expect } from 'vitest';
import { computeCoverCrop } from '@/lib/utils/share-export';

describe('computeCoverCrop', () => {
  it('crops sides when source is wider than destination ratio', () => {
    const crop = computeCoverCrop({ srcW: 2000, srcH: 1000, dstW: 600, dstH: 600 });
    expect(crop.sy).toBe(0);
    expect(crop.sh).toBe(1000);
    expect(crop.sw).toBe(1000);
    expect(crop.sx).toBe(500);
  });

  it('crops top/bottom when source is taller than destination ratio', () => {
    const crop = computeCoverCrop({ srcW: 1000, srcH: 2000, dstW: 600, dstH: 600 });
    expect(crop.sx).toBe(0);
    expect(crop.sw).toBe(1000);
    expect(crop.sh).toBe(1000);
    expect(crop.sy).toBe(500);
  });

  it('no crop when source and destination ratios match', () => {
    const crop = computeCoverCrop({ srcW: 1000, srcH: 1000, dstW: 500, dstH: 500 });
    expect(crop).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 });
  });
});
