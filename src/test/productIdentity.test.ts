import { describe, it, expect } from 'vitest';
import { makeProductCodesUnique, normalizeVariantCodeKey } from '../services/productIdentity';

describe('makeProductCodesUnique', () => {
  it('لا يغيّر الأصناف اللي أكوادها فريدة', () => {
    const input = [{ code: 'A' }, { code: 'B' }, { code: 'C' }];
    const out = makeProductCodesUnique(input);
    expect(out.map((p) => p.code)).toEqual(['A', 'B', 'C']);
  });

  it('يخلي كل كود فريد ويلحق المتكرر بـ #2 ثم #3', () => {
    const input = [{ code: '1000' }, { code: '1000' }, { code: '1000' }];
    const out = makeProductCodesUnique(input);
    expect(out.map((p) => p.code)).toEqual(['1000', '1000#2', '1000#3']);
    const keys = out.map((p) => normalizeVariantCodeKey(p.code));
    expect(new Set(keys).size).toBe(out.length);
  });

  it('لا يصطدم بكود موجود مسبقًا مثل 1000#2', () => {
    const input = [{ code: '1000' }, { code: '1000' }, { code: '1000#2' }];
    const out = makeProductCodesUnique(input);
    expect(out.map((p) => p.code)).toEqual(['1000', '1000#3', '1000#2']);
  });

  it('يسيب الأصناف من غير كود زي ما هي', () => {
    const input = [{ code: '' }, { code: null }, { code: 'X' }, { code: 'X' }];
    const out = makeProductCodesUnique(input as any);
    expect(out[0].code).toBe('');
    expect(out[1].code).toBe(null);
    expect(out[2].code).toBe('X');
    expect(out[3].code).toBe('X#2');
  });

  it('لا يغيّر الأصل (immutable)', () => {
    const input = [{ code: 'A' }, { code: 'A' }];
    makeProductCodesUnique(input);
    expect(input.map((p) => p.code)).toEqual(['A', 'A']);
  });
});