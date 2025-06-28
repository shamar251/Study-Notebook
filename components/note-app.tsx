"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Settings, BookOpen, Brain, Save, FolderOpen, Trash2, MoreHorizontal, ArrowLeft } from "lucide-react"
import { useNotes, useFolders, addNote, updateNote, deleteNote, addFolder, updateFolder, deleteFolder, searchNotes, getAllChildFolderIds } from "@/hooks/use-db"
import { initializeDatabase, db, getNextOrder, recordOperation, reorderItems, updateFolderPath, type Note as DBNote, type Folder as DBFolder, moveToTrash, restoreFromTrash, permanentDelete, type Block } from "@/lib/db"
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
import TestView from "@/components/testview"
import {
  BLOCK_TYPES,
  BLOCK_TYPE_ICONS,
  BLOCK_TYPE_LABELS
} from "@/lib/block-types"
import { type BlockType } from "@/lib/block-types"
import { ClusteredForceGraph, D3BlockVisualizer, ReactFlowTreeVisualizer } from "./block-visualizer"
import { Select } from "./ui/select"
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'

export type Note = DBNote

export type Folder = DBFolder

export default function NoteApp() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const { toast } = useToast()
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"editor" | "flashcards" | "quiz" | "test" | "view" | null>(null);
  const [showStudyModeSelector, setShowStudyModeSelector] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [folderNotes, setFolderNotes] = useState<Note[]>([]);
  const { theme, setTheme } = useTheme();
  const [visualizationMode, setVisualizationMode] = useState<'clustered' | 'classic' | 'tree' | 'reactflow'>('clustered');
  const [testTarget, setTestTarget] = useState<{ type: 'note', note: Note } | { type: 'folder', folderId: string } | null>(null);
  const [quizTarget, setQuizTarget] = useState<{ type: 'note', note: Note } | { type: 'folder', folderId: string } | null>(null);

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
      note.blocks.some((block) => block.content?.toLowerCase().includes(searchQuery.toLowerCase())))
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
    const fullNoteId = noteId.startsWith('note-') ? noteId : `note-${noteId}`;
    try {
      if (activeNote?.id === fullNoteId) {
        setActiveNote(null);
        setView(null);
        setShowStudyModeSelector(false);
        setShowDashboard(true);
      }
      await moveToTrash(fullNoteId, 'note');
      await reloadNotes();
      toast({
        title: "Note moved to trash",
        description: "The note has been moved to trash.",
      });
    } catch (error) {
      console.error('Error moving note to trash:', error);
      toast({
        title: "Error",
        description: "Failed to move note to trash. Please try again.",
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
    try {
      await moveToTrash(folderId, 'folder');
      await reloadNotes();
      setFolders(await db.folders.toArray());
      if (activeFolder === folderId) {
        setActiveFolder(null);
      }
      toast({
        title: "Folder moved to trash",
        description: "The folder has been moved to trash.",
      });
    } catch (error) {
      console.error('Error moving folder to trash:', error);
      toast({
        title: "Error",
        description: "Failed to move folder to trash. Please try again.",
        variant: "destructive",
      });
    }
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

  const selectStudyMode = (mode: "flashcards" | "quiz" | "test", note?: Note, subfolderId?: string) => {
    if (note) {
      setActiveNote(note);
      setView(mode);
      setShowStudyModeSelector(false);
      if (mode === "test") {
        setTestTarget({ type: 'note', note });
      } else {
        setTestTarget(null);
      }
    } else if (subfolderId) {
      setActiveNote(null);
      setView(mode);
      setShowStudyModeSelector(false);
      setActiveFolder(subfolderId);
      if (mode === "test") {
        setTestTarget({ type: 'folder', folderId: subfolderId });
      } else {
        setTestTarget(null);
      }
    } else {
      setActiveNote(null);
      setView(mode);
      setShowStudyModeSelector(false);
      if (mode === "test") {
        setTestTarget({ type: 'folder', folderId: activeFolder || "" });
      } else {
        setTestTarget(null);
      }
    }
  };

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
    // If currently in test view, update testTarget to the new note
    if (view === "test") {
      setTestTarget({ type: 'note', note });
    }
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
      setActiveFolder(null);
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

          // Reload notes and folders to ensure UI is updated
          const allNotes = await db.notes.toArray();
          setNotes(allNotes);
          setFolders(await db.folders.toArray());

          // If the moved note is the active note, update activeNote state
          if (activeNote?.id === note.id) {
            setActiveNote(allNotes.find(n => n.id === note.id) || null);
          }
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

        // Reload notes and folders to ensure UI is updated
        const allNotes = await db.notes.toArray();
        setNotes(allNotes);
        setFolders(await db.folders.toArray());

        // If the moved note is the active note, update activeNote state
        if (activeNote?.id === note.id) {
          setActiveNote(allNotes.find(n => n.id === note.id) || null);
        }
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

  const handleRestoreItem = async (itemId: string, itemType: 'folder' | 'note') => {
    await restoreFromTrash(itemId, itemType);
    await reloadNotes();
    setFolders(await db.folders.toArray());
  };

  const handlePermanentDelete = async (itemId: string, itemType: 'folder' | 'note') => {
    await permanentDelete(itemId, itemType);
    await reloadNotes();
    setFolders(await db.folders.toArray());
  };

  const handleEditFolderName = async (newName: string) => {
    if (!activeFolder) return;
    const folder = folders.find(f => f.id === activeFolder);
    if (!folder) return;
    await updateFolder({ ...folder, name: newName });
    setFolders(prev => prev.map(f => f.id === activeFolder ? { ...f, name: newName } : f));
  };

  const handleBlockReorder = async (newOrder: string[]) => {
    if (!activeNote) return;

    // Create a new blocks array with the reordered blocks
    const reorderedBlocks: Block[] = [];
    const blockMap = new Map<string, Block>();
    activeNote.blocks.forEach(block => blockMap.set(block.id, block));

    newOrder.forEach(blockId => {
      const block = blockMap.get(blockId);
      if (block) {
        reorderedBlocks.push(block);
      }
    });

    // Add any remaining blocks that weren't in the order
    activeNote.blocks.forEach(block => {
      if (!newOrder.includes(block.id)) {
        reorderedBlocks.push(block);
      }
    });

    const updatedNote = {
      ...activeNote,
      blocks: reorderedBlocks,
      updatedAt: Date.now()
    };

    await updateNoteHandler(updatedNote);
  };

  // Handler for Test tab/button
  const handleTestTab = () => {
    if (activeNote) {
      setTestTarget({ type: 'note', note: activeNote });
      setView('test');
    }
  };

  // Handler for Quiz tab/button
  const handleQuizTab = () => {
    if (activeNote) {
      setQuizTarget({ type: 'note', note: activeNote });
      setView('quiz');
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          folders={folders}
          notes={filteredNotes}
          activeNote={activeNote}
          activeFolder={activeFolder}
          setActiveFolder={setActiveFolder}
          onFolderClick={handleFolderClick}
          onFolderDropdownClick={handleFolderDropdownClick}
          setActiveNote={(note) => {
            if (note) openNote(note);
            else setActiveNote(null);
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
          restoreItem={handleRestoreItem}
          permanentDeleteItem={handlePermanentDelete}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
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
              onCreateSubfolder={() => createFolderHandler("New Subfolder", activeFolder)}
              folderNotes={folderNotes}
              subfolders={folders.filter(f => f.parentId === activeFolder).map(f => ({ id: f.id, name: f.name, description: f.description }))}
              folders={folders}
              notes={notes}
              onOpenSubfolder={(subfolderId) => {
                setActiveFolder(subfolderId);
                setActiveNote(null);
                setShowStudyModeSelector(true);
                setView(null);
                setShowDashboard(false);
              }}
              onEditDescription={(description) => {
                if (activeFolder) {
                  updateFolderDescriptionHandler(activeFolder, description)
                }
              }}
              onEditName={handleEditFolderName}
              onNoteClick={openNote}
            />
          )}

          {activeNote && !showStudyModeSelector && !showDashboard && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Tabs
                value={view || "editor"}
                onValueChange={(v) => setView(v as any)}
                className="w-full h-full flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <TabsList>
                    <TabsTrigger value="view">View Mode</TabsTrigger>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
                    <TabsTrigger value="quiz" onClick={handleQuizTab} disabled={!activeNote}>Quiz</TabsTrigger>
                    <TabsTrigger value="test" onClick={handleTestTab} disabled={!activeNote}>Test</TabsTrigger>
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
                  <FlashcardView
                    note={activeNote}
                    onComplete={() =>
                      updateStudyStats(activeNote.id, "flashcards")
                    }
                  />
                </TabsContent>

                <TabsContent value="quiz" className="flex-1 p-0 m-0 h-full overflow-hidden">
                  <QuizView
                    note={activeNote}
                    onComplete={(noteId, score, total) =>
                      updateStudyStats(noteId, "quiz", undefined, score, total)
                    }
                  />
                </TabsContent>

                <TabsContent value="test" className="flex-1 p-0 m-0 h-full overflow-hidden">
                  {testTarget?.type === 'note' && (
                    <TestView
                      availableFolders={folders.map((f) => ({
                        id: f.id,
                        name: f.name
                      }))}
                      availableNotes={notes.map((n) => ({
                        id: n.id,
                        title: n.title,
                        folderId: n.folderId
                      }))}
                      defaultNoteId={testTarget.note.id}
                      onTestComplete={async (session) => {
                        await db.testSessions.add(session)
                        console.log("Test session saved:", session)
                      }}
                    />
                  )}
                  {testTarget?.type === 'folder' && (
                    <TestView
                      availableFolders={folders.map((f) => ({
                        id: f.id,
                        name: f.name
                      }))}
                      availableNotes={notes.map((n) => ({
                        id: n.id,
                        title: n.title,
                        folderId: n.folderId
                      }))}
                      defaultFolderId={testTarget.folderId || undefined}
                      autoStartIfDefault={true}
                      onTestComplete={async (session) => {
                        await db.testSessions.add(session)
                        console.log("Test session saved:", session)
                      }}
                    />
                  )}
                </TabsContent>

                <TabsContent value="view" className="flex-1 p-0 m-0 h-full overflow-hidden">
                  <div className="flex items-center gap-2 p-2 ml-2">
                    {/* <label htmlFor="viz-mode" className="text-sm font-medium">Visualization:</label> */}
                    <select
                      id="viz-mode"
                      className="border rounded px-2 py-1 text-sm"
                      value={visualizationMode}
                      onChange={e => setVisualizationMode(e.target.value as any)}
                    >
                      <option value="clustered">Clustered Force Graph</option>
                      <option value="classic">Classic Force Graph</option>
                      <option value="tree">Tree Visualizer</option>
                    </select>
                  </div>
                  {visualizationMode === 'clustered' && (
                    <ClusteredForceGraph blocks={activeNote.blocks} />
                  )}
                  {visualizationMode === 'classic' && (
                    <D3BlockVisualizer blocks={activeNote.blocks} />
                  )}

                  {visualizationMode === 'tree' && (
                    <ReactFlowTreeVisualizer blocks={activeNote.blocks} />
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Folder-level study modes (when activeNote is null but view is set) */}
          {!activeNote && !showStudyModeSelector && !showDashboard && view && ["flashcards", "quiz", "test"].includes(view) && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setView(null);
                      setShowStudyModeSelector(true);
                      setTestTarget(null);
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Folder
                  </Button>
                  {/* <span className="text-sm font-medium">
                    {view === "flashcards" && "Flashcards"}
                    {view === "quiz" && "Quiz"}
                    {view === "test" && "Test"}
                    {activeFolder && ` - ${folders.find(f => f.id === activeFolder)?.name}`}
                  </span> */}
                </div>
              </div>

              {view === "flashcards" && (
                <FlashcardView
                  notes={folderNotes}
                  folderName={folders.find(f => f.id === activeFolder)?.name || "Study"}
                  onComplete={() => {
                    // Handle completion for folder-level flashcards
                    console.log("Folder flashcards completed");
                  }}
                />
              )}

              {view === "quiz" && (
                <QuizView
                  notes={folderNotes}
                  folderName={folders.find(f => f.id === activeFolder)?.name || "Study"}
                  onComplete={(noteId, score, total) => {
                    // Handle completion for folder-level quiz
                    console.log("Folder quiz completed", { noteId, score, total });
                  }}
                />
              )}

              {view === "test" && (
                <TestView
                  availableFolders={folders.map((f) => ({
                    id: f.id,
                    name: f.name
                  }))}
                  availableNotes={notes.map((n) => ({
                    id: n.id,
                    title: n.title,
                    folderId: n.folderId
                  }))}
                  defaultFolderId={activeFolder || undefined}
                  autoStartIfDefault={true}
                  onTestComplete={async (session) => {
                    await db.testSessions.add(session)
                    console.log("Test session saved:", session)
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </DndProvider>
  )
}
