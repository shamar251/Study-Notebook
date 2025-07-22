"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRagPipeline = runRagPipeline;
// This file is intended for use in the Electron main process (Node.js context)
const embed_1 = require("./brain/processors/embed");
const axios_1 = __importDefault(require("axios"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
async function generateAlternativeQueries(question, numVariants = 3) {
    const prompt = `You are an AI language model assistant. Your task is to generate ${numVariants} different versions of the given user question to retrieve relevant documents from a vector database. By generating multiple perspectives on the user question, your goal is to help the user overcome some of the limitations of the distance-based similarity search. Provide these alternative questions separated by newlines.\nOriginal question: ${question}`;
    try {
        const ollamaRes = await axios_1.default.post('http://localhost:11434/api/generate', {
            model: 'llama3',
            prompt
        });
        const data = ollamaRes.data;
        if (data.response) {
            return data.response.split('\n').map((q) => q.trim()).filter((q) => Boolean(q));
        }
    }
    catch (err) {
        console.error('Failed to generate alternative queries:', err);
    }
    return [question];
}
function blockToFactLine(block, allBlocks) {
    if (!block)
        return '';
    switch (block.type) {
        case 'who':
        case 'what':
            return `Entity: ${block.content || 'Unknown'} | Description/Action/Definition: ` +
                (block.linkedBlockIds && block.linkedBlockIds.length > 0
                    ? block.linkedBlockIds.map((id) => {
                        const linked = allBlocks.find((b) => b.id === id);
                        return linked && linked.content ? linked.content : '';
                    }).filter(Boolean).join('; ')
                    : '');
        case 'when':
            return `Time: ${block.content || 'Unknown'} | Event: ` +
                (block.linkedBlockIds && block.linkedBlockIds.length > 0
                    ? block.linkedBlockIds.map((id) => {
                        const linked = allBlocks.find((b) => b.id === id);
                        return linked && linked.content ? linked.content : '';
                    }).filter(Boolean).join('; ')
                    : '');
        case 'where':
            return `Place: ${block.content || 'Unknown'} | Event: ` +
                (block.linkedBlockIds && block.linkedBlockIds.length > 0
                    ? block.linkedBlockIds.map((id) => {
                        const linked = allBlocks.find((b) => b.id === id);
                        return linked && linked.content ? linked.content : '';
                    }).filter(Boolean).join('; ')
                    : '');
        case 'why':
            return `Reason: ${block.content || ''}`;
        case 'how':
            return `Method: ${block.content || ''}`;
        case 'image':
            return `Media: Image | Description: ${block.content || ''}`;
        case 'video':
            return `Media: Video | Description: ${block.content || ''}`;
        case 'code':
            return `Code: ${block.content || ''}`;
        case 'note':
            return `Note: ${block.content || ''}`;
        case 'check':
            return `Check: ${block.content || ''}`;
        default:
            return `${block.type}: ${block.content || ''}`;
    }
}
async function runRagPipeline({ note_id, query, topK = 10, allBlocks, folder_id }) {
    const altQueries = await generateAlternativeQueries(query, 3);
    let allResults = [];
    for (const altQuery of altQueries) {
        const queryEmbedding = await (0, embed_1.getEmbedding)(altQuery);
        if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
            throw new Error('Embedding failed or returned wrong dimension (expected 768).');
        }
        const filter = { must: [{ key: 'note_id', match: { value: note_id } }] };
        const results = await (0, embed_1.searchQdrant)({ queryEmbedding, filter, topK: 15 });
        allResults = allResults.concat(results);
    }
    // Deduplicate
    const seen = new Set();
    const dedupedResults = allResults.filter((r) => {
        const key = r.payload?.content || r.id;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    // Build context
    const instructions = `Instructions:\n- Each line below is a fact, with the format depending on the type of information (Entity, Time, Place, Reason, Method, Media, Check, etc.).\n- Use these facts to answer the question.\n- Do not repeat identical facts or answers.\n- If you can infer a likely time, place, or connection, state your reasoning.\n`;
    const factLines = dedupedResults
        .map(r => r.payload && r.payload.blockId
            ? blockToFactLine(allBlocks.find((b) => b.id === r.payload.blockId), allBlocks)
            : `${r.payload?.type}: ${r.payload?.content || ''}`)
        .filter(Boolean);
    const context = `${instructions}\nFacts:\n${factLines.join('\n')}\n`;
    const prompt = `You are a helpful study assistant. Use ONLY the following note data to answer the user's question. If the answer is not in the context, say "I don't know."\n\n${context}\nQuestion: ${query}\nAnswer:`;
    // Call Ollama
    let answer = '';
    if (context) {
        const url = new URL('http://localhost:11434/api/generate');
        const isHttps = url.protocol === 'https:';
        const reqModule = isHttps ? https_1.default : http_1.default;
        const postData = JSON.stringify({ model: 'llama3.1', prompt });
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        answer = await new Promise((resolve, reject) => {
            let answerStr = '';
            const req = reqModule.request(options, (res2) => {
                let buffer = '';
                res2.on('data', (chunk) => {
                    buffer += chunk.toString();
                    let lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
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
                res2.on('end', () => resolve(answerStr.trim() || 'No answer generated by model.'));
            });
            req.on('error', (err) => reject('Failed to generate answer.'));
            req.write(postData);
            req.end();
        });
    }
    else {
        answer = 'No relevant content found to answer the question.';
    }
    return { results: dedupedResults, answer };
}
