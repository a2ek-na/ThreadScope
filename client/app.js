// client/app.js
const runBtn = document.getElementById('run');
const editor = document.getElementById('editor');
const log = document.getElementById('log');
const status = document.getElementById('status');

const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => appendLog('Web Socket connected');
ws.onclose = () => appendLog('Web Socket disconnected');
ws.onmessage = (ev) => {
  try {
    const d = JSON.parse(ev.data); // { runId, line } or { runId, event: 'finished' }
    if (d.line) {
      // d.line is a JSON string emitted by C++ (NDJSON)
      appendLog(`[run ${d.runId}] ${d.line}`);
    } else if (d.stderr) {
      appendLog(`[run ${d.runId}] STDERR: ${d.stderr}`);
    } else if (d.event) {
      appendLog(`[run ${d.runId}] event: ${d.event} code=${d.code}`);
    } else {
      appendLog(JSON.stringify(d));
    }
  } catch (e) {
    appendLog('malformed ws message: ' + ev.data);
  }
};

function appendLog(s) {
  log.innerText += s + '\n';
  log.scrollTop = log.scrollHeight;
}

runBtn.onclick = async () => {
  const source = editor.value;
  status.innerText = 'Submitting...';
  try {
    const r = await fetch('/run', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ source })
    });
    const j = await r.json();
    if (j.compileError) {
      appendLog('[compile error] ' + j.compileError);
      status.innerText = 'Compile error';
    } else {
      appendLog('[start] runId: ' + j.runId);
      status.innerText = 'Running: ' + j.runId;
    }
  } catch (err) {
    appendLog('[error] ' + err);
    status.innerText = 'Error';
  }
};
