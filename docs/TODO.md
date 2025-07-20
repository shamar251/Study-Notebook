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
- [ ] Optimize note chunking and embedding for semantically structured, context-aware blocks
- [ ] Optimize backend for speed (reduce latency in embedding, search, and chat response)

## Frontend
- [x] Scaffold NoteChat widget: Replace DashBoard section in editor.tsx to be note chat.
- [ ] Scaffold GlobalChat widget
- [ ] Scaffold FolderAgentChat widget
- [x] Connect chat widgets to backend endpoints
- [ ] Integrate chat widgets into main UI
- [ ] Write frontend tests (unit/e2e)
- [ ] Redesign NoteChat frontend to look and behave like a modern chat bot (chat bubbles, avatars, timestamps, input at bottom, etc)
- [ ] Polish UI/UX for chat widgets across the app

## Documentation
- [x] Move PERFORMANCE_OPTIMIZATION.md to docs/
- [ ] Update PERFORMANCE_OPTIMIZATION.md as progress is made
- [ ] Add developer and user documentation

## General
- [ ] Monitor and benchmark performance of RAG and chat flows
- [ ] Optimize performance and handle edge cases 