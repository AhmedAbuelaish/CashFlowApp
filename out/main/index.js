"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const is = {
  dev: !electron.app.isPackaged
};
({
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
});
let mainWindow = null;
const userDataPath = electron.app.getPath("userData");
const prefsPath = path.join(userDataPath, "prefs.json");
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (is.dev) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow.webContents.send("app:before-close");
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  buildMenu();
}
function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("menu:new")
        },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:open")
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow?.webContents.send("menu:save")
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About CashFlow Planner",
          click: () => {
            electron.dialog.showMessageBox(mainWindow, {
              title: "About CashFlow Planner",
              message: "CashFlow Planner v1.0.0",
              detail: "Local-first cash-flow planning for households and scenarios."
            });
          }
        }
      ]
    }
  ];
  if (process.platform === "darwin") {
    template.unshift({
      label: electron.app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    });
  }
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
electron.ipcMain.handle("file:showSaveDialog", async (_, defaultName) => {
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: "CashFlow Files", extensions: ["cashflow.json", "json"] }]
  });
  return { canceled: result.canceled, filePath: result.filePath };
});
electron.ipcMain.handle("file:showOpenDialog", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    filters: [{ name: "CashFlow Files", extensions: ["cashflow.json", "json"] }],
    properties: ["openFile"]
  });
  return {
    canceled: result.canceled,
    filePath: result.filePaths[0]
  };
});
electron.ipcMain.handle("file:open", async (_, filePath) => {
  try {
    let targetPath = filePath;
    if (!targetPath) {
      const dlg = await electron.dialog.showOpenDialog(mainWindow, {
        filters: [{ name: "CashFlow Files", extensions: ["cashflow.json", "json"] }],
        properties: ["openFile"]
      });
      if (dlg.canceled || !dlg.filePaths[0]) {
        return { success: false, error: "Canceled" };
      }
      targetPath = dlg.filePaths[0];
    }
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `File not found: ${targetPath}` };
    }
    const raw = fs.readFileSync(targetPath, "utf-8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { success: false, error: "File is not valid JSON" };
    }
    return { success: true, data, filePath: targetPath };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
electron.ipcMain.handle("file:save", async (_, filePath, data) => {
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
electron.ipcMain.handle("file:new", async (_, filePath, data) => {
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
electron.ipcMain.handle("prefs:getRecentFiles", async () => {
  try {
    if (!fs.existsSync(prefsPath)) return [];
    const raw = fs.readFileSync(prefsPath, "utf-8");
    const prefs = JSON.parse(raw);
    return prefs.recentFiles ?? [];
  } catch {
    return [];
  }
});
electron.ipcMain.handle("prefs:setRecentFile", async (_, file) => {
  try {
    let prefs = {};
    if (fs.existsSync(prefsPath)) {
      prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
    }
    const existing = prefs.recentFiles ?? [];
    const filtered = existing.filter(
      (f) => f.path !== file.path
    );
    prefs.recentFiles = [file, ...filtered].slice(0, 10);
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), "utf-8");
  } catch {
  }
});
electron.ipcMain.handle("export:csv", async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
electron.ipcMain.handle("export:json", async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
electron.ipcMain.handle("app:confirmClose", async (_, shouldClose) => {
  if (shouldClose) {
    mainWindow?.destroy();
    electron.app.quit();
  }
});
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
