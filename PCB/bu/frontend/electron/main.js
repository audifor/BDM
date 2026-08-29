const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

let engine = null;
let nextId = 1;
const pending = new Map();

function getProjectRoot() {
  const appPath = app.getAppPath();
  if (path.basename(appPath).toLowerCase() === "frontend") {
    return path.resolve(appPath, "..");
  }
  return appPath;
}

function startEngine() {
  if (engine) return;

  const root = getProjectRoot();
  const python = process.env.PCBASKET_PYTHON || "python";
  const enginePath = path.join(root, "backend", "app", "main.py");
  const dbPath = path.join(root, "backend", "data", "dev.sqlite");
  const dbExists = fs.existsSync(dbPath);

  const args = [enginePath, "--db", dbPath, "--init-db"];
  if (!dbExists) {
    args.push("--seed");
  }

  engine = spawn(python, args, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  engine.on("exit", (code, signal) => {
    const msg = { code, signal };
    for (const [, item] of pending) {
      item.reject(new Error("Engine exited"));
    }
    pending.clear();
    engine = null;
    broadcast("engine.error", { type: "exit", detail: msg });
  });

  engine.stderr.on("data", (buf) => {
    broadcast("engine.error", { type: "stderr", detail: buf.toString() });
  });

  const rl = readline.createInterface({ input: engine.stdout });
  rl.on("line", (line) => {
    handleEngineLine(line);
  });
}

function handleEngineLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    broadcast("engine.error", { type: "parse", detail: line });
    return;
  }

  if (msg && typeof msg.request_id !== "undefined") {
    const key = String(msg.request_id);
    const item = pending.get(key);
    if (item) {
      pending.delete(key);
      item.resolve(msg);
    }
    return;
  }

  if (msg && msg.event) {
    broadcast("engine.event", msg);
    return;
  }
}

function sendRequest(command, payload) {
  return new Promise((resolve, reject) => {
    startEngine();
    if (!engine || !engine.stdin.writable) {
      reject(new Error("Engine not available"));
      return;
    }

    const request_id = String(nextId++);
    pending.set(request_id, { resolve, reject });
    const wire = JSON.stringify({ request_id, command, payload: payload || {} });
    engine.stdin.write(wire + "\n");
  });
}

function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

function createWindow() {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    autoHideMenuBar: !isDev,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "dist", "index.html"));
  }

  win.setMenuBarVisibility(isDev);
  win.setAutoHideMenuBar(!isDev);

  win.once("ready-to-show", () => {
    win.setFullScreen(true);
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Enter" && input.alt) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
}

ipcMain.handle("engine.invoke", async (_evt, req) => {
  const command = req?.command;
  const payload = req?.payload;
  if (!command) {
    return { ok: false, error: { code: "BAD_REQUEST", message: "Missing command" } };
  }
  return sendRequest(command, payload);
});

app.whenReady().then(() => {
  startEngine();
  createWindow();
});

app.on("before-quit", () => {
  if (engine) {
    engine.kill();
    engine = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
