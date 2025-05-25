import { contextBridge, ipcRenderer } from "electron"

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  saveFile: (data: { content: string; filePath?: string }) => ipcRenderer.invoke("save-file", data),
  openFile: () => ipcRenderer.invoke("open-file"),
})

// Add TypeScript interface for window object
declare global {
  interface Window {
    electronAPI: {
      saveFile: (data: { content: string; filePath?: string }) => Promise<{
        success: boolean
        filePath?: string
        message?: string
      }>
      openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; message?: string }>
    }
  }
}
