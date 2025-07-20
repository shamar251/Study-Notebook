import React, { useState, useRef, useEffect } from "react";
import type { Note } from "@/components/note-app";
import { Layers, ListChecks, CheckCircle, Timer } from "lucide-react";

interface NoteChatWidgetProps {
  note?: Note;
  testSession?: { score?: number };
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

const NoteChatWidget: React.FC<NoteChatWidgetProps> = ({ note, testSession }) => {
  const [query, setQuery] = useState("");
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when conversation changes
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, loading]);

  useEffect(() => {
    // Reset chat if note changes
    setConversation([]);
    setIsEmbedded(false);
    setError(null);
    setQuery("");
  }, [note?.id]);

  const handleSend = async () => {
    if (!query.trim() || !note) return;
    setLoading(true);
    setError(null);
    // Add user message
    setConversation((prev) => [...prev, { sender: "user", text: query }]);
    const userQuery = query;
    setQuery("");
    try {
      // 1. Embed if not already embedded
      if (!isEmbedded) {
        const embedRes = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blocks: note.blocks,
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
        body: JSON.stringify({ note_id: note.id, query: userQuery, allBlocks: note.blocks }),
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
      setConversation((prev) => [
        ...prev,
        { sender: "ai", text: data.answer || "(No answer)" }
      ]);
    } catch (e: any) {
      setError(e.message || "Failed to fetch results");
      setConversation((prev) => [
        ...prev,
        { sender: "ai", text: `Error: ${e.message || "Failed to fetch results"}` }
      ]);
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
    <div className="flex flex-col items-center justify-center h-full w-full p-4 bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-950 dark:to-blue-950 font-sans">
      <div className="w-full flex flex-row items-center justify-start gap-8 px-6 py-4 bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 mb-4">
        {/* Study Items */}
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-lg">{(() => {
            // Count WHO/WHAT pairs
            let count = 0;
            const blocks = note.blocks || [];
            blocks.forEach((block, idx) => {
              if (block.type === "who") {
                if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds?.length === 1) {
                  const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds?.[0] && b.type === "what");
                  if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
                    count++;
                  }
                } else {
                  if (idx < blocks.length - 1) {
                    const nextBlock = blocks[idx + 1];
                    if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
                      count++;
                    }
                  }
                }
              }
            });
            return count;
          })()}</span>
          <span className="text-gray-500 text-sm">study items</span>
        </div>
        {/* Quiz Score */}
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-green-500" />
          <span className="font-semibold text-lg">{(() => {
            if (!note.studyStats) return 0;
            const { quizAttempts = 0, quizCorrect = 0 } = note.studyStats;
            if (quizAttempts === 0) return 0;
            return Math.round((quizCorrect / quizAttempts) * 100);
          })()}%</span>
          <span className="text-gray-500 text-sm">quiz score</span>
        </div>
        {/* Test Score */}
        {typeof testSession?.score === 'number' && !isNaN(testSession.score) && (
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-lg">{testSession.score}%</span>
            <span className="text-gray-500 text-sm">test score</span>
          </div>
        )}
      </div>
      <div className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg flex flex-col h-[80vh] border border-gray-200 dark:border-gray-800 px-0 md:px-8">
        <h2 className="text-2xl font-bold mb-2 p-4 border-b border-gray-200 dark:border-gray-800">{note.title}</h2>
        {/* Note Stats Header */}

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 hide-scrollbar" style={{ minHeight: 0 }}>
          {conversation.length === 0 && (
            <div className="text-gray-400 text-base text-center">Start the conversation by asking a question about this note!</div>
          )}
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`rounded-2xl px-5 py-3 max-w-[70%] whitespace-pre-wrap break-words shadow-md text-base border transition-all
                  ${msg.sender === "user"
                    ? "bg-blue-600 text-white self-end border-blue-200 dark:border-blue-800"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 self-start border-gray-200 dark:border-gray-700"}
                  `}
                style={{ lineHeight: 1.7 }}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-5 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-md text-base border border-gray-200 dark:border-gray-700 animate-pulse">
                AI is typing...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-2 bg-white dark:bg-gray-900 shadow-md rounded-b-2xl mb-4">
          <input
            className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-900 dark:text-white transition-all shadow-sm"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask a question about this note..."
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            disabled={loading}
            style={{ minWidth: 0 }}
          />
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSend}
            disabled={loading || !query.trim()}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
        {error && <div className="text-red-600 mb-2 text-center">{error}</div>}
      </div>
    </div>
  );
};

export default NoteChatWidget; 