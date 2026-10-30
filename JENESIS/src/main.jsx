import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * public/boot.js painted the saved theme and left a "Starting JENESIS…" card on
 * screen before this bundle ran. Once the interface is mounted the card is
 * removed and the document is marked ready, which stops boot.js's watchdog and
 * tells the desktop shell that the window is showing the real interface.
 *
 * Every step is optional: diagnostics must never prevent the application from
 * starting.
 */
function markInterfaceReady() {
  try {
    document.documentElement.setAttribute('data-jenesis-ready', '1');
    const boot = document.getElementById('jenesis-boot');
    if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
    const bridge = window.genesisDesktop || window.jenesisDesktop;
    if (bridge && typeof bridge.reportStartup === 'function') {
      bridge.reportStartup('ready', 'the interface is mounted');
    }
  } catch (_) { /* ignore */ }
}

function Root() {
  useEffect(markInterfaceReady, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// If the bundle itself never reaches the root (missing file, blocked file, a
// syntax error in a browser the bundle does not support), boot.js keeps its
// start-up card on screen and reports the failure — no empty white window.
