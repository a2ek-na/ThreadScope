# ThreadScope
ThreadScope is a web app that lets you paste/write a small multithreaded program (C++ for the MVP), run it safely, and watch exactly what every thread and lock does over time with live, easy-to-understand visualizations and automatic hints (e.g., “possible deadlock detected”).

Bootstrap scaffold to run a local C++ program that emits NDJSON trace lines, served to a browser via WebSocket.

## Run locally
1. Install deps: `npm install`
2. Start server (dev): `npx nodemon server/index.js` or `node server/index.js`
3. Open browser: http://localhost:3000
4. Paste code (or use `runner/examples/example.cpp` contents), click Run.

**Warning**: This runs compiled binaries locally. Do not run untrusted code.

