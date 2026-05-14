#!/usr/bin/env node
// ride-client.mjs — Dyalog APL RIDE protocol client
// Connects to a Dyalog interpreter via RIDE TCP protocol, executes commands, returns JSON.

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, 'ride-state.json');
const DYALOG_EXE = 'D:\\devel\\dyalog\\20.0\\dyalog.exe';

// --- Argument parsing ---
const args = process.argv.slice(2);
const verb = args[0];
const opts = parseOpts(args.slice(1));

function parseOpts(args) {
  const o = { host: 'localhost', port: 4502, timeout: 30, file: null, expr: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') o.host = args[++i];
    else if (args[i] === '--port') o.port = parseInt(args[++i], 10);
    else if (args[i] === '--timeout') o.timeout = parseInt(args[++i], 10);
    else if (args[i] === '--file') o.file = args[++i];
    else if (!args[i].startsWith('--')) o.expr = args[i];
  }
  return o;
}

// --- RIDE Protocol helpers ---
const RIDE_MAGIC = Buffer.from('RIDE');

function encodeMessage(payload) {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payloadBuf.length, 0);
  RIDE_MAGIC.copy(header, 4);
  return Buffer.concat([header, payloadBuf]);
}

function encodeCommand(name, args) {
  return encodeMessage(JSON.stringify([name, args]));
}

class RideConnection {
  constructor(host, port, timeoutSec) {
    this.host = host;
    this.port = port;
    this.timeout = timeoutSec * 1000;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.messages = [];
    this.resolveWait = null;
    this.connected = false;
    this.handshakeDone = false;
    this.identifySent = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.socket) this.socket.destroy();
        reject(new Error(`Connection timeout to ${this.host}:${this.port}`));
      }, 5000);

      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        clearTimeout(timer);
        this.connected = true;
        // Send both handshake messages
        this.socket.write(encodeMessage('SupportedProtocols=2'));
        this.socket.write(encodeMessage('UsingProtocol=2'));
        resolve();
      });

      this.socket.on('data', (data) => this._onData(data));
      this.socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      this.socket.on('close', () => {
        this.connected = false;
        if (this.resolveWait) this.resolveWait();
      });
    });
  }

  _onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 8) {
      const totalLen = this.buffer.readUInt32BE(0);
      if (this.buffer.length < totalLen) break;
      const magic = this.buffer.slice(4, 8).toString('ascii');
      const payload = this.buffer.slice(8, totalLen).toString('utf8');
      this.buffer = this.buffer.slice(totalLen);

      if (magic !== 'RIDE') continue;

      if (!this.handshakeDone) {
        // During handshake, expect SupportedProtocols=2 and UsingProtocol=2
        if (payload.startsWith('SupportedProtocols=') || payload.startsWith('UsingProtocol=')) {
          if (payload.startsWith('UsingProtocol=')) {
            this.handshakeDone = true;
            // Send Identify, then Connect to activate the session
            this.socket.write(encodeCommand('Identify', { apiVersion: 1, identity: 1 }));
            this.socket.write(encodeCommand('Connect', {}));
            this.identifySent = true;
          }
        }
        continue;
      }

      // Parse JSON message
      try {
        const msg = JSON.parse(payload);
        this.messages.push(msg);
        if (this.resolveWait) {
          const fn = this.resolveWait;
          this.resolveWait = null;
          fn();
        }
      } catch {
        // Non-JSON message after handshake, ignore
      }
    }
  }

  send(name, args) {
    if (!this.connected) throw new Error('Not connected');
    this.socket.write(encodeCommand(name, args));
  }

  // Wait until a condition is met on accumulated messages, or timeout
  waitFor(conditionFn, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + (timeoutMs || this.timeout);

      const check = () => {
        const result = conditionFn(this.messages);
        if (result !== undefined) {
          resolve(result);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(undefined); // timeout
          return;
        }
        this.resolveWait = () => {
          this.resolveWait = null;
          check();
        };
        // Safety: re-check after a short interval in case we miss a signal
        setTimeout(() => {
          if (this.resolveWait) {
            this.resolveWait = null;
            check();
          }
        }, 200);
      };
      check();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }
}

