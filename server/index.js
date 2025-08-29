//ThreadScope Server
const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');

const app = express();
app.use(express.json());

const TIMEOUT_MS = 8000;
const MAX_SOURCE_BYTES = 200_000; // 200 KB

app.use('/', express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const runClients = new Map(); // runId -> Set<WebSocket>
const detectors = new Map();  // runId -> DeadlockDetector

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const runId = url.searchParams.get('runId');
  if (!runId) {
    ws.send(JSON.stringify({ error: 'Connection requires a ?runId parameter.' }));
    return ws.close();
  }

  if (!runClients.has(runId)) runClients.set(runId, new Set());
  runClients.get(runId).add(ws);

  ws.on('close', () => {
    const clients = runClients.get(runId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) runClients.delete(runId);
    }
  });
});

function sendToRun(runId, obj) {
  const clients = runClients.get(runId);
  if (!clients) return;

  const msg = JSON.stringify(obj);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function getDetector(runId) {
  if (detectors.has(runId)) return detectors.get(runId);

  const detector = {
    lockOwner: new Map(), // lock -> tid
    waitingFor: new Map(), // tid -> lock
    sentHint: false,
    onEvent(evt) {
      const t = evt.type;
      const tid = String(evt.tid || '0');
      if (t === 'lock_acquired') {
        this.lockOwner.set(evt.lock, tid);
        this.waitingFor.delete(tid);
      } else if (t === 'lock_acquire_attempt' || t === 'lock_try_failed') {
        if (this.lockOwner.has(evt.lock)) {
          this.waitingFor.set(tid, evt.lock);
          return this.checkCycle(tid);
        } else {
          this.waitingFor.delete(tid);
        }
      } else if (t === 'lock_released') {
        if (this.lockOwner.get(evt.lock) === tid) this.lockOwner.delete(evt.lock);
      }
      return null;
    },
    checkCycle(startTid) {
        if (this.sentHint) return;
        let path = [], seen = new Set(), curTid = startTid;
        while (curTid && !seen.has(curTid)) {
            seen.add(curTid);
            path.push(curTid);
            const lock = this.waitingFor.get(curTid);
            if (!lock) return null;
            curTid = this.lockOwner.get(lock);
        }
        if (curTid && seen.has(curTid)) {
            const cycleStartIndex = path.indexOf(curTid);
            if (cycleStartIndex !== -1) {
                const cycle = path.slice(cycleStartIndex);
                this.sentHint = true;
                return { kind: 'deadlock', message: `Possible deadlock involving threads: ${cycle.join(' -> ')} -> ${curTid}` };
            }
        }
        return null;
    }
  };
  detectors.set(runId, detector);
  return detector;
}


function compileSource(source, dirPath) {
  return new Promise((resolve, reject) => {
    const srcPath = path.join(dirPath, 'prog.cpp');
    const binPath = path.join(dirPath, 'prog');
    fs.writeFileSync(srcPath, source);

    const compile = spawn('g++', [srcPath, '-pthread', '-std=c++17', '-O0', '-g', '-o', binPath]);
    let compileErr = '';
    compile.stderr.on('data', d => compileErr += d.toString());
    
    compile.on('error', err => reject(new Error('Compiler spawn failed.')));
    
    compile.on('close', code => {
      if (code !== 0) {
        const error = new Error(compileErr || 'Compilation failed.');
        error.isCompileError = true;
        return reject(error);
      }
      resolve(binPath);
    });
  });
}

function executeAndStream(binPath, runId, tmpdir) {
  const detector = getDetector(runId);
  const proc = spawn(binPath, [], { cwd: tmpdir.name, stdio: ['ignore', 'pipe', 'pipe'] });
  
  let buffer = '';
  proc.stdout.on('data', chunk => {
    buffer += chunk.toString();
    let lines = buffer.split('\n');
    buffer = lines.pop(); 
    lines.forEach(line => {
      if (!line) return;
      sendToRun(runId, { type: 'stdout', raw: line });
      try {
        const evt = JSON.parse(line);
        if (evt && evt.type) {
          sendToRun(runId, { type: 'event', event: evt });
          const hint = detector.onEvent(evt);
          if (hint) sendToRun(runId, { type: 'hint', hint });
        }
      } catch (e) { }
    });
  });

  proc.stderr.on('data', d => sendToRun(runId, { type: 'stderr', raw: d.toString() }));

  proc.on('error', err => sendToRun(runId, { type: 'stderr', raw: `Process failed to start: ${err.message}` }));
  
  const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (e) {}
  }, TIMEOUT_MS);

  proc.on('close', (code, signal) => {
    clearTimeout(killTimer);
    sendToRun(runId, { type: 'finished', code, signal });
    detectors.delete(runId);
    try { tmpdir.removeCallback(); } catch (e) { console.error(`Failed to clean tmpdir ${tmpdir.name}`, e); }
  });
}


app.post('/run', async (req, res) => {
  const { source } = req.body;

  if (!source || typeof source !== 'string' || source.trim().length === 0) {
    return res.status(400).json({ error: 'Source code must be a non-empty string.' });
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return res.status(400).json({ error: `Source code exceeds maximum size of ${MAX_SOURCE_BYTES / 1000} KB.` });
  }
  
  const tmpdir = tmp.dirSync({ unsafeCleanup: true });

  try {
    const binPath = await compileSource(source, tmpdir.name);
    
    const runId = Math.random().toString(36).slice(2, 9);
    res.json({ runId });

    executeAndStream(binPath, runId, tmpdir);

  } catch (err) {
    try { tmpdir.removeCallback(); } catch (e) {} 
    if (err.isCompileError) {
      return res.status(400).json({ compileError: err.message });
    }
    console.error('Server error during run setup:', err);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));