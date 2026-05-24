"use strict";
const electron = require("electron");
const fileAPI = {
  newFile: (filePath, initialData) => electron.ipcRenderer.invoke("file:new", filePath, initialData),
  openFile: (filePath) => electron.ipcRenderer.invoke("file:open", filePath),
  saveFile: (filePath, data) => electron.ipcRenderer.invoke("file:save", filePath, data),
  showSaveDialog: (defaultName) => electron.ipcRenderer.invoke("file:showSaveDialog", defaultName),
  showOpenDialog: () => electron.ipcRenderer.invoke("file:showOpenDialog"),
  getRecentFiles: () => electron.ipcRenderer.invoke("prefs:getRecentFiles"),
  setRecentFile: (file) => electron.ipcRenderer.invoke("prefs:setRecentFile", file),
  exportCSV: (filePath, content) => electron.ipcRenderer.invoke("export:csv", filePath, content),
  exportJSON: (filePath, content) => electron.ipcRenderer.invoke("export:json", filePath, content),
  // Menu events
  onMenuNew: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("menu:new", handler);
    return () => electron.ipcRenderer.removeListener("menu:new", handler);
  },
  onMenuOpen: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("menu:open", handler);
    return () => electron.ipcRenderer.removeListener("menu:open", handler);
  },
  onMenuSave: (callback) => {
    const handler = () => callback();
    electron.ipcRenderer.on("menu:save", handler);
    return () => electron.ipcRenderer.removeListener("menu:save", handler);
  },
  // Before-close dialog
  onBeforeClose: (callback) => {
    const handler = async () => {
      const shouldClose = await callback();
      electron.ipcRenderer.invoke("app:confirmClose", shouldClose);
    };
    electron.ipcRenderer.on("app:before-close", handler);
    return () => electron.ipcRenderer.removeListener("app:before-close", handler);
  }
};
electron.contextBridge.exposeInMainWorld("fileAPI", fileAPI);
