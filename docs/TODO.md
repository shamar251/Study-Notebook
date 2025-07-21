# TODO List: 3-Layer RAG System Implementation

## Backend
- [x] Implement /api/embed endpoint
- [x] Implement /api/rag/note endpoint
- [x] Implement /api/rag/global endpoint
- [x] Implement /api/rag/folder endpoint
- [x] Finalize Qdrant client integration
- [x] Finalize OpenAI embedding logic
- [ ] Add error handling and logging
- [ ] Write backend tests (unit/integration)
- [x] Implement semantic chunking and embedding of connected blocks (WHO+WHAT)
- [x] Optimize note chunking and embedding for semantically structured, context-aware blocks
- [x] Optimize backend for speed (reduce latency in embedding, search, and chat response)
- [x] Add Qdrant indexes for block type and blockId fields for fast semantic filtering
- [x] Ensure all note embeddings/indexing POST the blocks array (not just content) to /api/embed
- [ ] Update embedding logic to always include type, blockId, and linkedBlocks in the payload for semantic structure
- [ ] Make RAG chat work in production (critical)
- [ ] Fix Electron route issue (critical)

## Frontend
- [x] Scaffold NoteChat widget: Replace DashBoard section in editor.tsx to be note chat.
- [ ] Scaffold FolderAgentChat widget
- [x] Connect chat widgets to backend endpoints
- [ ] Integrate chat widgets into main UI
- [ ] Write frontend tests (unit/e2e)
- [x] Redesign NoteChat frontend to look and behave like a modern chat bot (chat bubbles, avatars, timestamps, input at bottom, etc)
- [x] Add test score to NoteChat header and improve dashboard stats display.
- [x] Polish UI/UX for chat widgets across the app (chat UI is now modern, wide, and responsive, with stats header showing study items, quiz score, and test score)

## Documentation
- [x] Move PERFORMANCE_OPTIMIZATION.md to docs/
- [ ] Update PERFORMANCE_OPTIMIZATION.md as progress is made
- [ ] Add developer and user documentation

## General
- [x] Monitor and benchmark performance of RAG and chat flows
- [x] Optimize performance and handle edge cases
- [x] Implement chat message caching for better UX across tab navigation 