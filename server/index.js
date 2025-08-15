const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');

const app = express();
app.use(express.json());

// serve static frontend
app.use('/', express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// simple mapping runId -> ws clients (we'll use ws path with runId filter in client)
wss.on('connection', (ws, req) => {
  // nothing special here; client filters messages by runId
  console.log('WS client connected');
  ws.on('close', () => console.log('WS client disconnected'));
});

app.post('/run', async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: 'source required' });

    const tmpdir = tmp.dirSync({ unsafeCleanup: true });
    const srcPath = path.join(tmpdir.name, 'prog.cpp');
    const binPath = path.join(tmpdir.name, 'prog');

    fs.writeFileSync(srcPath, source);

    const compile = spawn('g++', [srcPath, '-pthread', '-O0', '-g', '-o', binPath]);
    let compileErr = '';
    compile.stderr.on('data', d => compileErr += d.toString());
    compile.on('close', code => {
      if (code !== 0) {
        tmpdir.removeCallback();
        return res.status(400).json({ compileError: compileErr });
      }

      const proc = spawn(binPath, [], { cwd: tmpdir.name });

      const runId = Math.random().toString(36).slice(2, 10);
      res.json({ runId });

      let buf = '';
      proc.stdout.on('data', chunk => {
        buf += chunk.toString();
        let lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines.filter(Boolean)) {
          const msg = JSON.stringify({ runId, line: l });
          // broadcast to all connected WS clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(msg);
          });
        }
      });

      proc.stderr.on('data', d => {
        const msg = JSON.stringify({ runId, stderr: d.toString() });
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) client.send(msg);
        });
      });

      proc.on('close', code => {
        const msg = JSON.stringify({ runId, event: 'finished', code });
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) client.send(msg);
        });
        tmpdir.removeCallback();
      });

      // safety: kill after 8s if still running
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch(e){}
      }, 8000);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
