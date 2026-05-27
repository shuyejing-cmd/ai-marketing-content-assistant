import {
  getCurrentFreeRemoteSessionId,
  getCurrentTemplateRemoteSessionId,
  setCurrentFreeRemoteSessionId,
  setCurrentTemplateRemoteSessionId,
} from '../src/features/generation/owner-id';

describe('owner id session keys', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  it('stores the free current session separately from template current sessions', () => {
    setCurrentFreeRemoteSessionId('session_free');
    setCurrentTemplateRemoteSessionId('tpl_1', 'session_tpl_1');
    setCurrentTemplateRemoteSessionId('tpl_2', 'session_tpl_2');

    expect(getCurrentFreeRemoteSessionId()).toBe('session_free');
    expect(getCurrentTemplateRemoteSessionId('tpl_1')).toBe('session_tpl_1');
    expect(getCurrentTemplateRemoteSessionId('tpl_2')).toBe('session_tpl_2');
  });
});
