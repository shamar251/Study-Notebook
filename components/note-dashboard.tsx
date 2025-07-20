import React, { useState } from "react";
import type { Note } from "@/components/note-app";

interface NoteChatWidgetProps {
  note?: Note;
}

const NoteChatWidget: React.FC<NoteChatWidgetProps> = ({ note }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const handleSend = async () => {
    if (!query.trim() || !note) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setAnswer(null);
    try {
      // 1. Embed if not already embedded
      if (!isEmbedded) {
        const content = (note.blocks || []).map(b => b.content || '').join('\n');
        const embedRes = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            note_id: note.id,
            folder_id: note.folderId
          })
        });
        if (!embedRes.ok) {
          setError('Failed to embed note for RAG.');
          setLoading(false);
          return;
        }
        setIsEmbedded(true);
      }
      // 2. Now run the RAG search as before
      const res = await fetch("/api/rag/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: note.id, query, allBlocks: note.blocks }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Non-JSON response: ${text.slice(0, 100)}`);
      }
      if (!res.ok) {
        throw new Error(data.error || "Unknown error");
      }
      setResults(data.results || []);
      setAnswer(data.answer || null);
    } catch (e: any) {
      setError(e.message || "Failed to fetch results");
    } finally {
      setLoading(false);
    }
  };

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4">
        <div className="w-full max-w-xl mx-auto bg-white dark:bg-gray-900 rounded shadow p-6">
          <h2 className="text-xl font-bold mb-2">Note Chat (RAG)</h2>
          <div className="text-red-600">No note selected. Please select a note to chat.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4">
      <div className="w-full max-w-xl mx-auto bg-white dark:bg-gray-900 rounded shadow p-6">
        <h2 className="text-xl font-bold mb-2">{note.title}</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 border rounded px-2 py-1"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask a question about this note..."
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            disabled={loading}
          />
          <button
            className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
            onClick={handleSend}
            disabled={loading || !query.trim()}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {/* Show the LLM answer */}
        {answer && (
          <div className="border rounded p-2 bg-blue-50 dark:bg-blue-900 text-black dark:text-white mb-2">
            <strong>AI:</strong> {answer}
          </div>
        )}
        {/* Remove raw results from UI */}
        {/* <div className="space-y-2">
          {results.length > 0 ? (
            results.map((item, idx) => (
              <div key={idx} className="border rounded p-2 bg-gray-50 dark:bg-gray-800">
                <pre className="whitespace-pre-wrap break-words text-sm">{item.payload?.content || JSON.stringify(item)}</pre>
              </div>
            ))
          ) : (
            <div className="text-gray-400 text-sm">No results yet. Try asking a question!</div>
          )}
        </div> */}
      </div>
    </div>
  );
};

export default NoteChatWidget; 