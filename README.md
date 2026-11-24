# Sophia

A desktop note-taking and study app that lets you ask questions of your own notes. Notes are built from typed, linked blocks (who / what / when / where / why / how, plus plain notes, checks, code, images and video). Sophia retrieves the relevant blocks with semantic search and has a local LLM answer from them.

Built with TypeScript, Next.js 15 and Electron. Work in progress; see `docs/TODO.md`.

## How the RAG pipeline works

1. **Chunk and embed.** Note content is split into overlapping word windows (`lib/brain/processors/chunk.ts`, 300 words with 50 overlap) and embedded. Embeddings come from a local Ollama model (`nomic-embed-text`, 768 dimensions) by default, or OpenAI `text-embedding-3-small`. OpenAI calls retry with exponential backoff on 429 and 5xx errors.
2. **Store.** Vectors and block metadata are saved per note in a local JSON vector store (`lib/brain/processors/localVectorStore.ts`, files under `data/vectors/`). Search is cosine similarity with a metadata filter, so each query only searches the note being asked about.
3. **Expand the query.** A local LLM generates several rephrasings of the question to improve recall (`generateAlternativeQueries` in `lib/ragHandler.ts`). If that fails, the original question is used.
4. **Retrieve and merge.** Each variant is embedded and searched. Results are deduplicated by block, keeping the best score.
5. **Build context.** Retrieved blocks are turned into fact lines grouped as Entities, Notes and Summaries, with the note title and a TL;DR, capped at about 16,000 characters.
6. **Answer.** The context and question go to a local Ollama chat model, which generates the answer (`server.js`, `POST /api/rag`).

The function names `searchQdrant` and `upsertQdrantVector` are left over from an earlier Qdrant-based version. They now call the local vector store.

## Study features

- Spaced-repetition flashcards scheduled with FSRS (`ts-fsrs`) and a review page.
- Quiz and test generation with distractor generation (`lib/question-generator.ts`, `lib/distractor-generator.ts`).
- Notes and study data are stored locally in IndexedDB through Dexie.

## Getting started

Requirements: Node 18.18+, [Ollama](https://ollama.com) running locally.

```bash
ollama pull nomic-embed-text      # embeddings
ollama pull <a chat model>        # pick one in Settings
cp .env.example .env.local
npm install
npm run dev                       # web app
npm run electron:dev              # desktop app
```

To rebuild embeddings for existing notes: `node scripts/reindex-qdrant.js` (the file name is historical).

## Tests

```bash
npm test                          # Jest unit tests
npx playwright test               # end-to-end tests
npm run test:spaced-repetition    # scheduling checks
```

## Project layout

| Path | What it holds |
| --- | --- |
| `app/`, `components/`, `hooks/` | Next.js UI and the block editor |
| `lib/ragHandler.ts`, `server.js` | RAG pipeline and the local API server |
| `lib/brain/` | Embedding, chunking, local vector store, question generation |
| `lib/spaced-repetition.ts` | FSRS scheduling service |
| `electron/` | Electron main and preload processes |
| `scripts/` | Reindexing and verification scripts |

## Security note

Keep API keys in `.env.local` (git-ignored). `.env.example` lists the variables.
