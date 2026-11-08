#!/usr/bin/env node
'use strict';
/**
 * Types the sign-in credentials into the real JENESIS window.
 *
 * The GitHub runner has no display, so there is no keyboard to send: SendKeys
 * posts to whichever window holds the keyboard and none does, and WM_CHAR
 * posted into the window's queue never reaches Chromium's input pipeline.
 * Both were tried; both were recorded as not reaching the interface.
 *
 * Electron speaks the Chromium DevTools Protocol, so this drives the running
 * window the way a browser automation tool does: it finds the page, focuses
 * the first text field, and sends real input events with Input.insertText and
 * Input.dispatchKeyEvent. React sees genuine key and input events, which is
 * the whole point - a script that wrote `input.value` directly would change
 * the DOM without telling React anything.
 *
 * The WebSocket client is hand-rolled over `net` on purpose. The runner runs
 * Node 20, which has no stable global WebSocket, and this script must not add
 * a dependency to a release build.
 *
 * It is test tooling only. It touches nothing outside the running window, it
 * ships with the repository's scripts and never with the installer.
 *
 * Usage:
 *   node scripts/cdp-type.mjs --port 9222 --user smoke.admin --password <pw>
 *
 * Prints one JSON line: { focused, typed, signedIn, note }
 * Exits non-zero only when it could not reach the window at all.
 */
const crypto = require('crypto');
const net = require('net');

const port = Number(argOf('port', '9222'));
const user = argOf('user', '');
const password = argOf('password', '');

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// A WebSocket client small enough to read in one sitting.
// ---------------------------------------------------------------------------

/** Reads one server frame from the front of `buf`, or null if it is incomplete. */
function readFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const opcode = b0 & 0x0f;
  let length = b1 & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buf.length < offset + 2) return null;
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buf.length < offset + 8) return null;
    const big = buf.readBigUInt64BE(offset);
    if (big > 0x7fffffffn) throw new Error('a debugging message arrived that is too large to handle');
    length = Number(big);
    offset += 8;
  }
  if (buf.length < offset + length) return null;
  return { opcode, size: offset + length, payload: buf.slice(offset, offset + length) };
}

/** Builds one masked client frame (opcode 1, text). */
function writeFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  const header = [0x81];
  if (length < 126) {
    header.push(0x80 | length);
  } else if (length < 65536) {
    header.push(0x80 | 126, (length >> 8) & 0xff, length & 0xff);
  } else {
    header.push(0x80 | 127);
    for (let shift = 56; shift >= 0; shift -= 8) header.push(Number((BigInt(length) >> BigInt(shift)) & 0xffn));
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function wsConnect(url) {
  const target = new URL(url);
  const key = crypto.randomBytes(16).toString('base64');
  let buffer = Buffer.alloc(0);
  let handshaken = false;
  let onMessage = null;
  let socket;

  const api = {
    send(text) { socket.write(writeFrame(text)); },
    onMessage(fn) { onMessage = fn; },
    close() { try { socket.destroy(); } catch (_) { /* already gone */ } }
  };

  return new Promise((resolve, reject) => {
    socket = net.connect({ host: target.hostname, port: Number(target.port) }, () => {
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\n` +
        `Host: ${target.host}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    socket.setNoDelay(true);
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshaken) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end === -1) return;
        const status = buffer.slice(0, end).toString('latin1').split('\r\n')[0];
        if (!/ 101 /.test(status)) {
          reject(new Error(`the debugging endpoint answered "${status.trim()}"`));
          socket.destroy();
          return;
        }
        buffer = buffer.slice(end + 4);
        handshaken = true;
        resolve(api);
      }
      // Drain everything that has arrived, whether or not a handler is
      // attached yet: frames that land before the caller is ready are kept in
      // the buffer and delivered as soon as it is.
      for (;;) {
        let frame;
        try {
          frame = readFrame(buffer);
        } catch (err) {
          reject(err);
          socket.destroy();
          return;
        }
        if (!frame) break;
        buffer = buffer.slice(frame.size);
        if (frame.opcode === 1 && onMessage) onMessage(frame.payload.toString('utf8'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// The DevTools Protocol, reduced to what this script needs.
// ---------------------------------------------------------------------------

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) throw new Error(`the debugging endpoint answered ${res.status}`);
  const all = await res.json();
  const pages = all.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (pages.length === 0) throw new Error('no page is being debugged');
  return pages[0];
}

function cdpClient(ws) {
  let nextId = 1;
  const waiting = new Map();
  ws.onMessage((text) => {
    let msg;
    try { msg = JSON.parse(text); } catch (_) { return; }
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'the command was refused'));
      else resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (waiting.has(id)) { waiting.delete(id); reject(new Error(`${method} timed out`)); }
        }, 20000);
      });
    },
    async evaluate(expression) {
      const r = await this.send('Runtime.evaluate', {
        expression: `(() => { ${expression} })()`,
        returnByValue: true,
        awaitPromise: true
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'the page threw');
      return r.result ? r.result.value : null;
    }
  };
}

(async () => {
  const target = await listTargets();
  const ws = await wsConnect(target.webSocketDebuggerUrl);
  const cdp = cdpClient(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // The sign-in screen's first text field. Focused explicitly rather than
  // assumed, and reported, so a failure to focus is distinguishable from a
  // failure to type.
  const focused = await cdp.evaluate(`
    const field = document.querySelector(
      'input[name="username"], input[type="text"], input[type="email"], input:not([type])'
    );
    if (!field) return null;
    field.focus();
    return (field.tagName + ':' + (field.name || field.type || 'unnamed'));
  `);
  if (!focused) {
    ws.close();
    console.log(JSON.stringify({ focused: null, typed: false, signedIn: false, note: 'no text field on the sign-in screen' }));
    process.exit(1);
  }

  // Real text input: the browser's own pipeline, so React's onChange fires.
  await cdp.send('Input.insertText', { text: user });
  await sleep(250);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
  });
  await sleep(250);
  await cdp.send('Input.insertText', { text: password });
  await sleep(250);

  // Enter: key down, the character, key up - the sequence a real keyboard
  // produces and the one a form's submit handler is listening for.
  for (const type of ['rawKeyDown', 'char', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type,
      key: 'Enter',
      code: 'Enter',
      text: type === 'char' ? '\r' : undefined,
      unmodifiedText: type === 'char' ? '\r' : undefined,
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    });
  }

  // Give the request time, then read the screen. The sign-in form has no
  // navigation and the signed-in shell does, so the presence of <nav> is the
  // honest test of whether the interface moved on.
  let signedIn = false;
  let note = 'the navigation never appeared';
  for (let attempt = 0; attempt < 30 && !signedIn; attempt += 1) {
    await sleep(1000);
    const state = await cdp.evaluate(`
      return {
        nav: !!document.querySelector('nav'),
        form: !!document.querySelector('form'),
        text: (document.body.innerText || '').slice(0, 160).replace(/\\s+/g, ' ')
      };
    `);
    if (state && state.nav) { signedIn = true; note = 'the signed-in shell is on screen'; }
    else if (state && !state.form) { note = 'neither the sign-in form nor the navigation: ' + state.text; }
  }

  ws.close();
  console.log(JSON.stringify({ focused, typed: true, signedIn, note }));
  process.exit(0);
})().catch((err) => {
  console.log(JSON.stringify({ focused: null, typed: false, signedIn: false, note: err.message }));
  process.exit(1);
});
