"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Settings, BookOpen, Brain, Save, FolderOpen, Trash2, MoreHorizontal } from "lucide-react"
import { useNotes, useFolders, addNote, updateNote, deleteNote, addFolder, updateFolder, deleteFolder, searchNotes, getAllChildFolderIds } from "@/hooks/use-db"
import { initializeDatabase, db, getNextOrder, recordOperation, reorderItems, updateFolderPath, type Note as DBNote, type Folder as DBFolder } from "@/lib/db"
import Sidebar from "@/components/sidebar"
import Editor from "@/components/editor"
import StudyModeSelector from "@/components/study-mode-selector"
import Dashboard from "@/components/dashboard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FlashcardView from "@/components/flashcard-view"
import QuizView from "@/components/quiz-view"
import { useToast } from "@/components/ui/use-toast"
import FolderStudyMode from "@/components/folder-study-mode"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useTheme } from 'next-themes'

export type Block = {
  id: string
  type: "who" | "what" | "note" | "image" | "video" | "code"
  content: string
  linkedBlockId?: string // For linking Who blocks to What blocks
  language?: string // For code blocks
  image?: string // base64 or URL for image support in any block
  math?: boolean // If true, always render as math
}

export type Note = DBNote

export type Folder = DBFolder

export default function NoteApp() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const { toast } = useToast()
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"editor" | "flashcards" | "quiz" | null>(null);
  const [showStudyModeSelector, setShowStudyModeSelector] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [folderNotes, setFolderNotes] = useState<Note[]>([]);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // Initialize database with default data if empty
    const initDb = async () => {
      await initializeDatabase();

      // Load all folders and notes
      const allFolders = await db.folders.toArray();
      const allNotes = await db.notes.toArray();

      setFolders(allFolders);
      setNotes(allNotes);
    };

    initDb();

    // Check if we're running in Electron
    setIsElectron(typeof window !== "undefined" && "electronAPI" in window);
  }, []);

  useEffect(() => {
    if (
      notes.length > 0 &&
      !activeNote &&
      !showStudyModeSelector &&
      !showDashboard &&
      !view // Only set activeNote if not in a study mode
    ) {
      setActiveNote(notes[0]);
    }
  }, [notes, activeNote, showStudyModeSelector, showDashboard, view]);

  useEffect(() => {
    // Create a flag to prevent state updates if the component unmounts
    let isMounted = true;

    const updateFolderNotes = async () => {
      if (activeFolder) {
        console.log(`Updating notes for folder: ${activeFolder}`);
        const notesInFolder = await getFolderNotes(activeFolder);
        console.log(`Found ${notesInFolder.length} notes in folder ${activeFolder}:`, notesInFolder.map(n => n.title));

        // Only update state if the component is still mounted
        if (isMounted) {
          setFolderNotes(notesInFolder);
        }
      } else {
        if (isMounted) {
          setFolderNotes([]);
        }
      }
    };

    updateFolderNotes();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [activeFolder, notes]);

  useEffect(() => {
    const loadNotes = async () => {
      const allNotes = await db.notes.toArray();
      setNotes(allNotes);
    };
    loadNotes();
  }, []); // Load notes only on initial mount

  // Add a separate effect to reload notes when needed
  const reloadNotes = async () => {
    const allNotes = await db.notes.toArray();
    setNotes(allNotes);
  };

  // Filter notes for the sidebar - only show notes that match the search query
  // Don't filter by folder here - the sidebar component handles that
  const filteredNotes = notes.filter(
    (note) =>
    (searchQuery === "" ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      note.blocks.some((block) => block.content.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const createNewNote = async () => {
    // If a folder is selected, create the note in that folder; otherwise, at root
    const noteFolderId = activeFolder || "root";

    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: "Untitled Note",
      blocks: [],
      tags: [],
      folderId: noteFolderId,
      updatedAt: Date.now(),
      order: 0,
      studyStats: {
        quizAttempts: 0,
        quizCorrect: 0,
        flashcardReviews: 0,
      },
    };

    await addNote(newNote);

    // Update notes state immediately for instant sidebar update
    setNotes(prev => [...prev, newNote]);

    setActiveNote(newNote);
    setView("editor");
    setShowStudyModeSelector(false);
    setShowDashboard(false);
  };

  const updateNoteHandler = async (updatedNote: Note) => {
    // Ensure tags is always defined
    const noteWithTags = {
      ...updatedNote,
      tags: updatedNote.tags || [],
      updatedAt: Date.now()
    };
    await updateNote(noteWithTags);

    // Reload notes to ensure UI is updated
    await reloadNotes();

    setActiveNote(noteWithTags);
  };

  const deleteNoteHandler = async (noteId: string) => {
    // Ensure noteId has the correct prefix
    const fullNoteId = noteId.startsWith('note-') ? noteId : `note-${noteId}`;

    try {
      // First, update the UI state
      if (activeNote?.id === fullNoteId) {
        setActiveNote(null);
        setView(null);
        setShowStudyModeSelector(false);
        setShowDashboard(true);
      }

      // Then delete from database
      await deleteNote(fullNoteId);

      // Finally, reload notes to ensure UI is updated
      await reloadNotes();

      toast({
        title: "Note deleted",
        description: "The note has been permanently deleted.",
      });
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      });
    }
  };

  const createFolderHandler = async (name: string, parentId: string | null = null, description: string = "") => {
    // If there are no folders, make this a root folder
    const actualParentId = folders.length === 0 ? null : parentId;
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      parentId: actualParentId,
      description,
      createdAt: Date.now(),
      order: 0,
      path: actualParentId ? [actualParentId, `folder-${Date.now()}`] : [`folder-${Date.now()}`]
    };
    // Optimistically update UI
    setFolders(prev => [...prev, newFolder]);
    try {
      await addFolder(newFolder);
      toast({
        title: "Folder created",
        description: `Folder "${name}" has been created.`,
      });
    } catch (error) {
      // Revert if DB fails
      setFolders(prev => prev.filter(f => f.id !== newFolder.id));
      toast({
        title: "Error",
        description: "Failed to create folder.",
        variant: "destructive",
      });
    }
  };

  const deleteFolderHandler = async (folderId: string) => {
    const folderToDelete = folders.find((f) => f.id === folderId);
    if (!folderToDelete) return;

    const parentFolderId = folderToDelete.parentId || null;
    const targetFolderId = parentFolderId || "root";

    // Move all notes from this folder to the parent folder
    const notesToUpdate = notes.filter(note => note.folderId === folderId);
    for (const note of notesToUpdate) {
      await updateNote({ ...note, folderId: targetFolderId });
    }

    await deleteFolder(folderId);

    // Reload notes to ensure UI is updated
    await reloadNotes();

    setFolders(prev => prev.filter(f => f.id !== folderId));

    if (activeFolder === folderId) {
      setActiveFolder(parentFolderId);
    }

    toast({
      title: "Folder deleted",
      description: `Folder "${folderToDelete.name}" has been deleted. All notes have been moved to the parent folder.`,
    });
  };

  const renameFolderHandler = async (folderId: string, newName: string) => {
    const folderToRename = folders.find((f) => f.id === folderId);
    if (!folderToRename) return;

    await updateFolder({ ...folderToRename, name: newName });

    // Update folders state immediately for instant sidebar update
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));

    toast({
      title: "Folder renamed",
      description: `Folder has been renamed to \"${newName}\".`,
    });
  };

  const updateFolderDescriptionHandler = async (folderId: string, newDescription: string) => {
    const folderToUpdate = folders.find((f) => f.id === folderId);
    if (!folderToUpdate) return;

    await updateFolder({ ...folderToUpdate, description: newDescription });

    // Update folders state immediately for instant UI update
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, description: newDescription } : f));

    toast({
      title: "Folder updated",
      description: "Folder description has been updated.",
    });
  };

  const updateStudyStats = async (noteId: string, mode: "quiz" | "flashcards", correct = true, totalCorrect?: number, totalAttempts?: number) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const studyStats = note.studyStats || {
      quizAttempts: 0,
      quizCorrect: 0,
      flashcardReviews: 0,
    };

    const updatedNote = {
      ...note,
      tags: note.tags || [], // Ensure tags is always defined
      lastStudied: Date.now(),
      studyStats: mode === "quiz"
        ? {
          ...studyStats,
          quizAttempts: totalAttempts ? studyStats.quizAttempts + totalAttempts : studyStats.quizAttempts + 1,
          quizCorrect: totalCorrect ? studyStats.quizCorrect + totalCorrect : (correct ? studyStats.quizCorrect + 1 : studyStats.quizCorrect),
        }
        : {
          ...studyStats,
          flashcardReviews: studyStats.flashcardReviews + 1,
        },
    };

    await updateNote(updatedNote);
    // Update the notes state to reflect the changes immediately
    setNotes(prevNotes => prevNotes.map(n => n.id === noteId ? updatedNote : n));
  };

  const handleFolderClick = async (folderId: string) => {
    console.log(`Handling click for folder: ${folderId}`);
    setActiveFolder(folderId);
    setActiveNote(null);
    setShowStudyModeSelector(true);
    setView(null);
    setShowDashboard(false);

    // Immediately fetch and set folder notes
    const notesInFolder = await getFolderNotes(folderId);
    console.log(`Setting ${notesInFolder.length} notes for folder ${folderId}`);
    setFolderNotes(notesInFolder);
  };

  const handleFolderDropdownClick = (folderId: string) => {
    // Don't change the activeFolder state when just expanding/collapsing in the sidebar
    // This prevents the infinite update loop
  }

  const selectStudyMode = (mode: "flashcards" | "quiz") => {
    setActiveNote(null);
    setView(mode);
    setShowStudyModeSelector(false);
  }

  const getFolderNotes = async (folderId: string): Promise<Note[]> => {
    try {
      // Get all notes in this folder and its subfolders
      const childFolderIds = await getAllChildFolderIds(folderId);
      console.log(`Child folder IDs for ${folderId}:`, childFolderIds);

      // Convert array to Set for O(1) lookups
      const folderIdSet = new Set([folderId, ...childFolderIds]);
      console.log(`Folder ID set:`, Array.from(folderIdSet));

      // Filter notes that belong to this folder or its subfolders
      const folderNotes = notes.filter(note => {
        const isInFolder = folderIdSet.has(note.folderId);
        console.log(`Note ${note.title} (${note.folderId}) is in folder: ${isInFolder}`);
        return isInFolder;
      });

      // Log for debugging
      console.log(`Found ${folderNotes.length} notes in folder ${folderId} and its subfolders:`,
        folderNotes.map(n => `${n.title} (${n.folderId})`));

      return folderNotes;
    } catch (error) {
      console.error('Error getting folder notes:', error);
      return [];
    }
  };

  const goToDashboard = () => {
    setActiveNote(null)
    setShowStudyModeSelector(false)
    setShowDashboard(true)
  }

  const openNote = (note: Note) => {
    setActiveNote(note)
    setView("editor")
    setShowStudyModeSelector(false)
    setShowDashboard(false)
  }

  const deselectNote = () => {
    setActiveNote(null)
    if (activeFolder) {
      setShowStudyModeSelector(true)
    } else {
      setShowDashboard(true)
    }
  }

  const studyNote = (noteOrFolderId: Note | Note[] | string, mode: "flashcards" | "quiz") => {
    if (typeof noteOrFolderId === "string") {
      // It's a folderId: set up folder study mode
      setActiveFolder(noteOrFolderId);
      setActiveNote(null);
      setShowStudyModeSelector(true);
      setView(null);
      setShowDashboard(false);
    } else if (Array.isArray(noteOrFolderId)) {
      setActiveNote(null);
      setView(mode);
      setShowStudyModeSelector(false);
      setShowDashboard(false);
      setFolderNotes(noteOrFolderId); // Show all notes in the folder
    } else {
      setActiveNote(noteOrFolderId);
      setView(mode);
      setShowStudyModeSelector(false);
      setShowDashboard(false);
    }
  };

  // Electron-specific functions
  const saveToFile = async () => {
    if (!isElectron) return;

    try {
      const data = {
        folders,
        notes,
      };

      const result = await window.electronAPI.saveFile({
        content: JSON.stringify(data, null, 2),
        filePath: currentFilePath || undefined,
      });

      if (result.success && result.filePath) {
        setCurrentFilePath(result.filePath);
        toast({
          title: "File saved",
          description: "Your notes have been saved to disk.",
        });
      } else {
        toast({
          title: "Error saving file",
          description: result.message || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast({
        title: "Error saving file",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const openFromFile = async () => {
    if (!isElectron) return;

    try {
      const result = await window.electronAPI.openFile();

      if (result.success && result.content) {
        const data = JSON.parse(result.content);

        if (data.folders && data.notes) {
          // Clear existing data
          await Promise.all([
            ...folders.map(folder => deleteFolder(folder.id)),
            ...notes.map(note => deleteNote(note.id))
          ]);

          // Add new data
          await Promise.all([
            ...data.folders.map((folder: Folder) => addFolder(folder)),
            ...data.notes.map((note: Note) => {
              // Ensure tags is always defined
              return addNote({
                ...note,
                tags: note.tags || []
              });
            })
          ]);

          if (result.filePath) {
            setCurrentFilePath(result.filePath);
          }

          toast({
            title: "File opened",
            description: "Your notes have been loaded from disk.",
          });
        } else {
          toast({
            title: "Invalid file format",
            description: "The selected file does not contain valid notes data.",
            variant: "destructive",
          });
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast({
        title: "Error opening file",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const moveItem = async (itemId: string, newParentId: string | null, itemType: 'folder' | 'note') => {
    try {
      if (itemType === 'folder') {
        const folder = folders.find(f => f.id === itemId);
        if (!folder) {
          console.error('Source folder not found:', itemId);
          return;
        }
        // Prevent moving a folder into itself or its descendants
        if (newParentId) {
          const targetFolder = folders.find(f => f.id === newParentId);
          if (targetFolder?.path?.includes(itemId)) {
            return;
          }
        }
        const childFolders = folders.filter(f => f.parentId === itemId);
        if (childFolders.some(f => f.id === newParentId)) {
          return;
        }
        if (newParentId === null) {
          const updatedFolder = {
            ...folder,
            parentId: null,
            path: [itemId]
          };
          setFolders(prevFolders => prevFolders.map(f => f.id === itemId ? { ...f, parentId: null, path: [itemId] } : f));
          await db.folders.put(updatedFolder);
          // Update path for all descendants
          const updateDescendantPaths = (parentId: string, parentPath: string[]) => {
            folders.forEach(folder => {
              if (folder.parentId === parentId) {
                const updatedPath = [...parentPath, folder.id];
                setFolders(prevFolders => prevFolders.map(f => f.id === folder.id ? { ...f, path: updatedPath } : f));
                db.folders.put({ ...folder, path: updatedPath });
                updateDescendantPaths(folder.id, updatedPath);
              }
            });
          };
          updateDescendantPaths(itemId, [itemId]);
          return;
        }
        const targetFolder = folders.find(f => f.id === newParentId);
        if (!targetFolder) {
          console.error('Target folder not found:', newParentId);
          return;
        }
        const newPath2 = [...targetFolder.path, itemId];
        const updatedFolder2 = {
          ...folder,
          parentId: newParentId,
          path: newPath2,
        };
        setFolders(prevFolders => prevFolders.map(f => f.id === itemId ? { ...f, parentId: newParentId, path: newPath2 } : f));
        await db.folders.put(updatedFolder2);
        // Update path for all descendants
        const updateDescendantPaths = (parentId: string, parentPath: string[]) => {
          folders.forEach(folder => {
            if (folder.parentId === parentId) {
              const updatedPath = [...parentPath, folder.id];
              setFolders(prevFolders => prevFolders.map(f => f.id === folder.id ? { ...f, path: updatedPath } : f));
              db.folders.put({ ...folder, path: updatedPath });
              updateDescendantPaths(folder.id, updatedPath);
            }
          });
        };
        updateDescendantPaths(itemId, newPath2);
      } else {
        const note = notes.find(n => n.id === itemId);
        if (!note) {
          console.error('Source note not found:', itemId);
          return;
        }

        // If moving to root level
        if (newParentId === null) {
          const updatedNote = {
            ...note,
            folderId: 'root'
          };
          await db.notes.put(updatedNote);

          // Reload notes to ensure UI is updated
          await reloadNotes();
          return;
        }

        // Moving to a folder
        const targetFolder = folders.find(f => f.id === newParentId);
        if (!targetFolder) {
          console.error('Target folder not found:', newParentId);
          return;
        }

        const updatedNote = {
          ...note,
          folderId: newParentId
        };
        await db.notes.put(updatedNote);

        // Reload notes to ensure UI is updated
        await reloadNotes();
      }
    } catch (error) {
      console.error('Error moving item:', error);
      toast({
        title: "Error",
        description: "Failed to move item. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Add undo/redo support
  const handleUndo = async () => {
    try {
      const success = await db.undoLastOperation();
      if (success) {
        toast({
          title: "Operation undone",
          description: "The last operation has been undone.",
        });
      } else {
        toast({
          title: "Nothing to undo",
          description: "There are no operations to undo.",
        });
      }
    } catch (error) {
      console.error('Error undoing operation:', error);
      toast({
        title: "Error undoing operation",
        description: "An error occurred while trying to undo the last operation.",
        variant: "destructive",
      });
    }
  };

  const resetDatabase = async () => {
    try {
      // Clear existing data
      await Promise.all([
        ...folders.map(folder => deleteFolder(folder.id)),
        ...notes.map(note => deleteNote(note.id))
      ]);

      // Reset state
      setActiveNote(null);
      setActiveFolder(null);
      setView(null);
      setShowStudyModeSelector(false);
      setShowDashboard(true);

      toast({
        title: "Database reset",
        description: "All data has been cleared.",
      });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Error resetting database:', error);
      toast({
        title: "Error resetting database",
        description: "An error occurred while resetting the database.",
        variant: "destructive",
      });
    }
  };

  // Functions for settings dialog
  const darkMode = theme === 'dark';
  const onToggleDarkMode = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        folders={folders}
        notes={filteredNotes}
        activeNote={activeNote}
        activeFolder={activeFolder}
        onFolderClick={handleFolderClick}
        onFolderDropdownClick={handleFolderDropdownClick}
        setActiveNote={(note) => {
          openNote(note)
        }}
        createFolder={createFolderHandler}
        deleteNote={deleteNoteHandler}
        onDashboardClick={goToDashboard}
        deleteFolder={deleteFolderHandler}
        deselectNote={deselectNote}
        renameFolder={renameFolderHandler}
        createNewNote={createNewNote}
        moveItem={moveItem}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showDashboard={showDashboard}
        darkMode={darkMode}
        onToggleDarkMode={onToggleDarkMode}
        onImport={openFromFile}
        onExport={saveToFile}
      />
      <div className="flex flex-col flex-1 overflow-hidden">


        {showDashboard && (
          <Dashboard
            notes={notes}
            folders={folders}
            onOpenNote={openNote}
            onStudyNote={studyNote}
            onCreateNote={createNewNote}
          />
        )}

        {showStudyModeSelector && activeFolder && !activeNote && (
          <FolderStudyMode
            folderName={folders.find((f) => f.id === activeFolder)?.name || "Study"}
            folderDescription={folders.find((f) => f.id === activeFolder)?.description}
            onSelectMode={selectStudyMode}
            onCreateNote={() => {
              createNewNote()
              setShowStudyModeSelector(false)
              setShowDashboard(false)
            }}
            folderNotes={folderNotes}
            onEditDescription={(description) => {
              if (activeFolder) {
                updateFolderDescriptionHandler(activeFolder, description)
              }
            }}
          />
        )}

        {activeNote && !showStudyModeSelector && !showDashboard && (
          <div className="flex-1 overflow-hidden">
            <Tabs
              value={view || "editor"}
              onValueChange={(v) => setView(v as any)}
              className="w-full h-full flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <TabsList>
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                  <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
                  <TabsTrigger value="quiz">Quiz</TabsTrigger>
                </TabsList>
                <div className="flex items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="rounded-full p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-0"
                        title="More options"
                        tabIndex={0}
                      >
                        <MoreHorizontal className="w-5 h-5 text-black rotate-90" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => {
                          if (activeNote && window.confirm('Are you sure you want to delete this note?')) {
                            deleteNoteHandler(activeNote.id)
                          }
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete note
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <TabsContent value="editor" className="flex-1 p-0 m-0 h-full overflow-hidden">
                <Editor note={activeNote} updateNote={updateNoteHandler} />
              </TabsContent>

              <TabsContent value="flashcards" className="flex-1 p-0 m-0 h-full overflow-hidden">
                <FlashcardView note={activeNote} onComplete={() => updateStudyStats(activeNote.id, "flashcards")} />
              </TabsContent>

              <TabsContent value="quiz" className="flex-1 p-0 m-0 h-full overflow-hidden">
                <QuizView
                  note={activeNote}
                  onComplete={(noteId: string, score: number, total: number) => {
                    // Update stats in a single operation
                    updateStudyStats(noteId, "quiz", true, score, total);
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {view === "flashcards" && activeFolder && !activeNote && !showDashboard && (
          <FlashcardView
            notes={folderNotes}
            folderName={folders.find((f) => f.id === activeFolder)?.name || "Study"}
            onComplete={(noteId) => updateStudyStats(noteId, "flashcards")}
          />
        )}

        {view === "quiz" && activeFolder && !activeNote && !showDashboard && (
          <QuizView
            notes={folderNotes}
            folderName={folders.find((f) => f.id === activeFolder)?.name || "Study"}
            onComplete={(noteId: string, score: number, total: number) => {
              // Update stats in a single operation
              updateStudyStats(noteId, "quiz", true, score, total);
            }}
          />
        )}

        {!activeNote && !showStudyModeSelector && !view && !showDashboard && (
          <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
            <div className="max-w-md">
              <h2 className="mb-2 text-2xl font-bold">No notes selected</h2>
              <p className="mb-4 text-muted-foreground">Select a folder to study or create a new note.</p>
              <Button onClick={createNewNote}>
                <Plus className="w-4 h-4 mr-2" /> Create New Note
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
