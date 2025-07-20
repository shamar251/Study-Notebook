import { app, BrowserWindow, ipcMain, dialog } from "electron"
import * as path from "path"
import * as fs from "fs"
import { spawn, ChildProcess } from 'child_process';
const serve = require("electron-serve")

// Determine if we're in development or production
const isDev = process.env.NODE_ENV === "development"
console.log("Running in", isDev ? "development" : "production", "mode")
const appServe = !isDev ? serve({ directory: "out" }) : null

// Keep a global reference of the window object to avoid garbage collection
let mainWindow: BrowserWindow | null = null
let ollamaProcess: ChildProcess | null = null;

function isOllamaRunning(port = 11434) {
  return new Promise(resolve => {
    const net = require('net');
    const socket = net.createConnection(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function ensureOllamaRunning() {
  const running = await isOllamaRunning();
  if (!running) {
    ollamaProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    ollamaProcess.unref();
    console.log('Started Ollama server');
  } else {
    console.log('Ollama already running');
  }
}

async function stopOllama() {
  if (ollamaProcess) {
    if (typeof ollamaProcess.kill === 'function') {
      ollamaProcess.kill();
    }
    ollamaProcess = null;
    console.log('Stopped Ollama server');
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1350,
    height: 750,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    // Set app icon
    icon: path.join(__dirname, "../assets/Sophia.png"),
  })

  // Hide the menu bar
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  // Load the app
  if (isDev) {
    // In development, load from the local server
    // Check if port 3000 is in use, if so try 3001
    const tryLoadURL = async (url: string): Promise<void> => {
      try {
        await mainWindow!.loadURL(url)
        console.log(`Successfully loaded ${url}`)
        // Open DevTools only if needed (can be controlled by an environment variable)
        if (process.env.OPEN_DEVTOOLS === 'true') {
          mainWindow!.webContents.openDevTools()
        }
      } catch (error) {
        console.error(`Failed to load ${url}:`, error)
        if (url.includes('3000')) {
          console.log('Trying port 3001 instead...')
          await tryLoadURL('http://localhost:3001')
        }
      }
    }

    tryLoadURL('http://localhost:3000')
  } else {
    // In production, load from the built files
    appServe(mainWindow).then(() => {
      mainWindow?.loadURL('app://-')
    }).catch((err: Error) => {
      console.error('Failed to load app in production mode:', err)
    })
  }

  // Emitted when the window is closed
  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

// Create window when Electron is ready
app.whenReady().then(async () => {
  // Start Ollama on app startup
  await ensureOllamaRunning();
  createWindow();

  app.on("activate", () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (mainWindow === null) createWindow();
  });
})

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// Handle file operations
ipcMain.handle("save-file", async (event, { content, filePath }) => {
  try {
    if (!filePath) {
      const { canceled, filePath: selectedPath } = await dialog.showSaveDialog({
        defaultPath: "notes.json",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      })

      if (canceled || !selectedPath) return { success: false, message: "Operation cancelled" }
      filePath = selectedPath
    }

    fs.writeFileSync(filePath, content)
    return { success: true, filePath }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
})

ipcMain.handle("open-file", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    })

    if (canceled || filePaths.length === 0) return { success: false, message: "Operation cancelled" }

    const content = fs.readFileSync(filePaths[0], "utf8")
    return { success: true, content, filePath: filePaths[0] }
  } catch (error) {
    return { success: false, message: (error as Error).message }
  }
})

// IPC handler to enable/disable Ollama from renderer
ipcMain.handle('ollama-toggle', async (_event, enabled: boolean) => {
  if (enabled) {
    await ensureOllamaRunning();
    return { running: true };
  } else {
    await stopOllama();
    return { running: false };
  }
});
