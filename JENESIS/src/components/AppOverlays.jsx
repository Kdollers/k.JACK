import React from 'react';
import CalculatorModal from './CalculatorModal';
import MessengerPanel from './MessengerPanel';
import ShortcutsReference from './ShortcutsReference';
import { useShortcuts } from '../context/ShortcutsContext';

/**
 * The overlays that shortcuts (and the header buttons) open. They are mounted
 * once at the application root, so the keyboard and the toolbar always drive
 * the same state and only one instance of each exists.
 */
export default function AppOverlays() {
  const {
    calculatorOpen, closeCalculator,
    messengerOpen,
    referenceOpen
  } = useShortcuts();

  return (
    <>
      {calculatorOpen && <CalculatorModal onClose={closeCalculator} />}
      {messengerOpen && <MessengerPanel />}
      {referenceOpen && <ShortcutsReference />}
    </>
  );
}
