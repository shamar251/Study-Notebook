import { app as electronApp, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from "electron"
import * as path from "path"
import * as fs from "fs"
import { spawn, ChildProcess } from 'child_process';
const serve = require("electron-serve")
const { runRagPipeline } = require("./lib/ragHandler.js");
const pathToEmbed = path.join(__dirname, "../lib/brain/processors/embed.js");
let getEmbedding: ((text: string, model?: string, maxRetries?: number) => Promise<number[]>) | null = null;
try {
  // Lazy require to avoid startup failures if file structure differs in dev vs prod
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const embedMod = require(pathToEmbed);
  getEmbedding = embedMod?.getEmbedding || null;
} catch (e) {
  getEmbedding = null;
}

async function getEmbeddingViaHttp(text: string, model = 'nomic-embed-text'): Promise<number[]> {
  return new Promise((resolve, reject) => {
    try {
      const http = require('http');
      const https = require('https');
      const url = new URL('http://localhost:11434/api/embeddings');
      const isHttps = url.protocol === 'https:';
      const reqModule = isHttps ? https : http;
      const body = JSON.stringify({ model, prompt: text });
      const req = reqModule.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res2: any) => {
        let data = '';
        res2.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res2.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json && Array.isArray(json.embedding)) return resolve(json.embedding as number[]);
            reject(new Error('No embedding in response'));
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', (err: any) => reject(err));
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

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
  // Not using a separate Express server.js; renderer will call Next.js or IPC directly

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

ipcMain.handle('ollama-list', async () => {
  return new Promise<string[]>((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('ollama', ['list']);
    let output = '';
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });
    proc.on('close', () => {
      // Parse output, skip header, get first column (model name)
      const lines = output.split('\n').slice(1);
      const models = lines
        .map(line => line.trim().split(/\s+/)[0])
        .filter(name => name && name !== 'NAME');
      resolve(models);
    });
    proc.on('error', () => resolve([]));
  });
});

ipcMain.handle('rag-query', async (_event, { note_id, query, allBlocks, topK = 10, folder_id, model, temperature, top_p }) => {
  console.log('[Main] rag-query handler received:', query);
  try {
    const result = await runRagPipeline({ note_id, query, allBlocks, topK, folder_id, model, temperature, top_p });
    return { success: true, ...result };
  } catch (error) {
    console.error('RAG error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB) || 1e-12;
  return dot / denom;
}

async function judgeWithLLM({ userAnswer, correctAnswer, model, temperature, top_p }: { userAnswer: string; correctAnswer: string; model: string; temperature?: number; top_p?: number; }): Promise<{ decision: 'correct' | 'partial' | 'incorrect'; raw: string }> {
  const prompt = `You are an expert grading assistant. Determine if the student's answer has the same meaning as the correct answer, allowing for paraphrasing.\n\nStudent answer: "${userAnswer}"\nCorrect answer: "${correctAnswer}"\n\nReply with exactly one of the following words:\n- Correct\n- Partially Correct\n- Incorrect`;

  const http = require('http');
  const https = require('https');
  const url = new URL('http://localhost:11434/api/generate');
  const isHttps = url.protocol === 'https:';
  const reqModule = isHttps ? https : http;
  const postData = JSON.stringify({
    model: model || 'llama3:latest',
    prompt,
    options: {
      temperature: typeof temperature === 'number' ? temperature : 0,
      top_p: typeof top_p === 'number' ? top_p : 0.9,
    },
  });

  let raw = '';
  const dataStr: string = await new Promise((resolve, reject) => {
    const req = reqModule.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res2: any) => {
      let buffer = '';
      res2.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) raw += data.response;
            if (data.done) {
              resolve(raw.trim());
              return;
            }
          } catch { /* ignore */ }
        }
      });
      res2.on('end', () => resolve(raw.trim()));
    });
    req.on('error', (err: any) => reject(err));
    req.write(postData);
    req.end();
  });
  raw = dataStr || '';
  const normalized = raw.toLowerCase();
  if (normalized.includes('partially')) return { decision: 'partial', raw };
  if (normalized.includes('incorrect')) return { decision: 'incorrect', raw };
  if (normalized.includes('correct')) return { decision: 'correct', raw };
  return { decision: 'partial', raw };
}

