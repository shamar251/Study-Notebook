"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertLocalVector = upsertLocalVector;
exports.searchLocalVectors = searchLocalVectors;
var fs = require("fs");
var path = require("path");
function ensureBaseDir() {
    var baseDir = path.join(process.cwd(), 'data', 'vectors');
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    return baseDir;
}
function getFilePathForNote(noteId, collection) {
    if (collection === void 0) { collection = 'notes'; }
    var baseDir = ensureBaseDir();
    var safeNoteId = noteId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(baseDir, "".concat(collection, "-").concat(safeNoteId, ".json"));
}
function readPoints(filePath) {
    if (!fs.existsSync(filePath))
        return [];
    try {
        var raw = fs.readFileSync(filePath, 'utf-8');
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
            return parsed;
        return [];
    }
    catch (_a) {
        return [];
    }
}
function writePoints(filePath, points) {
    fs.writeFileSync(filePath, JSON.stringify(points, null, 2), 'utf-8');
}
function cosineSimilarity(a, b) {
    var dot = 0;
    var normA = 0;
    var normB = 0;
    var len = Math.min(a.length, b.length);
    for (var i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    var denom = Math.sqrt(normA) * Math.sqrt(normB) || 1e-12;
    return dot / denom;
}
function upsertLocalVector(point, collection) {
    var _a;
    if (collection === void 0) { collection = 'notes'; }
    var noteId = (_a = point === null || point === void 0 ? void 0 : point.payload) === null || _a === void 0 ? void 0 : _a.note_id;
    if (!noteId) {
        throw new Error('upsertLocalVector requires payload.note_id');
    }
    var filePath = getFilePathForNote(noteId, collection);
    var points = readPoints(filePath);
    var index = points.findIndex(function (p) { return p.id === point.id; });
    if (index >= 0) {
        points[index] = point;
    }
    else {
        points.push(point);
    }
    writePoints(filePath, points);
}
function searchLocalVectors(queryEmbedding, _a) {
    var _b;
    var filter = _a.filter, _c = _a.topK, topK = _c === void 0 ? 20 : _c, _d = _a.collection, collection = _d === void 0 ? 'notes' : _d;
    var noteId;
    // Basic filter parser for { must: [{ key: 'note_id', match: { value: note_id } }] }
    if (filter && Array.isArray(filter.must)) {
        for (var _i = 0, _e = filter.must; _i < _e.length; _i++) {
            var clause = _e[_i];
            if ((clause === null || clause === void 0 ? void 0 : clause.key) === 'note_id') {
                noteId = (_b = clause === null || clause === void 0 ? void 0 : clause.match) === null || _b === void 0 ? void 0 : _b.value;
                break;
            }
        }
    }
    if (!noteId) {
        // If no filter provided, search across all notes/files
        var baseDir = ensureBaseDir();
        var files = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];
        var allPoints = [];
        for (var _f = 0, files_1 = files; _f < files_1.length; _f++) {
            var file = files_1[_f];
            if (!file.startsWith("".concat(collection, "-")) || !file.endsWith('.json'))
                continue;
            var filePath_1 = path.join(baseDir, file);
            allPoints.push.apply(allPoints, readPoints(filePath_1));
        }
        var scored_1 = allPoints.map(function (p) { return ({ id: p.id, payload: p.payload, score: cosineSimilarity(queryEmbedding, p.vector) }); });
        return scored_1.sort(function (a, b) { return b.score - a.score; }).slice(0, topK);
    }
    var filePath = getFilePathForNote(noteId, collection);
    var points = readPoints(filePath);
    var scored = points.map(function (p) { return ({ id: p.id, payload: p.payload, score: cosineSimilarity(queryEmbedding, p.vector) }); });
    return scored.sort(function (a, b) { return b.score - a.score; }).slice(0, topK);
}
