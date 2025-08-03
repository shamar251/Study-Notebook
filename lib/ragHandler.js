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
exports.runRagPipeline = runRagPipeline;
// This file is intended for use in the Electron main process (Node.js context)
var embed_1 = require("./brain/processors/embed");
var axios = require("axios");
var http = require("http");
var https = require("https");
var fs = require("fs");
var path = require("path");
function generateAlternativeQueries(question_1) {
    return __awaiter(this, arguments, void 0, function (question, numVariants, model) {
        var prompt, ollamaRes, data, err_1;
        if (numVariants === void 0) { numVariants = 3; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!model) {
                        console.error('[RAG] No LLM model provided to generateAlternativeQueries.');
                        throw new Error('No LLM model provided. Please select a model in settings.');
                    }
                    prompt = "You are a helpful AI assistant specialized in semantic search and information retrieval. Your task is to generate ".concat(numVariants, " diverse and meaningful rephrasings of the following user question to enhance recall in a vector-based retrieval system.\n\nEach variant should explore a different way of expressing the user's intent\u2014through paraphrasing, clarification, or alternative phrasing\u2014so that the system can retrieve semantically relevant but lexically diverse documents. Avoid simple rewordings; focus on variety in perspective, specificity, and terminology.\n\nReturn the variants as separate lines. Do not include numbering or explanations.\n\nOriginal question: ").concat(question);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios.post('http://localhost:11434/api/generate', {
                            model: model,
                            prompt: prompt
                        })];
                case 2:
                    ollamaRes = _a.sent();
                    data = ollamaRes.data;
                    if (data.response) {
                        return [2 /*return*/, data.response.split('\n').map(function (q) { return q.trim(); }).filter(function (q) { return Boolean(q); })];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    console.error('Failed to generate alternative queries:', err_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, [question]]; // fallback to original question
            }
        });
    });
}
function blockToFactLine(block, allBlocks) {
    if (!block)
        return '';
    switch (block.type) {
        case 'who':
        case 'what':
            return "Entity: ".concat(block.content || 'Unknown', " | Description/Action/Definition: ") +
                (block.linkedBlockIds && block.linkedBlockIds.length > 0
                    ? block.linkedBlockIds.map(function (id) {
                        var linked = allBlocks.find(function (b) { return b.id === id; });
                        return linked && linked.content ? linked.content : '';
                    }).filter(Boolean).join('; ')
                    : '');
        case 'when':
            return "Time: ".concat(block.content || 'Unknown', " | Event: ") +
                (block.linkedBlockIds && block.linkedBlockIds.length > 0
                    ? block.linkedBlockIds.map(function (id) {
                        var linked = allBlocks.find(function (b) { return b.id === id; });
                        return linked && linked.content ? linked.content : '';
                    }).filter(Boolean).join('; ')
                    : '');
        case 'where':
            return "Place: ".concat(block.content || 'Unknown', " | Event: ") +
                (block.linkedBlockIds && block.linkedBlockIds.length > 0
                    ? block.linkedBlockIds.map(function (id) {
                        var linked = allBlocks.find(function (b) { return b.id === id; });
                        return linked && linked.content ? linked.content : '';
                    }).filter(Boolean).join('; ')
                    : '');
        case 'why':
            return "Reason: ".concat(block.content || '');
        case 'how':
            return "Method: ".concat(block.content || '');
        case 'image':
            return "Media: Image | Description: ".concat(block.content || '');
        case 'video':
            return "Media: Video | Description: ".concat(block.content || '');
        case 'code':
            return "Code: ".concat(block.content || '');
        case 'note':
            return "Note: ".concat(block.content || '');
        case 'check':
            return "Check: ".concat(block.content || '');
        default:
            return "".concat(block.type, ": ").concat(block.content || '');
    }
}
function logToFile(message) {
    var logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }
    var logPath = path.join(logDir, 'rag-debug.txt');
    var timestamp = new Date().toISOString();
    var msg;
    if (typeof message === 'string') {
        msg = message;
    }
    else if (typeof message === 'object') {
        try {
            msg = JSON.stringify(message, null, 2);
        }
        catch (_a) {
            msg = String(message);
        }
    }
    else {
        msg = String(message);
    }
    fs.appendFileSync(logPath, "[".concat(timestamp, "] ").concat(msg, "\n"), 'utf-8');
}
function runRagPipeline(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var startTotal, isSummaryRequest, t0, altQueries, t1, allResults, embeddingTime, qdrantTime, _i, altQueries_1, altQuery, tEmbedStart, queryEmbedding, filter, tQdrantStart, results, t2, seen, dedupedResults, t3, contentSet, emptyContentCount, repeatedContentCount, _c, dedupedResults_1, r, parentNoteTitle, parentNoteSummary, MAX_FULL_NOTE_CHARS, parentContextLines, summaryBlock, fullNoteContent, blockTypesInContext, SPEED_TOP_K, SPEED_MAX_CONTEXT_CHARS, sortedResults, instructions, MAX_CONTEXT_CHARS, contextFacts, currentLength, truncated, factSet, _loop_1, _d, sortedResults_1, r, state_1, hybridContextFacts, factDetails, context, prompt, answer, url, isHttps, reqModule_1, postData_1, options_1, tLLMStart;
        var _e, _f, _g, _h, _j;
        var note_id = _b.note_id, query = _b.query, _k = _b.topK, topK = _k === void 0 ? 10 : _k, allBlocks = _b.allBlocks, folder_id = _b.folder_id, model = _b.model, temperature = _b.temperature, top_p = _b.top_p, noteTitle = _b.noteTitle;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    if (!model) {
                        console.error('[RAG] No LLM model provided to runRagPipeline.');
                        throw new Error('No LLM model provided. Please select a model in settings.');
                    }
                    // logToFile('[RAG DEBUG] runRagPipeline received allBlocks:');
                    if (allBlocks && allBlocks.length > 0) {
                        // logToFile('[RAG DEBUG] allBlocks IDs and types:');
                    }
                    startTotal = Date.now();
                    isSummaryRequest = /summari[sz]e|overview|all note data|entire note|main points/i.test(query);
                    t0 = Date.now();
                    return [4 /*yield*/, generateAlternativeQueries(query, 3, model)];
                case 1:
                    altQueries = _l.sent();
                    t1 = Date.now();
                    allResults = [];
                    embeddingTime = 0;
                    qdrantTime = 0;
                    _i = 0, altQueries_1 = altQueries;
                    _l.label = 2;
                case 2:
                    if (!(_i < altQueries_1.length)) return [3 /*break*/, 6];
                    altQuery = altQueries_1[_i];
                    tEmbedStart = Date.now();
                    return [4 /*yield*/, (0, embed_1.getEmbedding)(altQuery)];
                case 3:
                    queryEmbedding = _l.sent();
                    embeddingTime += Date.now() - tEmbedStart;
                    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
                        throw new Error('Embedding failed or returned wrong dimension (expected 768).');
                    }
                    filter = { must: [{ key: 'note_id', match: { value: note_id } }] };
                    tQdrantStart = Date.now();
                    return [4 /*yield*/, (0, embed_1.searchQdrant)({ queryEmbedding: queryEmbedding, filter: filter, topK: 10 })];
                case 4:
                    results = _l.sent();
                    qdrantTime += Date.now() - tQdrantStart;
                    allResults = allResults.concat(results);
                    _l.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6:
                    t2 = Date.now();
                    // logToFile(`[TIMING] Query embedding total: ${embeddingTime}ms`);
                    // logToFile(`[TIMING] Qdrant search total: ${qdrantTime}ms`);
                    // logToFile(`[TIMING] Retrieval loop: ${t2 - t1}ms`);
                    // Log allResults before deduplication
                    console.log('[RAG DEBUG] allResults length:', allResults.length);
                    console.log('[RAG DEBUG] allResults:', allResults.map(function (r) { var _a, _b; return ({ id: r.id, content: (_a = r.payload) === null || _a === void 0 ? void 0 : _a.content, blockId: (_b = r.payload) === null || _b === void 0 ? void 0 : _b.blockId, score: r.score }); }));
                    // 3. Fallback: If no results found, attempt to embed the note and retry
                    if (allResults.length === 0 && allBlocks.length > 0) {
                        // logToFile(`[RAG] No results found for note ${note_id}, attempting to embed note...`);
                        // You may need to implement embedAndStoreNote for Electron/Node context
                        // For now, just log and skip
                        // await embedAndStoreNote(note_id, folder_id, allBlocks);
                        // Retry logic can be added here if embedding is implemented
                    }
                    seen = new Set();
                    dedupedResults = allResults.filter(function (r) {
                        var key = r.id;
                        if (seen.has(key))
                            return false;
                        seen.add(key);
                        return true;
                    });
                    t3 = Date.now();
                    contentSet = new Set();
                    emptyContentCount = 0;
                    repeatedContentCount = 0;
                    for (_c = 0, dedupedResults_1 = dedupedResults; _c < dedupedResults_1.length; _c++) {
                        r = dedupedResults_1[_c];
                        if (!((_e = r.payload) === null || _e === void 0 ? void 0 : _e.content))
                            emptyContentCount++;
                        if (((_f = r.payload) === null || _f === void 0 ? void 0 : _f.content) && contentSet.has(r.payload.content))
                            repeatedContentCount++;
                        if ((_g = r.payload) === null || _g === void 0 ? void 0 : _g.content)
                            contentSet.add(r.payload.content);
                    }
                    if (emptyContentCount > 0) {
                        // logToFile(`[RAG WARNING] ${emptyContentCount} deduped results have empty payload.content. Check your embedding/chunking pipeline!`);
                    }
                    if (repeatedContentCount > 0) {
                        // logToFile(`[RAG WARNING] ${repeatedContentCount} deduped results have repeated payload.content. Check your embedding/chunking pipeline!`);
                    }
                    parentNoteTitle = noteTitle || '';
                    parentNoteSummary = '';
                    MAX_FULL_NOTE_CHARS = 4000;
                    parentContextLines = [];
                    summaryBlock = allBlocks.find(function (b) { return b.type === 'note' && b.content && /summary|overview|main point/i.test(b.content); });
                    if (summaryBlock)
                        parentNoteSummary = summaryBlock.content || '';
                    fullNoteContent = '';
                    if (allBlocks && allBlocks.length > 0) {
                        fullNoteContent = allBlocks.map(function (b) { return "".concat(b.type ? "[".concat(b.type, "] ") : '').concat(b.content || '').trim(); }).join(' \n ');
                        if (fullNoteContent.length > MAX_FULL_NOTE_CHARS) {
                            fullNoteContent = fullNoteContent.slice(0, MAX_FULL_NOTE_CHARS) + '...';
                        }
                        parentContextLines.push("Full Note Content: ".concat(fullNoteContent));
                    }
                    if (parentNoteSummary)
                        parentContextLines.unshift("Note Summary: ".concat(parentNoteSummary));
                    if (parentNoteTitle)
                        parentContextLines.unshift("Note Title: ".concat(parentNoteTitle));
                    blockTypesInContext = dedupedResults.map(function (r) { var _a; return (_a = r.payload) === null || _a === void 0 ? void 0 : _a.type; }).filter(Boolean);
                    SPEED_TOP_K = 10;
                    SPEED_MAX_CONTEXT_CHARS = 16000;
                    sortedResults = allResults.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); }).slice(0, SPEED_TOP_K);
                    instructions = "You are a helpful study assistant. Use ONLY the following note data to answer the user's question.\nIf the answer is not in the context, say \"I don't know.\"\nDo NOT show your reasoning, thoughts, explanations, or process\u2014output ONLY the final answer.\nIf the question asks for a summary, provide a concise summary as a bullet list.\nOtherwise, answer the question as directly as possible using the facts below.\nDo NOT include any text like <think>, \"Step\", \"Let me think\", or similar. Output ONLY the answer.\nUnder NO circumstances should you output your reasoning, thoughts, process, or any meta-commentary. Your answer must be ONLY the final answer or summary, with no preamble, no steps, and no explanations.";
                    MAX_CONTEXT_CHARS = SPEED_MAX_CONTEXT_CHARS;
                    contextFacts = [];
                    currentLength = 0;
                    truncated = false;
                    factSet = new Set();
                    _loop_1 = function (r) {
                        var fact = r.payload && r.payload.blockId
                            ? blockToFactLine(allBlocks.find(function (b) { return b.id === r.payload.blockId; }), allBlocks)
                            : "".concat((_h = r.payload) === null || _h === void 0 ? void 0 : _h.type, ": ").concat(((_j = r.payload) === null || _j === void 0 ? void 0 : _j.content) || '');
                        if (!fact || factSet.has(fact))
                            return "continue"; // Skip duplicates
                        if (currentLength + fact.length > MAX_CONTEXT_CHARS) {
                            truncated = true;
                            return "break";
                        }
                        contextFacts.push(fact);
                        factSet.add(fact);
                        currentLength += fact.length + 1;
                        console.log('[RAG DEBUG] Added fact to contextFacts:', fact);
                    };
                    for (_d = 0, sortedResults_1 = sortedResults; _d < sortedResults_1.length; _d++) {
                        r = sortedResults_1[_d];
                        state_1 = _loop_1(r);
                        if (state_1 === "break")
                            break;
                    }
                    if (truncated) {
                        console.warn("[RAG] Context truncated to ".concat(MAX_CONTEXT_CHARS, " characters. Some facts omitted."));
                    }
                    hybridContextFacts = __spreadArray(__spreadArray([], parentContextLines, true), contextFacts, true);
                    console.log("[RAG] Number of facts included in LLM context: ".concat(hybridContextFacts.length));
                    console.log('[RAG] Facts included in LLM context:', hybridContextFacts);
                    console.log("[RAG] Current LLM Model: ".concat(model));
                    factDetails = hybridContextFacts.map(function (fact, idx) {
                        var _a, _b, _c, _d, _e, _f, _g, _h;
                        return ({
                            fact: fact,
                            score: (_b = (_a = dedupedResults[idx]) === null || _a === void 0 ? void 0 : _a.score) !== null && _b !== void 0 ? _b : null,
                            blockId: (_e = (_d = (_c = dedupedResults[idx]) === null || _c === void 0 ? void 0 : _c.payload) === null || _d === void 0 ? void 0 : _d.blockId) !== null && _e !== void 0 ? _e : null,
                            content: (_h = (_g = (_f = dedupedResults[idx]) === null || _f === void 0 ? void 0 : _f.payload) === null || _g === void 0 ? void 0 : _g.content) !== null && _h !== void 0 ? _h : null,
                        });
                    });
                    // logToFile('Facts and Qdrant scores used in context:');
                    factDetails.forEach(function (f, i) {
                        // logToFile(`#${i + 1}: Score=${f.score}, BlockId=${f.blockId}, Content=${f.content}`);
                    });
                    context = "".concat(instructions, "\nFacts:\n").concat(hybridContextFacts.join('\n'), "\n");
                    prompt = "\n    You are a knowledgeable assistant answering user questions using retrieved contextual facts.\n\n    Instructions:\n    - Base your answer strictly on the contextual facts below.\n    - If the information is not present or incomplete, respond: \"Insufficient information.\"\n    - Use concise, clear language.\n    - Facts may be paraphrased or partial; reason semantically when needed.\n\n    Contextual Facts:\n    ".concat(hybridContextFacts.join('\n'), "\n\n    User Question:\n    ").concat(query, "\n\n    Answer:\n    ");
                    answer = '';
                    if (!context) return [3 /*break*/, 8];
                    url = new URL('http://localhost:11434/api/generate');
                    isHttps = url.protocol === 'https:';
                    reqModule_1 = isHttps ? https : http;
                    postData_1 = JSON.stringify({
                        model: model,
                        prompt: prompt,
                        options: {
                            temperature: typeof temperature === 'number' ? temperature : 0.8,
                            top_p: typeof top_p === 'number' ? top_p : 0.9,
                        },
                    });
                    options_1 = {
                        hostname: url.hostname,
                        port: url.port || (isHttps ? 443 : 80),
                        path: url.pathname,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(postData_1)
                        }
                    };
                    tLLMStart = Date.now();
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var answerStr = '';
                            var req = reqModule_1.request(options_1, function (res2) {
                                var buffer = '';
                                res2.on('data', function (chunk) {
                                    buffer += chunk.toString();
                                    var lines = buffer.split('\n');
                                    buffer = lines.pop() || '';
                                    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                                        var line = lines_1[_i];
                                        try {
                                            var data = JSON.parse(line);
                                            if (data.response)
                                                answerStr += data.response;
                                            if (data.done) {
                                                resolve(answerStr.trim() || 'No answer generated by model.');
                                                return;
                                            }
                                        }
                                        catch (e) { }
                                    }
                                });
                                res2.on('end', function () {
                                    resolve(answerStr.trim() || 'No answer generated by model.');
                                });
                            });
                            req.on('error', function (err) { return reject('Failed to generate answer.'); });
                            req.write(postData_1);
                            req.end();
                        })];
                case 7:
                    answer = _l.sent();
                    return [3 /*break*/, 9];
                case 8:
                    answer = 'No relevant content found to answer the question.';
                    _l.label = 9;
                case 9: 
                // logToFile(`[TIMING] Total pipeline time: ${Date.now() - startTotal}ms`);
                return [2 /*return*/, { results: dedupedResults, answer: answer, facts: factDetails }];
            }
        });
    });
}
