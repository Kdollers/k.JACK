import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import {
  Copy,
  Scissors,
  ClipboardPaste,
  SquarePen,
  Trash2,
  Archive,
  ArchiveRestore,
  CheckSquare,
  ClipboardCopy
} from 'lucide-react';
import { placeMenu } from '../contextmenu/items';
import { useEscapeLayer } from '../context/ShortcutsContext';

/**
 * The right-click menu.
 *
 * One instance is drawn by the provider (src/context/ContextMenuContext.jsx)
 * for the whole window, so the screens only say WHAT the menu offers and never
 * where to put it.
 *
 * The menu is coloured by the application it is in: the icons, the highlighted
 * row and the separators read the --j-accent tokens, so it is red in JENESIS
 * Seller, green in Network & Maintenance, blue in Accounting & Business and
 * amber in Settings & Access Point — and correct in Light and Dark Mode,
 * because the tokens themselves are.
 */

/** The icon each action carries, so the menu reads at a glance. */
const ICONS = {
  copy: Copy,
  copyValue: ClipboardCopy,
  cut: Scissors,
  paste: ClipboardPaste,
  edit: SquarePen,
  delete: Trash2,
  deactivate: Archive,
  activate: ArchiveRestore,
  selectAll: CheckSquare
};

export default function ContextMenu({ x, y, items, onClose }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Measure after drawing, then move the menu if it would hang off the edge.
  // The first frame is drawn at the pointer and corrected before the user can
  // read it, which is why the correction happens in a layout effect.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const rect = node.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth || 1280,
      height: window.innerHeight || 800
    };
    setPosition(placeMenu(x, y, rect.width, rect.height, viewport));
    return undefined;
  }, [x, y, items]);

  // Escape closes the menu and is consumed there: while a menu is open, Escape
  // must not also close whatever is underneath it.
  useEscapeLayer({
    id: 'context-menu',
    priority: 300,
    onEscape: () => {
      if (onClose) onClose();
      return true;
    }
  });

  // Anything else closes it: a click anywhere, a scroll, a resize, another
  // right-click, or the window losing focus.
  useEffect(() => {
    const close = () => onClose && onClose();
    const onDown = (event) => {
      // A press INSIDE the menu is how an item is chosen, so it must not close
      // the menu a moment before the click lands.
      if (ref.current && event.target && ref.current.contains(event.target)) return;
      close();
    };
    // Capture phase: the menu must hear the click before the element under it
    // handles it, otherwise right-clicking row B while the menu for row A is
    // open would run A's action.
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('contextmenu', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    const scroller = typeof document === 'undefined' ? null : document.querySelector('main');
    if (scroller) scroller.addEventListener('scroll', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('contextmenu', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      if (scroller) scroller.removeEventListener('scroll', close);
    };
  }, [onClose]);

  const usable = (items || []).filter(Boolean);
  if (usable.length === 0) return null;

  const runItem = (entry) => {
    if (!entry || entry.disabled) return;
    if (onClose) onClose();
    entry.run();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('contextmenu.title')}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position.left, top: position.top }}
      className="fixed z-[80] min-w-[13rem] max-w-[20rem] py-1 rounded-lg border border-line bg-surface shadow-2xl shadow-black/30 text-xs select-none"
    >
      {usable.map((entry, index) => {
        const Icon = ICONS[entry.id];
        const previous = usable[index - 1];
        // A separator before the destructive block, so Delete is never one
        // careless click away from Edit.
        const needsSeparator = entry.danger && previous && !previous.danger;
        return (
          <React.Fragment key={`${entry.id}-${index}`}>
            {needsSeparator && <div className="my-1 border-t border-line" />}
            <button
              type="button"
              role="menuitem"
              disabled={entry.disabled}
              onClick={() => runItem(entry)}
              title={entry.note || undefined}
              className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-left transition-colors ${
                entry.disabled
                  ? 'text-[rgb(var(--j-ink-subtle))] opacity-60 cursor-not-allowed'
                  : entry.danger
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-ink hover:bg-surface-hover'
              }`}
            >
              <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                {Icon ? (
                  <Icon
                    className={`w-3.5 h-3.5 ${entry.disabled ? '' : entry.danger ? '' : 'j-text'}`}
                  />
                ) : null}
              </span>
              <span className="flex-1 truncate font-medium">{entry.label}</span>
              {entry.shortcut ? (
                <span className="text-[10px] text-[rgb(var(--j-ink-subtle))] font-mono">
                  {entry.shortcut}
                </span>
              ) : null}
            </button>
            {entry.note ? (
              <p className="px-3 pb-1 pt-0.5 text-[10px] leading-snug text-[rgb(var(--j-ink-subtle))]">
                {entry.note}
              </p>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
