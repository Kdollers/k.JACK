import React, { createContext, useCallback, useContext, useState } from 'react';
import ContextMenu from '../components/ContextMenu';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * One right-click menu for the whole window.
 *
 * Screens say what the menu offers; this provider decides where it goes, how
 * it is closed, and what happens before a destructive action runs. Keeping it
 * in one place means every menu in JENESIS behaves identically: same keys,
 * same confirmation, same colour, same dismissal.
 */

const ContextMenuContext = createContext(null);

export function ContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);
  // A destructive action waits here until the user confirms it. The dialog is
  // owned by the provider so a screen cannot forget to ask.
  const [pending, setPending] = useState(null);

  const close = useCallback(() => setMenu(null), []);

  /**
   * Opens the menu at the pointer. `items` is the finished list from
   * src/contextmenu/items.js — a screen builds it, this draws it.
   */
  const open = useCallback((event, items) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    const list = (items || []).filter(Boolean);
    if (list.length === 0) {
      setMenu(null);
      return;
    }
    setMenu({
      x: event && typeof event.clientX === 'number' ? event.clientX : 0,
      y: event && typeof event.clientY === 'number' ? event.clientY : 0,
      items: list
    });
  }, []);

  /** Asks before running something that cannot be undone. */
  const confirmAction = useCallback((options) => {
    setPending(options || null);
  }, []);

  const runPending = () => {
    const action = pending;
    setPending(null);
    if (action && typeof action.onConfirm === 'function') action.onConfirm();
  };

  const cancelPending = () => setPending(null);

  return (
    <ContextMenuContext.Provider value={{ open, close, confirmAction }}>
      {children}

      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={close} /> : null}

      <ConfirmDialog
        open={!!pending}
        title={pending ? pending.title : ''}
        message={pending ? pending.message : ''}
        confirmLabel={pending ? pending.confirmLabel : undefined}
        onConfirm={runPending}
        onCancel={cancelPending}
      />
    </ContextMenuContext.Provider>
  );
}

/**
 * The menu, for a screen that wants to open one.
 *
 * Returns a no-op stand-in when the provider is not mounted, so a screen drawn
 * on its own (as the tests do) still renders instead of throwing.
 */
export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    return {
      open() {},
      close() {},
      confirmAction() {}
    };
  }
  return context;
}
