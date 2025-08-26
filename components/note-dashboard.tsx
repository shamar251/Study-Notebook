import React, { useState, useRef, useEffect } from "react";
import { Note } from "@/lib/db";
import { Layers, ListChecks, Timer, Bot, Sparkles } from "lucide-react";

interface NoteChatWidgetProps {
  note?: Note;
  testSession?: { score?: number };
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  timestamp?: number;
}

// Global chat cache to persist across component unmounts
const chatCache: { [noteId: string]: ChatMessage[] } = {};

// Cache key for localStorage
const CHAT_CACHE_KEY = 'study-notebook-chat-cache';

// Load chat cache from localStorage
const loadChatCache = (): { [noteId: string]: ChatMessage[] } => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(CHAT_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.error('Failed to load chat cache:', error);
    return {};
  }
};

// Save chat cache to localStorage
const saveChatCache = (cache: { [noteId: string]: ChatMessage[] }) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to save chat cache:', error);
  }
};

// Initialize cache from localStorage
const initializeCache = () => {
  const loadedCache = loadChatCache();
  Object.assign(chatCache, loadedCache);
};

// Initialize cache on module load
initializeCache();

// Utility functions for chat cache management
export const chatCacheUtils = {
  // Get conversation for a specific note
  getConversation: (noteId: string): ChatMessage[] => {
    return chatCache[noteId] || [];
  },

  // Set conversation for a specific note
  setConversation: (noteId: string, conversation: ChatMessage[]) => {
    chatCache[noteId] = conversation;
    saveChatCache(chatCache);
  },

  // Clear conversation for a specific note
  clearConversation: (noteId: string) => {
    delete chatCache[noteId];
    saveChatCache(chatCache);
  },

  // Clear all conversations
  clearAllConversations: () => {
    Object.keys(chatCache).forEach(key => delete chatCache[key]);
    saveChatCache(chatCache);
  },

  // Get all cached note IDs
  getCachedNoteIds: (): string[] => {
    return Object.keys(chatCache);
  },

  // Export chat cache
  exportChatCache: () => {
    return JSON.stringify(chatCache, null, 2);
  },

  // Import chat cache
  importChatCache: (cacheData: string) => {
    try {
      const importedCache = JSON.parse(cacheData);
      Object.assign(chatCache, importedCache);
      saveChatCache(chatCache);
      return true;
    } catch (error) {
      console.error('Failed to import chat cache:', error);
      return false;
    }
  },

  // Get cache statistics
  getCacheStats: () => {
    const noteIds = Object.keys(chatCache);
    const totalMessages = noteIds.reduce((total, noteId) => {
      return total + (chatCache[noteId]?.length || 0);
    }, 0);

    return {
      totalNotes: noteIds.length,
      totalMessages,
      averageMessagesPerNote: noteIds.length > 0 ? Math.round(totalMessages / noteIds.length) : 0
    };
  }
};

// Add this at the top of the file for Electron IPC type support
declare global {
  interface Window {
    electronAPI: {
      saveFile: (data: { content: string; filePath?: string }) => Promise<{
        success: boolean;
        filePath?: string;
        message?: string;
      }>;
      openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; message?: string }>;
      ragQuery: (args: any) => Promise<any>;
      gradeAnswer: (args: any) => Promise<any>;
      log: (payload: any) => Promise<any>;
    };
  }
}

// Animated typing indicator component
const TypingIndicator: React.FC = () => {
  const [dots, setDots] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => (prev + 1) % 4);
    }, 500);

    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 600);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(cursorInterval);
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-600 dark:text-gray-400 font-medium">
          Sophia is thinking{'.'.repeat(dots)}
        </span>
        <span
          className={`w-0.5 h-4 bg-blue-500 transition-opacity duration-200 ${showCursor ? 'opacity-100' : 'opacity-0'
            }`}
        ></span>
      </div>
      <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
    </div>
  );
};

/**
 * NoteChatWidget - AI-powered chat interface for notes with persistent message caching
 * 
 * Features:
 * - RAG-powered chat using note content
 * - Persistent message caching across tab navigation
 * - Automatic embedding of notes when needed
 * - Animated typing indicators
 * - Message timestamps
 * - Cache management utilities
 * 
 * Cache Behavior:
 * - Messages are automatically cached per note ID
 * - Cache persists across browser sessions via localStorage
 * - Cache is loaded when switching between notes
 * - Cache is saved after each message
 * - Users can clear individual note chats or all chats
 */
