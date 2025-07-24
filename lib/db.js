"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.StudyNotebookDB = void 0;
exports.initializeDatabase = initializeDatabase;
exports.getFolderPath = getFolderPath;
exports.updateFolderPath = updateFolderPath;
exports.getNextOrder = getNextOrder;
exports.reorderItems = reorderItems;
exports.recordOperation = recordOperation;
exports.saveTestSession = saveTestSession;
exports.getSessionsForNote = getSessionsForNote;
exports.moveToTrash = moveToTrash;
exports.restoreFromTrash = restoreFromTrash;
exports.permanentDelete = permanentDelete;
exports.toggleFavorite = toggleFavorite;
exports.getFavorites = getFavorites;
var dexie_1 = require("dexie");
var StudyNotebookDB = /** @class */ (function (_super) {
    __extends(StudyNotebookDB, _super);
    function StudyNotebookDB() {
        var _this = _super.call(this, 'StudyNotebookDB') || this;
        _this.version(1).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags',
            folders: 'id, name, parentId'
        });
        _this.version(2).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags',
            folders: 'id, name, parentId, description'
        });
        _this.version(3).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags',
            folders: 'id, name, parentId, description, createdAt'
        });
        _this.version(4).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags, order',
            folders: 'id, name, parentId, description, createdAt, order, path',
            operations: '++id, type, timestamp, data'
        });
        _this.version(5).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags, order',
            folders: 'id, name, parentId, description, createdAt, order, path',
            operations: '++id, type, timestamp, data',
            testSessions: 'id, noteId, folderId, startTime'
        });
        _this.version(6).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags, order, deletedAt',
            folders: 'id, name, parentId, description, createdAt, order, path, deletedAt',
            operations: '++id, type, timestamp, data',
            testSessions: 'id, noteId, folderId, startTime'
        });
        _this.version(7).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags, order, deletedAt',
            folders: 'id, name, parentId, description, createdAt, order, path, deletedAt',
            operations: '++id, type, timestamp, data',
            testSessions: 'id, noteId, folderId, startTime',
            quizSessions: 'id, folderId, startTime'
        });
        _this.version(8).stores({
            notes: 'id, title, folderId, updatedAt, lastStudied, tags, order, deletedAt, favorite',
            folders: 'id, name, parentId, description, createdAt, order, path, deletedAt, favorite',
            operations: '++id, type, timestamp, data',
            testSessions: 'id, noteId, folderId, startTime',
            quizSessions: 'id, folderId, startTime'
        });
        return _this;
    }
    StudyNotebookDB.prototype.undoLastOperation = function () {
        return __awaiter(this, void 0, void 0, function () {
            var lastOperation, data, folder, note;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.operations.orderBy('timestamp').reverse().first()];
                    case 1:
                        lastOperation = _a.sent();
                        if (!lastOperation)
                            return [2 /*return*/, false];
                        data = lastOperation.data;
                        if (!(lastOperation.type === 'move')) return [3 /*break*/, 9];
                        if (!(data.itemType === 'folder')) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.folders.get(data.itemId)];
                    case 2:
                        folder = _a.sent();
                        if (!folder) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.folders.put(__assign(__assign({}, folder), { parentId: data.oldParentId, order: data.oldOrder }))];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, updateFolderPath(data.itemId, data.oldParentId)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [3 /*break*/, 9];
                    case 6: return [4 /*yield*/, this.notes.get(data.itemId)];
                    case 7:
                        note = _a.sent();
                        if (!note) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.notes.put(__assign(__assign({}, note), { folderId: data.oldParentId || 'root', order: data.oldOrder }))];
                    case 8:
                        _a.sent();
                        _a.label = 9;
                    case 9: return [4 /*yield*/, this.operations.delete(lastOperation.id)];
                    case 10:
                        _a.sent();
                        return [2 /*return*/, true];
                }
            });
        });
    };
    return StudyNotebookDB;
}(dexie_1.default));
exports.StudyNotebookDB = StudyNotebookDB;
exports.db = new StudyNotebookDB();
// Initialize database with root folder if empty
function initializeDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var folderCount, firstFolder;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.db.folders.count()];
                case 1:
                    folderCount = _a.sent();
                    if (!(folderCount === 0)) return [3 /*break*/, 3];
                    firstFolder = {
                        id: "folder-".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2)),
                        name: "My Notes",
                        parentId: null,
                        createdAt: Date.now(),
                        order: 0,
                        path: []
                    };
                    return [4 /*yield*/, exports.db.folders.add(firstFolder)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Helper functions for folder operations
function getFolderPath(folderId) {
    return __awaiter(this, void 0, void 0, function () {
        var path, currentFolder;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    path = [folderId];
                    return [4 /*yield*/, exports.db.folders.get(folderId)];
                case 1:
                    currentFolder = _a.sent();
                    _a.label = 2;
                case 2:
                    if (!(currentFolder === null || currentFolder === void 0 ? void 0 : currentFolder.parentId)) return [3 /*break*/, 4];
                    path.unshift(currentFolder.parentId);
                    return [4 /*yield*/, exports.db.folders.get(currentFolder.parentId)];
                case 3:
                    currentFolder = _a.sent();
                    return [3 /*break*/, 2];
                case 4: return [2 /*return*/, path];
            }
        });
    });
}
function updateFolderPath(folderId, newParentId) {
    return __awaiter(this, void 0, void 0, function () {
        var folder, newPath, _a, _b, childFolders, _i, childFolders_1, child;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, exports.db.folders.get(folderId)];
                case 1:
                    folder = _c.sent();
                    if (!folder)
                        return [2 /*return*/];
                    if (!newParentId) return [3 /*break*/, 3];
                    _b = [[]];
                    return [4 /*yield*/, getFolderPath(newParentId)];
                case 2:
                    _a = __spreadArray.apply(void 0, [__spreadArray.apply(void 0, _b.concat([(_c.sent()), true])), [folderId], false]);
                    return [3 /*break*/, 4];
                case 3:
                    _a = [folderId];
                    _c.label = 4;
                case 4:
                    newPath = _a;
                    // Update the folder's path
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folder), { path: newPath }))];
                case 5:
                    // Update the folder's path
                    _c.sent();
                    return [4 /*yield*/, exports.db.folders.where('parentId').equals(folderId).toArray()];
                case 6:
                    childFolders = _c.sent();
                    _i = 0, childFolders_1 = childFolders;
                    _c.label = 7;
                case 7:
                    if (!(_i < childFolders_1.length)) return [3 /*break*/, 10];
                    child = childFolders_1[_i];
                    return [4 /*yield*/, updateFolderPath(child.id, folderId)];
                case 8:
                    _c.sent();
                    _c.label = 9;
                case 9:
                    _i++;
                    return [3 /*break*/, 7];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function getNextOrder(parentId, itemType) {
    return __awaiter(this, void 0, void 0, function () {
        var folders, notes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(itemType === 'folder')) return [3 /*break*/, 2];
                    return [4 /*yield*/, exports.db.folders
                            .where('parentId')
                            .equals(parentId || '')
                            .toArray()];
                case 1:
                    folders = _a.sent();
                    return [2 /*return*/, folders.length];
                case 2: return [4 /*yield*/, exports.db.notes
                        .where('folderId')
                        .equals(parentId || 'root')
                        .toArray()];
                case 3:
                    notes = _a.sent();
                    return [2 /*return*/, notes.length];
            }
        });
    });
}
function reorderItems(parentId, itemType, itemId, newOrder) {
    return __awaiter(this, void 0, void 0, function () {
        var folders, itemIndex, folder, oldOrder, i, i, notes, itemIndex, note, oldOrder, i, i;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(itemType === 'folder')) return [3 /*break*/, 12];
                    return [4 /*yield*/, exports.db.folders
                            .where('parentId')
                            .equals(parentId || 'root')
                            .toArray()];
                case 1:
                    folders = _a.sent();
                    itemIndex = folders.findIndex(function (item) { return item.id === itemId; });
                    if (itemIndex === -1)
                        return [2 /*return*/];
                    folder = folders[itemIndex];
                    oldOrder = folder.order;
                    // Update the moved folder's order
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folder), { order: newOrder }))];
                case 2:
                    // Update the moved folder's order
                    _a.sent();
                    if (!(oldOrder < newOrder)) return [3 /*break*/, 7];
                    i = itemIndex + 1;
                    _a.label = 3;
                case 3:
                    if (!(i < folders.length)) return [3 /*break*/, 6];
                    if (!(folders[i].order <= newOrder)) return [3 /*break*/, 5];
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folders[i]), { order: folders[i].order - 1 }))];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 11];
                case 7:
                    i = itemIndex - 1;
                    _a.label = 8;
                case 8:
                    if (!(i >= 0)) return [3 /*break*/, 11];
                    if (!(folders[i].order >= newOrder)) return [3 /*break*/, 10];
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folders[i]), { order: folders[i].order + 1 }))];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10:
                    i--;
                    return [3 /*break*/, 8];
                case 11: return [3 /*break*/, 23];
                case 12: return [4 /*yield*/, exports.db.notes
                        .where('folderId')
                        .equals(parentId || 'root')
                        .toArray()];
                case 13:
                    notes = _a.sent();
                    itemIndex = notes.findIndex(function (item) { return item.id === itemId; });
                    if (itemIndex === -1)
                        return [2 /*return*/];
                    note = notes[itemIndex];
                    oldOrder = note.order;
                    // Update the moved note's order
                    return [4 /*yield*/, exports.db.notes.put(__assign(__assign({}, note), { order: newOrder }))];
                case 14:
                    // Update the moved note's order
                    _a.sent();
                    if (!(oldOrder < newOrder)) return [3 /*break*/, 19];
                    i = itemIndex + 1;
                    _a.label = 15;
                case 15:
                    if (!(i < notes.length)) return [3 /*break*/, 18];
                    if (!(notes[i].order <= newOrder)) return [3 /*break*/, 17];
                    return [4 /*yield*/, exports.db.notes.put(__assign(__assign({}, notes[i]), { order: notes[i].order - 1 }))];
                case 16:
                    _a.sent();
                    _a.label = 17;
                case 17:
                    i++;
                    return [3 /*break*/, 15];
                case 18: return [3 /*break*/, 23];
                case 19:
                    i = itemIndex - 1;
                    _a.label = 20;
                case 20:
                    if (!(i >= 0)) return [3 /*break*/, 23];
                    if (!(notes[i].order >= newOrder)) return [3 /*break*/, 22];
                    return [4 /*yield*/, exports.db.notes.put(__assign(__assign({}, notes[i]), { order: notes[i].order + 1 }))];
                case 21:
                    _a.sent();
                    _a.label = 22;
                case 22:
                    i--;
                    return [3 /*break*/, 20];
                case 23: return [2 /*return*/];
            }
        });
    });
}
function recordOperation(operation) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.db.operations.add(operation)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function saveTestSession(session) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.db.testSessions.put(session)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getSessionsForNote(noteId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, exports.db.testSessions.where('noteId').equals(noteId).reverse().toArray()];
        });
    });
}
function moveToTrash(itemId, itemType) {
    return __awaiter(this, void 0, void 0, function () {
        var folder, childFolders, _i, childFolders_2, child, childNotes, _a, childNotes_1, note, note;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(itemType === 'folder')) return [3 /*break*/, 13];
                    return [4 /*yield*/, exports.db.folders.get(itemId)];
                case 1:
                    folder = _b.sent();
                    if (!folder) return [3 /*break*/, 12];
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folder), { deletedAt: Date.now() }))];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, exports.db.folders.where('parentId').equals(itemId).toArray()];
                case 3:
                    childFolders = _b.sent();
                    _i = 0, childFolders_2 = childFolders;
                    _b.label = 4;
                case 4:
                    if (!(_i < childFolders_2.length)) return [3 /*break*/, 7];
                    child = childFolders_2[_i];
                    return [4 /*yield*/, moveToTrash(child.id, 'folder')];
                case 5:
                    _b.sent();
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [4 /*yield*/, exports.db.notes.where('folderId').equals(itemId).toArray()];
                case 8:
                    childNotes = _b.sent();
                    _a = 0, childNotes_1 = childNotes;
                    _b.label = 9;
                case 9:
                    if (!(_a < childNotes_1.length)) return [3 /*break*/, 12];
                    note = childNotes_1[_a];
                    return [4 /*yield*/, moveToTrash(note.id, 'note')];
                case 10:
                    _b.sent();
                    _b.label = 11;
                case 11:
                    _a++;
                    return [3 /*break*/, 9];
                case 12: return [3 /*break*/, 16];
                case 13: return [4 /*yield*/, exports.db.notes.get(itemId)];
                case 14:
                    note = _b.sent();
                    if (!note) return [3 /*break*/, 16];
                    return [4 /*yield*/, exports.db.notes.put(__assign(__assign({}, note), { deletedAt: Date.now() }))];
                case 15:
                    _b.sent();
                    _b.label = 16;
                case 16: return [2 /*return*/];
            }
        });
    });
}
function restoreFromTrash(itemId, itemType) {
    return __awaiter(this, void 0, void 0, function () {
        var folder, childFolders, _i, childFolders_3, child, childNotes, _a, childNotes_2, note, note, folderId, parentFolder;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(itemType === 'folder')) return [3 /*break*/, 13];
                    return [4 /*yield*/, exports.db.folders.get(itemId)];
                case 1:
                    folder = _b.sent();
                    if (!folder) return [3 /*break*/, 12];
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folder), { deletedAt: undefined }))];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, exports.db.folders.where('parentId').equals(itemId).toArray()];
                case 3:
                    childFolders = _b.sent();
                    _i = 0, childFolders_3 = childFolders;
                    _b.label = 4;
                case 4:
                    if (!(_i < childFolders_3.length)) return [3 /*break*/, 7];
                    child = childFolders_3[_i];
                    return [4 /*yield*/, restoreFromTrash(child.id, 'folder')];
                case 5:
                    _b.sent();
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [4 /*yield*/, exports.db.notes.where('folderId').equals(itemId).toArray()];
                case 8:
                    childNotes = _b.sent();
                    _a = 0, childNotes_2 = childNotes;
                    _b.label = 9;
                case 9:
                    if (!(_a < childNotes_2.length)) return [3 /*break*/, 12];
                    note = childNotes_2[_a];
                    return [4 /*yield*/, restoreFromTrash(note.id, 'note')];
                case 10:
                    _b.sent();
                    _b.label = 11;
                case 11:
                    _a++;
                    return [3 /*break*/, 9];
                case 12: return [3 /*break*/, 18];
                case 13: return [4 /*yield*/, exports.db.notes.get(itemId)];
                case 14:
                    note = _b.sent();
                    if (!note) return [3 /*break*/, 18];
                    folderId = note.folderId;
                    if (!(folderId && folderId !== 'root')) return [3 /*break*/, 16];
                    return [4 /*yield*/, exports.db.folders.get(folderId)];
                case 15:
                    parentFolder = _b.sent();
                    if (parentFolder === null || parentFolder === void 0 ? void 0 : parentFolder.deletedAt) {
                        // Parent folder is still deleted, move note to root
                        folderId = 'root';
                    }
                    _b.label = 16;
                case 16: return [4 /*yield*/, exports.db.notes.put(__assign(__assign({}, note), { deletedAt: undefined, folderId: folderId }))];
                case 17:
                    _b.sent();
                    _b.label = 18;
                case 18: return [2 /*return*/];
            }
        });
    });
}
function permanentDelete(itemId, itemType) {
    return __awaiter(this, void 0, void 0, function () {
        var childFolders, _i, childFolders_4, child, childNotes, _a, childNotes_3, note;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(itemType === 'folder')) return [3 /*break*/, 12];
                    return [4 /*yield*/, exports.db.folders.where('parentId').equals(itemId).toArray()];
                case 1:
                    childFolders = _b.sent();
                    _i = 0, childFolders_4 = childFolders;
                    _b.label = 2;
                case 2:
                    if (!(_i < childFolders_4.length)) return [3 /*break*/, 5];
                    child = childFolders_4[_i];
                    return [4 /*yield*/, permanentDelete(child.id, 'folder')];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [4 /*yield*/, exports.db.notes.where('folderId').equals(itemId).toArray()];
                case 6:
                    childNotes = _b.sent();
                    _a = 0, childNotes_3 = childNotes;
                    _b.label = 7;
                case 7:
                    if (!(_a < childNotes_3.length)) return [3 /*break*/, 10];
                    note = childNotes_3[_a];
                    return [4 /*yield*/, permanentDelete(note.id, 'note')];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9:
                    _a++;
                    return [3 /*break*/, 7];
                case 10: 
                // Then delete the folder itself
                return [4 /*yield*/, exports.db.folders.delete(itemId)];
                case 11:
                    // Then delete the folder itself
                    _b.sent();
                    return [3 /*break*/, 14];
                case 12: return [4 /*yield*/, exports.db.notes.delete(itemId)];
                case 13:
                    _b.sent();
                    _b.label = 14;
                case 14: return [2 /*return*/];
            }
        });
    });
}
function toggleFavorite(itemId, itemType) {
    return __awaiter(this, void 0, void 0, function () {
        var folder, note;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(itemType === 'folder')) return [3 /*break*/, 4];
                    return [4 /*yield*/, exports.db.folders.get(itemId)];
                case 1:
                    folder = _a.sent();
                    if (!folder) return [3 /*break*/, 3];
                    return [4 /*yield*/, exports.db.folders.put(__assign(__assign({}, folder), { favorite: !folder.favorite }))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [3 /*break*/, 7];
                case 4: return [4 /*yield*/, exports.db.notes.get(itemId)];
                case 5:
                    note = _a.sent();
                    if (!note) return [3 /*break*/, 7];
                    return [4 /*yield*/, exports.db.notes.put(__assign(__assign({}, note), { favorite: !note.favorite }))];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [2 /*return*/];
            }
        });
    });
}
function getFavorites() {
    return __awaiter(this, void 0, void 0, function () {
        var allNotes, allFolders, notes, folders;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.db.notes.toArray()];
                case 1:
                    allNotes = _a.sent();
                    return [4 /*yield*/, exports.db.folders.toArray()];
                case 2:
                    allFolders = _a.sent();
                    notes = allNotes.filter(function (note) { return note.favorite === true; });
                    folders = allFolders.filter(function (folder) { return folder.favorite === true; });
                    return [2 /*return*/, { notes: notes, folders: folders }];
            }
        });
    });
}
