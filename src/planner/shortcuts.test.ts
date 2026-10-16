import { describe, expect, it } from 'vitest';
import { isMac, isTypingTarget, matchShortcut, shortcutList } from './shortcuts';

const mac = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' };
const win = { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' };

function key(k: string, opts: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) {
  return { key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...opts };
}

describe('isMac', () => {
  it('reads the platform string', () => {
    expect(isMac(mac)).toBe(true);
    expect(isMac(win)).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('is false for null/non-objects', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
  it('is true for inputs, textareas and contenteditable', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('is false for ordinary elements', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
  });
});

describe('matchShortcut', () => {
  it('maps ⌘1..⌘7 to the seven main rail destinations, in rail order', () => {
    const paths = ['/net-worth', '/cashflow', '/budget', '/timeline', '/house', '/retirement', '/annuity'];
    paths.forEach((path, i) => {
      expect(matchShortcut(key(String(i + 1), { metaKey: true }))).toEqual({ type: 'navigate', path });
    });
  });

  it('has no ⌘0, ⌘8 or ⌘9 (the More group has no number)', () => {
    expect(matchShortcut(key('0', { metaKey: true }))).toBeNull();
    expect(matchShortcut(key('8', { metaKey: true }))).toBeNull();
    expect(matchShortcut(key('9', { metaKey: true }))).toBeNull();
  });

  it('treats ctrlKey the same as metaKey', () => {
    expect(matchShortcut(key('1', { ctrlKey: true }))).toEqual({ type: 'navigate', path: '/net-worth' });
  });

  it('maps ⌘N, ⌘, and ⌘K', () => {
    expect(matchShortcut(key('n', { metaKey: true }))).toEqual({ type: 'newEvent' });
    expect(matchShortcut(key(',', { metaKey: true }))).toEqual({ type: 'settings' });
    expect(matchShortcut(key('k', { metaKey: true }))).toEqual({ type: 'palette' });
  });

  it('splits ⌘Z / ⇧⌘Z into undo / redo', () => {
    expect(matchShortcut(key('z', { metaKey: true }))).toEqual({ type: 'undo' });
    expect(matchShortcut(key('z', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
  });

  it('matches bare "?" as help, but not Shift+? modified further', () => {
    expect(matchShortcut(key('?'))).toEqual({ type: 'help' });
    expect(matchShortcut(key('?', { metaKey: true }))).toBeNull();
  });

  it('is null with no modifier and no "?"', () => {
    expect(matchShortcut(key('n'))).toBeNull();
    expect(matchShortcut(key('1'))).toBeNull();
  });

  it('is null for an unmapped modified key', () => {
    expect(matchShortcut(key('p', { metaKey: true }))).toBeNull();
  });
});

describe('shortcutList', () => {
  it('lists seven pages plus the six action shortcuts', () => {
    const list = shortcutList();
    expect(list).toHaveLength(13);
    expect(list[0]).toEqual({ keys: '⌘1', label: 'Net Worth' });
    expect(list[6]).toEqual({ keys: '⌘7', label: 'Annuity & SEPP' });
    expect(list.at(-1)).toEqual({ keys: '?', label: 'Keyboard shortcuts' });
  });
});