ipcMain.handle('quiz-grade', async (_event, { userAnswer, correctAnswer, low = 0.65, high = 0.9, model, temperature, top_p }) => {
  try {
    console.log('[QUIZ-GRADE] incoming', { userAnswer, correctAnswer, low, high, model, temperature, top_p });
    if (typeof userAnswer !== 'string' || typeof correctAnswer !== 'string') {
      return { success: false, error: 'userAnswer and correctAnswer must be strings' };
    }
    const embeddingModel = 'nomic-embed-text';
    const [uEmb, cEmb] = await Promise.all([
      (getEmbedding ? getEmbedding(userAnswer, embeddingModel) : getEmbeddingViaHttp(userAnswer, embeddingModel)),
      (getEmbedding ? getEmbedding(correctAnswer, embeddingModel) : getEmbeddingViaHttp(correctAnswer, embeddingModel)),
    ]);
    const cosine = cosineSimilarity(uEmb, cEmb);
    console.log('[QUIZ-GRADE] cosine', cosine);
    if (cosine >= high) {
      console.log('[QUIZ-GRADE] decision by cosine: correct');
      return { success: true, decision: 'correct', cosine };
    }
    if (cosine <= low) {
      console.log('[QUIZ-GRADE] decision by cosine: incorrect');
      return { success: true, decision: 'incorrect', cosine };
    }
    const judged = await judgeWithLLM({ userAnswer, correctAnswer, model, temperature, top_p });
    console.log('[QUIZ-GRADE] decision by LLM:', judged.decision);
    return { success: true, decision: judged.decision, cosine, raw: judged.raw };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[QUIZ-GRADE] error', msg);
    return { success: false, error: msg };
  }
});

// Generate an LLM-based hint for the current question
ipcMain.handle('quiz-hint', async (_event, { question, options, correctAnswer, model, temperature, top_p }) => {
  try {
    const http = require('http');
    const https = require('https');
    const url = new URL('http://localhost:11434/api/generate');
    const isHttps = url.protocol === 'https:';
    const reqModule = isHttps ? https : http;

    const optsText = Array.isArray(options) && options.length > 0
      ? `\nOptions: ${options.map((o: string, i: number) => `(${i + 1}) ${o}`).join(' ')}`
      : '';

    const noRevealLine = 'Do NOT reveal or state the exact answer. Never output the exact solution word or phrase.';
    const correctGuard = typeof correctAnswer === 'string' && correctAnswer.trim().length > 0
      ? `\nThe correct answer is known to you for evaluation but you must not reveal it: [REDACTED]. ${noRevealLine}`
      : `\n${noRevealLine}`;

    const prompt = `You are a supportive tutor. Provide a single, concise hint (1-2 sentences) to help a student answer this quiz question without giving the answer away.${correctGuard}\nFocus on the key concept or a way to eliminate distractors.${optsText}\n\nQuestion: ${question}\n\nHint:`;

    const postData = JSON.stringify({
      model: model || 'llama3:latest',
      prompt,
      options: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        top_p: typeof top_p === 'number' ? top_p : 0.9,
      },
    });

    const hint: string = await new Promise((resolve, reject) => {
      let acc = '';
      const req = reqModule.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      }, (res2: any) => {
        let buffer = '';
        res2.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.response) acc += data.response;
              if (data.done) { resolve(acc.trim()); return; }
            } catch { /* ignore streaming parse errors */ }
          }
        });
        res2.on('end', () => resolve(acc.trim()));
      });
      req.on('error', (err: any) => reject(err));
      req.write(postData);
      req.end();
    });

    function sanitizeHint(raw: string, answer: string): string {
      let out = (raw || '').replace(/```[\s\S]*?```/g, '').replace(/`([^`]+)`/g, '$1');
      out = out.replace(/^(hint[:\-\s]*)/i, '').trim();
      // Limit to 1–2 sentences
      const parts = out.split(/(?<=[.!?])\s+/).slice(0, 2);
      out = parts.join(' ').trim();
      // Mask the exact answer if present (case/space-insensitive)
      const ans = (answer || '').trim();
      if (ans.length > 0) {
        const escaped = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const re = new RegExp(escaped, 'ig');
        out = out.replace(re, '____');
        if (/^(true|false)$/i.test(ans)) {
          out = out.replace(/\btrue\b/ig, '____').replace(/\bfalse\b/ig, '____');
        }
      }
      // Final guard phrases
      out = out.replace(/\b(the\s+answer\s+is|it\s+is)\b[^.?!]*/ig, '').trim();
      if (!out) out = 'Focus on the underlying concept and how it applies; eliminate clearly incorrect choices.';
      return out.slice(0, 240);
    }

    const cleaned = sanitizeHint(hint, correctAnswer);
    return { success: true, hint: cleaned };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
});

// Simple logging bridge from renderer -> main (so logs show in terminal)
ipcMain.handle('log', async (_event, payload: any) => {
  try {
    if (typeof payload === 'string') {
      console.log('[RENDERER]', payload);
    } else {
      console.log('[RENDERER]', JSON.stringify(payload));
    }
    return { ok: true };
  } catch (e: any) {
    console.error('[RENDERER][LOG] error', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
});
