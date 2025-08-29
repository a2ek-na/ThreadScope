document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // Elements 
  const state = {
    ws: null,
    currentRunId: null,
    events: [],
    t0: null,
    pxPerMs: 0.3,
  };

  const dom = {
    runBtn: document.getElementById('run'),
    editor: document.getElementById('editor'),
    log: document.getElementById('log'),
    hintEl: document.getElementById('hint'),
    status: document.getElementById('status'),
    svg: document.getElementById('timeline'),
    timelineWrap: document.getElementById('timelineWrap'),
    zoomInput: document.getElementById('zoom'),
    zoomVal: document.getElementById('zoomVal'),
    detailsEl: document.getElementById('details'),
    copyBtn: document.getElementById('copyDetails'),
  };

  // --- 2. Core UI Functions ---
  const appendLog = (s) => {
    dom.log.innerText += s + '\n';
    dom.log.scrollTop = dom.log.scrollHeight;
  };

  const showHint = (message) => {
    dom.hintEl.textContent = `${message}`;
    dom.hintEl.classList.add('visible');
  };

  const clearUI = () => {
    dom.log.innerText = '';
    dom.hintEl.classList.remove('visible');
    state.events = [];
    state.t0 = null;
    dom.detailsEl.textContent = 'Click an event marker to see details here.';
    if (dom.svg) dom.svg.innerHTML = '';
    if (dom.timelineWrap) dom.timelineWrap.scrollLeft = 0;
  };

  // WebSocket and Message Handling 
  const connectWS = (runId) => {
    if (state.ws) {
      try { state.ws.close(); } catch (e) {}
    }
    const scheme = (location.protocol === 'https:') ? 'wss' : 'ws';
    state.ws = new WebSocket(`${scheme}://${location.host}/ws?runId=${runId}`);

    state.ws.onopen = () => appendLog(`Web Socket connected for run ${runId}`);
    state.ws.onmessage = (ev) => {
      try {
        handleMsg(JSON.parse(ev.data));
      } catch (e) {
        appendLog(`ws bad msg: ${ev.data}`);
      }
    };
    state.ws.onclose = (ev) => {
      appendLog(`Web Socket disconnected${ev && ev.code ? ` (code ${ev.code})` : ''}`);
      if (state.currentRunId === runId && dom.status.innerText !== 'Finished') {
        dom.status.innerText = 'Disconnected';
      }
    };
    state.ws.onerror = (err) => appendLog(`[ws error] ${err?.message || JSON.stringify(err)}`);
  };

  const handleMsg = (msg) => {
    switch (msg.type) {
      case 'stdout':
      case 'stderr':
        appendLog(`[${msg.type}] ${msg.raw}`);
        break;
      case 'event':
        appendLog(`[event] ${JSON.stringify(msg.event)}`);
        state.events.push(msg.event);
        updateTimelineView(msg.event);
        break;
      case 'hint':
        appendLog(`[hint] ${JSON.stringify(msg.hint)}`);
        showHint(msg.hint.message);
        break;
      case 'finished':
        appendLog(`[finished] code=${msg.code ?? 'N/A'}${msg.signal ? ` signal=${msg.signal}` : ''}`);
        dom.status.innerText = 'Finished';
        if (msg.signal) {
          showHint(`Process terminated by signal: ${msg.signal}`);
        }
        break;
      default:
        appendLog(`[msg] ${JSON.stringify(msg)}`);
    }
  };

 

  const createSvgElement = (tag, attributes) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const key in attributes) {
      el.setAttribute(key, attributes[key]);
    }
    return el;
  };

  const renderTimeline = () => {
    if (!dom.svg) return;

    const lanes = {};
    let maxTime = state.t0 || 0;
    state.events.forEach(ev => {
      if (typeof ev.time !== 'number') return;
      const tid = ev.tid || 'main';
      if (!lanes[tid]) lanes[tid] = [];
      lanes[tid].push(ev);
      if (ev.time > maxTime) maxTime = ev.time;
    });

    // Calculate dimensions
    const totalMs = state.t0 !== null ? Math.max(0, maxTime - state.t0) : 0;
    const computedWidth = Math.max(900, 120 + totalMs * state.pxPerMs);
    const laneCount = Object.keys(lanes).length || 1;
    const height = laneCount * 60 + 40;

    dom.svg.setAttribute('width', computedWidth);
    dom.svg.setAttribute('height', height);
    dom.svg.innerHTML = ''; 

    dom.svg.appendChild(createSvgElement('line', { x1: 0, y1: 20, x2: computedWidth, y2: 20, stroke: '#ccc' }));

    // Sort and render each lane
    Object.keys(lanes).sort((a, b) => (Number(a) || 0) - (Number(b) || 0)).forEach((tid, idx) => {
      const y = 40 + idx * 60;
      
      // Thread label and line
      const text = createSvgElement('text', { x: 4, y: y + 6, 'font-size': '12' });
      text.textContent = `Thread ${tid}`;
      dom.svg.appendChild(text);
      dom.svg.appendChild(createSvgElement('line', { x1: 80, y1: y, x2: computedWidth - 20, y2: y, stroke: '#eee', 'stroke-width': 2 }));

      // Event markers
      lanes[tid].forEach(ev => {
        const x = 80 + (ev.time - state.t0) * state.pxPerMs;
        const g = createSvgElement('g');
        const circle = createSvgElement('circle', {
          cx: x, cy: y, r: 7,
          fill: ev.type === 'lock_acquired' ? 'var(--color-primary)' : (ev.type?.includes('lock') ? 'var(--color-accent-orange)' : 'var(--color-primary)'), 
          stroke: '#333', 'stroke-width': '0.5'
        });
        const title = createSvgElement('title');
        title.textContent = JSON.stringify(ev, null, 2);
        
        g.appendChild(circle);
        g.appendChild(title);
        circle.addEventListener('click', () => {
          dom.detailsEl.textContent = JSON.stringify(ev, null, 2);
        });
        dom.svg.appendChild(g);
      });
    });
  };

  const autoScrollToEarliest = () => {
    if (!dom.timelineWrap) return;
    const firstCircle = dom.svg.querySelector('circle');
    if (firstCircle) {
      const minX = Number(firstCircle.getAttribute('cx'));
      dom.timelineWrap.scrollLeft = Math.max(0, minX - 80);
    }
  };

  const updateTimelineView = (newEvent) => {
    const prevT0 = state.t0;
    if (typeof newEvent?.time === 'number') {
      if (state.t0 === null || newEvent.time < state.t0) {
        state.t0 = newEvent.time;
      }
    }
    
    renderTimeline();
    
    if (prevT0 !== state.t0 || dom.timelineWrap.scrollLeft < 50) {
      autoScrollToEarliest();
    }
  };

  // Listeners 
  dom.runBtn.onclick = async () => {
    clearUI();
    dom.status.innerText = 'Submitting...';
    try {
      const response = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: dom.editor.value }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || result.compileError || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }

      state.currentRunId = result.runId;
      appendLog(`Started run ${state.currentRunId}`);
      dom.status.innerText = `Running ${state.currentRunId}`;
      connectWS(state.currentRunId);
    } catch (err) {
      appendLog(`[error] ${err.message}`);
      dom.status.innerText = 'Error';
    }
  };

  dom.zoomInput.addEventListener('input', (e) => {
    state.pxPerMs = parseFloat(e.target.value) || 0.3;
    dom.zoomVal.textContent = `${state.pxPerMs.toFixed(2)} px/ms`;
    renderTimeline();
  });

  dom.copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dom.detailsEl.textContent);
      dom.copyBtn.textContent = 'Copied!';
    } catch (err) {
      dom.copyBtn.textContent = 'Copy failed';
    } finally {
      setTimeout(() => { dom.copyBtn.textContent = 'Copy JSON'; }, 1200);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.ws) state.ws.close();
  });



  state.pxPerMs = parseFloat(dom.zoomInput.value);
  dom.zoomVal.textContent = `${state.pxPerMs.toFixed(2)} px/ms`;
});