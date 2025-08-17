# ThreadScope: A Visual C++ Thread Debugger

I built ThreadScope because debugging C++ multithreading with just terminal printouts can be a real headache. It’s tough to keep track of which thread is doing what, who owns which lock, and why everything suddenly grinds to a halt.

This tool is my solution. It lets you **see** what your threads are doing on an interactive timeline, making it much easier to understand and debug tricky concurrency bugs like deadlocks.

## What It Does
  * **See Your Threads in Real-Time**: Watch your program's thread and mutex events show up on the timeline the moment they happen, thanks to a live WebSocket connection.
  * **Interactive Timeline**: The timeline is an SVG that I draw programmatically. Each thread gets its own lane, and you can see when they try to get a lock (🟡), when they succeed (🔵), and when they let go.
  * **Catches Deadlocks for You**: The backend is smart enough to spot when your threads are stuck waiting for each other in a circle. It'll pop up a warning in the UI telling you exactly which threads are involved.
  * **Look Under the Hood**: Curious about a specific event? Just click on any dot on the timeline to see the raw JSON data that was captured.

-----
## The Guts of It (How It Works)
It’s split into two main parts: the Node.js backend and the vanilla JS frontend.
1.  **Sending the Code**: When you hit 'Run', your C++ code gets sent from your browser to the Node.js server.
2.  **Compile & Run**: The server quickly saves the code to a temporary file, compiles it with `g++`, and then runs the new program as a child process.
3.  **Real-Time Chat**: As your C++ program runs, it sends out little JSON messages about what it's doing (like "thread 3 is trying to lock Mutex\_A\!"). It does this by just printing to `stdout`.
4.  **Catch & Forward**: The Node.js server listens to everything your C++ program says. It catches these messages and instantly forwards them to your browser using WebSockets.
5.  **Drawing the Picture**: The JavaScript in the browser listens for these WebSocket messages and draws the circles and lines on the SVG timeline, bringing the execution to life.
6.  **Spotting Trouble**: While all this is happening, the server is also keeping an eye on who has which lock. If it detects a cycle where threads are waiting on each other, it sends a special "deadlock" message to the frontend.

-----

## Tech I Used
  * **Backend**: **Node.js** with **Express.js**. I chose Node because it’s fantastic at handling I/O—perfect for listening to a running program and managing WebSocket connections.
  * **Frontend**: **Vanilla JavaScript (ES6+)**, **HTML5**, and **CSS3**. I decided against a big framework like React because the core challenge here was the SVG rendering, and I wanted to keep it lightweight.
  * **Real-Time Magic**: The `ws` library for WebSockets, which is the key to the real-time communication.

-----

## Get It Running

### You'll need:

  * Node.js (v14 or newer)
  * The `g++` compiler on your system

### Steps:

1.  **Clone the project:**

    ```bash
    git clone https://github.com/your-username/ThreadScope.git
    cd ThreadScope
    ```

2.  **Install the server's dependencies:**

    ```bash
    cd server
    npm install
    ```

3.  **Fire it up:**

    ```bash
    npm start
    ```

    Now you can open `http://localhost:3000` in your browser.

-----

## What's Next?

This was a really fun project to build, and there are a few things I'd love to add next:

  * **Making it Safe (The Big One\!)**: Right now, the server runs any code you give it, which is a major security risk. The next big step is to use **Docker containers** to build a secure sandbox, so each run is completely isolated from the server.
  * **More Events**: I want to add support for visualizing other things, like `std::condition_variable` and semaphores.
  * **A Better UI**: It would be cool to add features like pausing and stepping through the execution event by event.