const NoteChatWidget: React.FC<NoteChatWidgetProps> = ({ note, testSession }) => {
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load conversation from cache when note changes
  useEffect(() => {
    if (note?.id) {
      const cachedConversation = chatCacheUtils.getConversation(note.id);
      setConversation(cachedConversation);
    } else {
      setConversation([]);
    }
  }, [note?.id]);

  // Save conversation to cache whenever it changes
  useEffect(() => {
    if (note?.id && conversation.length > 0) {
      chatCacheUtils.setConversation(note.id, conversation);
    }
  }, [conversation, note?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, loading]);

  const handleSend = async () => {
    if (!query.trim() || !note) return;

    const userQuery = query.trim();
    setQuery("");
    setError(null);

    const userMessage: ChatMessage = {
      sender: "user",
      text: userQuery,
      timestamp: Date.now()
    };

    setConversation((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      // 1. Embedding step
      if (!isEmbedded) {
        const embedRes = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blocks: note.blocks,
            note_id: note.id,
            folder_id: note.folderId
          })
        });
        if (!embedRes.ok) {
          const embedText = await embedRes.text();
          throw new Error(`Embed error: ${embedRes.status} ${embedRes.statusText} - ${embedText}`);
        }
        setIsEmbedded(true);
      }
      // 2. RAG search step (Electron IPC)
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.ragQuery) {
        // Get LLM settings from localStorage
        const model = localStorage.getItem('llmModel') || '';
        const temperature = Number(localStorage.getItem('llmTemperature')) || 0.8;
        const top_p = Number(localStorage.getItem('llmTopP')) || 0.9;
        const result = await window.electronAPI.ragQuery({
          note_id: note.id,
          query: userQuery,
          topK: 10,
          allBlocks: note.blocks,
          folder_id: note.folderId,
          model,
          temperature,
          top_p,
        });
        if (!result.success) {
          throw new Error(result.error || "Failed to get answer from RAG pipeline");
        }
        const aiMessage: ChatMessage = {
          sender: "ai",
          text: result.answer || "(No answer)",
          timestamp: Date.now()
        };
        setConversation((prev) => [...prev, aiMessage]);
      } else {
        // Fallback for web: show error or keep old fetch if needed
        setError("RAG chat is only available in the Electron app.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch results");

      const errorMessage: ChatMessage = {
        sender: "ai",
        text: `Error: ${e.message || "Failed to fetch results"}`,
        timestamp: Date.now()
      };

      setConversation((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Clear chat for current note
  const clearChat = () => {
    if (note?.id) {
      setConversation([]);
      chatCacheUtils.clearConversation(note.id);
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
        {/* Chat Controls */}
        <div className="ml-auto flex items-center gap-2">
          {(() => {
            const stats = chatCacheUtils.getCacheStats();
            return (
              <>
                {conversation.length > 0 && (
                  <>
                    <span className="text-xs text-gray-400">
                      {conversation.length} message{conversation.length !== 1 ? 's' : ''} cached
                    </span>
                    <button
                      onClick={clearChat}
                      className="text-xs text-gray-500 hover:text-red-500 transition-colors px-2 py-1 rounded"
                      title="Clear chat history"
                    >
                      Clear Chat
                    </button>
                  </>
                )}
                {stats.totalNotes > 1 && (
                  <span className="text-xs text-blue-500" title={`${stats.totalNotes} notes with cached conversations`}>
                    {stats.totalNotes} notes cached
                  </span>
                )}
              </>
            );
          })()}
        </div>
      </div>
      <div className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg flex flex-col h-[80vh] border border-gray-200 dark:border-gray-800 px-0 md:px-8">
        <h2 className="text-2xl font-bold mb-2 p-4 border-b border-gray-200 dark:border-gray-800">{note.title}</h2>
        {/* Note Stats Header */}

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 hide-scrollbar" style={{ minHeight: 0 }}>
          {conversation.length === 0 && (
            <div className="text-gray-400 text-base text-center">Start the conversation by asking Sophia about this note!</div>
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
            <div className="flex justify-start animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="rounded-2xl px-5 py-3 bg-gradient-to-r from-gray-100 to-blue-50 dark:from-gray-800 dark:to-blue-900/20 text-gray-900 dark:text-gray-100 shadow-md text-base border border-gray-200 dark:border-gray-700 animate-pulse">
                <TypingIndicator />
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
            placeholder="Ask Sophia about this note..."
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