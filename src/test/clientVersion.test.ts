import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OUTDATED_CLIENT_EVENT,
  compareVersions,
  isVersionOlder,
  notifyOutdatedClient,
  resetOutdatedClientNotice,
} from '../services/clientVersion';

describe('client version gate', () => {
  beforeEach(() => {
    resetOutdatedClientNotice();
  });

  it('يقارن الإصدارات بشكل صحيح', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('v2.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  it('يعتبر النسخة قديمة فقط لو أقل من الحد الأدنى', () => {
    expect(isVersionOlder('0.9.9', '1.0.0')).toBe(true);
    expect(isVersionOlder('1.0.0', '1.0.0')).toBe(false);
    expect(isVersionOlder('1.1.0', '1.0.0')).toBe(false);
    // لا حد أدنى معروف = لا حجب
    expect(isVersionOlder('1.0.0', '')).toBe(false);
    expect(isVersionOlder('1.0.0', '0.0.0')).toBe(false);
  });

  it('يطلق حدث الحجب مرة واحدة لكل سبب', () => {
    const listener = vi.fn();
    window.addEventListener(OUTDATED_CLIENT_EVENT, listener);

    notifyOutdatedClient({ current: '0.9.0', required: '1.0.0', reason: 'version' });
    notifyOutdatedClient({ current: '0.9.0', required: '1.0.0', reason: 'version' });
    notifyOutdatedClient({ current: '1.0.0', required: '', reason: 'permission' });

    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener(OUTDATED_CLIENT_EVENT, listener);
  });
});
