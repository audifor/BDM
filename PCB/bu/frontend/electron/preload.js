const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pcbasket", {
  invoke: (command, payload) => ipcRenderer.invoke("engine.invoke", { command, payload }),
  on: (channel, handler) => {
    const allowed = ["engine.event", "engine.error"];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_evt, data) => handler(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
