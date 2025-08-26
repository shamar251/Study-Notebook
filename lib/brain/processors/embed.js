"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbedding = getEmbedding;
exports.upsertQdrantVector = upsertQdrantVector;
exports.searchQdrant = searchQdrant;
// OpenAI and Qdrant embedding/search utility (scaffold)
var axios = require("axios"); // Make sure to install axios: npm install axios @types/axios
var localVectorStore_1 = require("./localVectorStore");
// Embedding provider selection
var EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama'; // 'ollama' or 'openai'
var OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Deprecated: Qdrant config (kept for backward compatibility but unused now)
var QDRANT_URL = "";
var QDRANT_API_KEY = "";
// Validate OpenAI env only if using OpenAI
var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (EMBEDDING_PROVIDER === 'openai' && !OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
}
/**
 * Get embedding for a given text using Ollama or OpenAI API.
 * @param text The input text to embed.
 * @param model The embedding model to use (Ollama: 'nomic-embed-text', OpenAI: 'text-embedding-3-small').
 * @param maxRetries Number of retry attempts for transient errors (default: 3).
 * @returns Promise<number[]> The embedding vector.
 */
function getEmbedding(text_1) {
    return __awaiter(this, arguments, void 0, function (text, model, maxRetries) {
        var response, error_1, attempt, lastError, _loop_1, state_1;
        var _a, _b, _c, _d, _e;
        if (model === void 0) { model = EMBEDDING_PROVIDER === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small'; }
        if (maxRetries === void 0) { maxRetries = 3; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    if (!(EMBEDDING_PROVIDER === 'ollama')) return [3 /*break*/, 5];
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    console.log("[getEmbedding] Requesting embedding from Ollama (".concat(model, ")..."));
                    return [4 /*yield*/, axios.post("".concat(OLLAMA_URL, "/api/embeddings"), {
                            model: model,
                            prompt: text,
                        })];
                case 2:
                    response = _f.sent();
                    if (!response.data || !response.data.embedding) {
                        throw new Error('No embedding returned from Ollama');
                    }
                    return [2 /*return*/, response.data.embedding];
                case 3:
                    error_1 = _f.sent();
                    console.error('[getEmbedding] Ollama error:', ((_a = error_1 === null || error_1 === void 0 ? void 0 : error_1.response) === null || _a === void 0 ? void 0 : _a.data) || error_1.message || error_1);
                    throw new Error('Failed to fetch embedding from Ollama');
                case 4: return [3 /*break*/, 9];
                case 5:
                    // OpenAI's max input length for text-embedding-3-small is 8191 tokens (roughly 8191 characters for English)
                    if (text.length > 8191) {
                        throw new Error('Input text too long for embedding model (max 8191 characters).');
                    }
                    attempt = 0;
                    lastError = null;
                    _loop_1 = function () {
                        var response, embedding, error_2, status_1, delay_1;
                        return __generator(this, function (_g) {
                            switch (_g.label) {
                                case 0:
                                    _g.trys.push([0, 2, , 5]);
                                    console.log("[getEmbedding] Requesting embedding from OpenAI (attempt ".concat(attempt + 1, ")..."));
                                    return [4 /*yield*/, axios.post('https://api.openai.com/v1/embeddings', {
                                            input: text,
                                            model: model,
                                        }, {
                                            headers: {
                                                'Authorization': "Bearer ".concat(OPENAI_API_KEY),
                                                'Content-Type': 'application/json',
                                            },
                                        })];
                                case 1:
                                    response = _g.sent();
                                    embedding = (_b = response.data.data[0]) === null || _b === void 0 ? void 0 : _b.embedding;
                                    if (!embedding) {
                                        console.error('[getEmbedding] No embedding returned from OpenAI.', response.data);
                                        throw new Error('No embedding returned from OpenAI.');
                                    }
                                    return [2 /*return*/, { value: embedding }];
                                case 2:
                                    error_2 = _g.sent();
                                    lastError = error_2;
                                    status_1 = (_c = error_2 === null || error_2 === void 0 ? void 0 : error_2.response) === null || _c === void 0 ? void 0 : _c.status;
                                    if (!(status_1 === 429 || (status_1 >= 500 && status_1 < 600))) return [3 /*break*/, 4];
                                    delay_1 = Math.pow(2, attempt) * 500;
                                    console.warn("[getEmbedding] Transient error (status ".concat(status_1, "), retrying in ").concat(delay_1, "ms..."));
                                    return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, delay_1); })];
                                case 3:
                                    _g.sent();
                                    attempt++;
                                    return [2 /*return*/, "continue"];
                                case 4:
                                    console.error('[getEmbedding] Error fetching embedding:', ((_d = error_2 === null || error_2 === void 0 ? void 0 : error_2.response) === null || _d === void 0 ? void 0 : _d.data) || error_2.message || error_2);
                                    throw new Error('Failed to fetch embedding from OpenAI.');
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    _f.label = 6;
                case 6:
                    if (!(attempt < maxRetries)) return [3 /*break*/, 8];
                    return [5 /*yield**/, _loop_1()];
                case 7:
                    state_1 = _f.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    return [3 /*break*/, 6];
                case 8:
                    console.error('[getEmbedding] Failed after retries:', ((_e = lastError === null || lastError === void 0 ? void 0 : lastError.response) === null || _e === void 0 ? void 0 : _e.data) || (lastError === null || lastError === void 0 ? void 0 : lastError.message) || lastError);
                    throw new Error('Failed to fetch embedding from OpenAI after retries.');
                case 9: return [2 /*return*/];
            }
        });
    });
}
function upsertQdrantVector(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var id = _b.id, embedding = _b.embedding, payload = _b.payload, _c = _b.collection, collection = _c === void 0 ? 'notes' : _c;
        return __generator(this, function (_d) {
            // Redirect to local vector store
            (0, localVectorStore_1.upsertLocalVector)({ id: id, vector: embedding, payload: payload }, collection);
            return [2 /*return*/];
        });
    });
}
function searchQdrant(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var results;
        var queryEmbedding = _b.queryEmbedding, filter = _b.filter, _c = _b.topK, topK = _c === void 0 ? 20 : _c, _d = _b.collection, collection = _d === void 0 ? 'notes' : _d;
        return __generator(this, function (_e) {
            results = (0, localVectorStore_1.searchLocalVectors)(queryEmbedding, { filter: filter, topK: topK, collection: collection });
            return [2 /*return*/, results];
        });
    });
}
