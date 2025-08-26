"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    saveFile: function (data) { return electron_1.ipcRenderer.invoke("save-file", data); },
    openFile: function () { return electron_1.ipcRenderer.invoke("open-file"); },
    ragQuery: function (args) { return electron_1.ipcRenderer.invoke("rag-query", args); },
    gradeAnswer: function (args) { return electron_1.ipcRenderer.invoke("quiz-grade", args); },
    hint: function (args) { return electron_1.ipcRenderer.invoke("quiz-hint", args); },
    log: function (payload) { return electron_1.ipcRenderer.invoke("log", payload); },
});
