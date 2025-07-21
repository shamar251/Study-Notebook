import { app as electronApp, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from "electron"
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
let apiProcess: ChildProcess | null = null;

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

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') resolve(true);
        else resolve(false);
      })
      .once('listening', () => {
        tester.close();
        resolve(false);
      })
      .listen(port);
  });
}

async function waitForServerReady(port: number, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortInUse(port)) return true;
    await new Promise(res => setTimeout(res, 200));
  }
  return false;
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

  // Hide or show the menu bar based on environment
  mainWindow.setMenuBarVisibility(isDev ? false : true);
  mainWindow.setAutoHideMenuBar(isDev ? true : false);

  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    // { role: 'appMenu' }
    ...(isMac ? [{
      label: electronApp.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
          { type: 'separator' as const },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' as const },
              { role: 'stopSpeaking' as const }
            ]
          }
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://github.com/Study-Notebook')
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

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
electronApp.whenReady().then(async () => {
  // Start Ollama on app startup
  await ensureOllamaRunning();

  // Start Express API server if not already running
  if (!(await isPortInUse(3001))) {
    let serverPath;
    if (electronApp.isPackaged) {
      serverPath = path.join(electronApp.getAppPath(), 'server.js');
    } else {
      serverPath = path.join(process.cwd(), 'server.js');
    }
    console.log('[Electron] Spawning server.js at:', serverPath);
    apiProcess = spawn('node', [serverPath], {
      stdio: 'inherit',
      shell: true,
    });
    apiProcess?.on('error', (err: any) => {
      console.error('[Electron] API server process error:', err);
    });
    apiProcess?.on('exit', (code: number, signal: string) => {
      console.log(`[Electron] API server exited with code ${code}, signal ${signal}`);
    });
  } else {
    console.log('[Electron] API server already running on port 3001.');
  }

  // Wait for server to be ready before loading frontend
  await waitForServerReady(3001);

  createWindow();

  electronApp.on("activate", () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (mainWindow === null) createWindow();
  });
})

// Quit when all windows are closed, except on macOS
electronApp.on("window-all-closed", () => {
  if (process.platform !== "darwin") electronApp.quit()
})

// Ensure Express server is killed when Electron quits or on exit signals
function shutdownApiProcess() {
  apiProcess?.kill();
  apiProcess = null;
}
electronApp.on('quit', shutdownApiProcess);
process.on('SIGINT', () => { shutdownApiProcess(); process.exit(); });
process.on('SIGTERM', () => { shutdownApiProcess(); process.exit(); });

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