// --- Wait helpers ---

// Wait for SetPromptType after an Execute — collect all output
// Wait for type > 0 which means interpreter is ready for input again
function waitForPrompt(conn) {
  return conn.waitFor((msgs) => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i][0] === 'SetPromptType' && msgs[i][1].type > 0) {
        return msgs[i][1];
      }
    }
    return undefined;
  }, conn.timeout);
}

// Collect output from messages (exclude echoed input: type 11 and type 14)
function collectOutput(msgs) {
  let output = '';
  for (const msg of msgs) {
    if (msg[0] === 'AppendSessionOutput') {
      const type = msg[1].type || 0;
      if (type !== 11 && type !== 14) { // 11 = echoed input, 14 = input line
        output += msg[1].result || '';
      }
    }
  }
  return output;
}

// Check for errors in output (type 5 = APL error message)
function hasError(msgs) {
  for (const msg of msgs) {
    if (msg[0] === 'AppendSessionOutput' && msg[1].type === 5) {
      return true;
    }
  }
  return false;
}

// --- Commands ---

async function cmdStart() {
  // Check if already running
  try {
    const conn = new RideConnection(opts.host, opts.port, 3);
    await conn.connect();
    conn.disconnect();
    output({ ok: true, output: `Interpreter already running on ${opts.host}:${opts.port}\n`, promptType: 1 });
    return;
  } catch {
    // Not running, start it
  }

  const env = { ...process.env, RIDE_INIT: `serve:*:${opts.port}` };
  const child = spawn(DYALOG_EXE, [], {
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  // Save state
  const state = { pid: child.pid, port: opts.port, host: opts.host, startedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // Wait for it to be connectable
  let connected = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(300);
    try {
      const conn = new RideConnection(opts.host, opts.port, 3);
      await conn.connect();
      conn.disconnect();
      connected = true;
      break;
    } catch {
      // retry
    }
  }

  if (connected) {
    output({ ok: true, output: `Interpreter started (PID ${child.pid}) on port ${opts.port}\n`, promptType: 1 });
  } else {
    output({ ok: false, output: `Failed to start interpreter or connect after launch\n`, promptType: 0 });
  }
}

async function cmdStop() {
  try {
    const conn = new RideConnection(opts.host, opts.port, 5);
    await conn.connect();
    // Wait for session ready
    await conn.waitFor((msgs) => msgs.some(m => m[0] === 'SetPromptType') ? true : undefined, 5000);
    conn.send('Exit', { code: 0 });
    await sleep(500);
    conn.disconnect();
  } catch {
    // If can't connect, try to kill via PID
  }

  // Clean up state file
  if (fs.existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      try { process.kill(state.pid); } catch { /* already dead */ }
    } catch { /* ignore */ }
    fs.unlinkSync(STATE_FILE);
  }
  output({ ok: true, output: 'Interpreter stopped\n', promptType: 0 });
}

async function cmdStatus() {
  try {
    const conn = new RideConnection(opts.host, opts.port, 5);
    await conn.connect();
    // Wait for initial messages (ReplyIdentify comes before SetPromptType)
    await conn.waitFor((msgs) => msgs.some(m => m[0] === 'SetPromptType') ? true : undefined, 5000);

    // Extract interpreter info from ReplyIdentify
    let info = {};
    for (const msg of conn.messages) {
      if (msg[0] === 'ReplyIdentify') info = msg[1];
    }
    conn.disconnect();
    output({ ok: true, output: `Connected to ${opts.host}:${opts.port}\n`, promptType: 1, info });
  } catch (err) {
    output({ ok: false, output: `Cannot connect to ${opts.host}:${opts.port}: ${err.message}\n`, promptType: 0 });
  }
}

async function cmdExecute() {
  let expr = opts.expr;
  if (opts.file) {
    expr = fs.readFileSync(opts.file, 'utf8').replace(/^\uFEFF/, ''); // strip BOM
  }
  if (!expr) {
    output({ ok: false, output: 'No expression provided. Use positional arg or --file\n', promptType: 0 });
    return;
  }

  const conn = new RideConnection(opts.host, opts.port, opts.timeout);
  try {
    await conn.connect();
  } catch (err) {
    output({ ok: false, output: `Cannot connect: ${err.message}\n`, promptType: 0 });
    return;
  }

  // Wait for initial SetPromptType (interpreter ready after Connect)
  await conn.waitFor((msgs) => msgs.some(m => m[0] === 'SetPromptType') ? true : undefined, 5000);

  // Clear message buffer before execute
  conn.messages = [];

  // Send Execute (text must end with \n per RIDE protocol)
  conn.send('Execute', { text: expr.endsWith('\n') ? expr : expr + '\n', trace: 0 });

  // Wait for SetPromptType (indicates execution complete)
  const prompt = await waitForPrompt(conn);

  const outputText = collectOutput(conn.messages);
  const isError = hasError(conn.messages);

  if (prompt === undefined) {
    // Timeout
    conn.disconnect();
    output({ ok: false, output: outputText, timeout: true, promptType: 0 });
    return;
  }

  const promptType = prompt.type || 0;
  const result = { ok: !isError, output: outputText, promptType };

  // Check if waiting for input
  if (promptType === 2) result.waiting_for_input = 'quad';
  else if (promptType === 4) result.waiting_for_input = 'quote-quad';

  conn.disconnect();
  output(result);
}

async function cmdGetLog() {
  const conn = new RideConnection(opts.host, opts.port, opts.timeout);
  try {
    await conn.connect();
  } catch (err) {
    output({ ok: false, output: `Cannot connect: ${err.message}\n`, promptType: 0 });
    return;
  }

  await conn.waitFor((msgs) => msgs.some(m => m[0] === 'SetPromptType') ? true : undefined, 5000);
  conn.messages = [];

  conn.send('GetLog', { format: 'text', maxLines: -1 });

  // Wait for ReplyGetLog
  const result = await conn.waitFor((msgs) => {
    for (const m of msgs) {
      if (m[0] === 'ReplyGetLog') return m[1];
    }
    return undefined;
  }, 10000);

  conn.disconnect();

  if (result) {
    output({ ok: true, log: result.result || [], promptType: 1 });
  } else {
    output({ ok: false, output: 'Timeout waiting for log\n', promptType: 0 });
  }
}

async function cmdGetSIStack() {
  const conn = new RideConnection(opts.host, opts.port, opts.timeout);
  try {
    await conn.connect();
  } catch (err) {
    output({ ok: false, output: `Cannot connect: ${err.message}\n`, promptType: 0 });
    return;
  }

  await conn.waitFor((msgs) => msgs.some(m => m[0] === 'SetPromptType') ? true : undefined, 5000);
  conn.messages = [];

  conn.send('GetSIStack', {});

  const result = await conn.waitFor((msgs) => {
    for (const m of msgs) {
      if (m[0] === 'ReplyGetSIStack') return m[1];
    }
    return undefined;
  }, 10000);

  conn.disconnect();

  if (result) {
    output({ ok: true, stack: result.stack || [], promptType: 1 });
  } else {
    output({ ok: false, output: 'Timeout waiting for SI stack\n', promptType: 0 });
  }
}

// --- Utilities ---

function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Main ---
async function main() {
  switch (verb) {
    case 'start': await cmdStart(); break;
    case 'stop': await cmdStop(); break;
    case 'status': await cmdStatus(); break;
    case 'execute': await cmdExecute(); break;
    case 'getlog': await cmdGetLog(); break;
    case 'getsistack': await cmdGetSIStack(); break;
    default:
      output({ ok: false, output: `Unknown verb: ${verb}. Use: start|stop|status|execute|getlog|getsistack\n`, promptType: 0 });
      process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  output({ ok: false, output: `Fatal: ${err.message}\n`, promptType: 0 });
  process.exit(1);
});
