"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Settings, BookOpen, Brain, Save, FolderOpen, Trash2, MoreHorizontal, ArrowLeft } from "lucide-react"
import { useNotes, useFolders, addNote, updateNote, deleteNote, addFolder, updateFolder, deleteFolder, searchNotes, getAllChildFolderIds } from "@/hooks/use-db"
import { initializeDatabase, db, getNextOrder, recordOperation, reorderItems, updateFolderPath, type Note as DBNote, type Folder as DBFolder, moveToTrash, restoreFromTrash, permanentDelete, toggleFavorite, type Block } from "@/lib/db"
import Sidebar from "@/components/sidebar"
import Editor from "@/components/editor"
import StudyModeSelector from "@/components/study-mode-selector"
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
import NoteDashboard from "@/components/note-dashboard";
import SemanticFolderAgents from "@/components/semantic-folder-agents"
import ReviewPage from "@/components/review-page"

export type Note = DBNote

export type Folder = DBFolder

export default function NoteApp() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const { toast } = useToast()
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"editor" | "flashcards" | "quiz" | "test" | "view" | "semantic-agents" | "review" | null>(null);
  const [showStudyModeSelector, setShowStudyModeSelector] = useState(false);
  const [folderNotes, setFolderNotes] = useState<Note[]>([])
  const { theme, setTheme } = useTheme();
  const [visualizationMode, setVisualizationMode] = useState<'clustered' | 'classic' | 'tree' | 'reactflow'>('clustered');
  const [testTarget, setTestTarget] = useState<{ type: 'note' | 'folder'; note?: Note; folderId?: string } | null>(null)
  const [quizTarget, setQuizTarget] = useState<{ type: 'note' | 'folder'; note?: Note; folderId?: string } | null>(null)
  const [currentStudySession, setCurrentStudySession] = useState<{
    studyItems: any[];
    folderName: string;
    context: 'note' | 'folder' | 'review';
    returnTo?: string;
  } | null>(null)
  const [noteTestSession, setNoteTestSession] = useState<any>(null);
  const [isElectron, setIsElectron] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  useEffect(() => {
    // Initialize database with default data if empty
    const initDb = async () => {
      try {
        await initializeDatabase();

        // Database should now be ready, load data
        const allFolders = await db.folders.toArray();
        const allNotes = await db.notes.toArray();

        setFolders(allFolders);
        setNotes(allNotes);

        // Try to restore last open note
        const lastOpenNoteId = typeof window !== 'undefined' ? localStorage.getItem('lastOpenNoteId') : null;
        if (lastOpenNoteId && allNotes.length > 0) {
          const found = allNotes.find(n => n.id === lastOpenNoteId);
          if (found) {
            setActiveNote(found);
            setView('editor');
            setShowStudyModeSelector(false);
          } else {
            setActiveNote(allNotes[0]);
            setView('editor');
            setShowStudyModeSelector(false);
          }
        } else if (allNotes.length > 0) {
          setActiveNote(allNotes[0]);
          setView('editor');
          setShowStudyModeSelector(false);
        }
      } catch (error) {
        console.error('Database initialization failed:', error);
        // Continue with app startup even if database fails
      }
    };

    initDb();

    setIsElectron(typeof window !== "undefined" && "electronAPI" in window);
  }, []);

  useEffect(() => {
    if (
      notes.length > 0 &&
      !activeNote &&
      !showStudyModeSelector &&
      !view // Only set activeNote if not in a study mode
    ) {
      setActiveNote(notes[0]);
    }
  }, [notes, activeNote, showStudyModeSelector, view]);

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
    // --- FIX: Always generate a unique id for new folders ---
    const uniqueId = `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newFolder: Folder = {
      id: uniqueId,
      name,
      parentId: actualParentId,
      description,
      createdAt: Date.now(),
      order: 0,
      path: actualParentId ? [actualParentId, uniqueId] : [uniqueId]
    };
    // --- END FIX ---
    // Optimistically update UI
    setFolders(prev => [...prev, newFolder]);
    try {
      await addFolder(newFolder);
      toast({
        title: "Folder created",
        description: `Folder \"${name}\" has been created.`,
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

    // Immediately fetch and set folder notes
    const notesInFolder = await getFolderNotes(folderId);
    console.log(`Setting ${notesInFolder.length} notes for folder ${folderId}`);
    setFolderNotes(notesInFolder);
  };

  const handleFolderDropdownClick = (folderId: string) => {
    // Don't change the activeFolder state when just expanding/collapsing in the sidebar
    // This prevents the infinite update loop
  }

  const selectStudyMode = (mode: "flashcards" | "quiz" | "test" | "review", note?: Note, subfolderId?: string) => {
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
      setShowStudyModeSelector(false);
      setActiveFolder(subfolderId);
      setView(mode);

      // If we're starting flashcards, create a study session for context tracking
      if (mode === 'flashcards') {
        // Create a study session for this folder
        const folderName = folders.find(f => f.id === subfolderId)?.name || "Study";

        // Determine context based on current view
        const context = view === 'review' ? 'review' : 'folder';
        const returnTo = view === 'review' ? 'review' : 'folder';

        setCurrentStudySession({
          studyItems: [], // Not used for rendering, just for context
          folderName,
          context,
          returnTo
        });
      }

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

  const goToSophia = () => {
    setActiveNote(null)
    setShowStudyModeSelector(false)
  }

  const openNote = (note: Note) => {
    setActiveNote(note)
    setView("editor")
    setShowStudyModeSelector(false)
    // If currently in test view, update testTarget to the new note
    if (view === "test") {
      setTestTarget({ type: 'note', note });
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastOpenNoteId', note.id);
    }
  }

  const deselectNote = () => {
    setActiveNote(null)
    if (activeFolder) {
      setShowStudyModeSelector(true)
    } else {
      setShowStudyModeSelector(false)
    }
  }

  const studyNote = (noteOrFolderId: Note | Note[] | string, mode: "flashcards" | "quiz") => {
    if (typeof noteOrFolderId === "string") {
      // It's a folderId: set up folder study mode
      setActiveFolder(noteOrFolderId);
      setActiveNote(null);
      setShowStudyModeSelector(true);
      setView(null);
    } else if (Array.isArray(noteOrFolderId)) {
      setActiveNote(null);
      setView(mode);
      setShowStudyModeSelector(false);
      setFolderNotes(noteOrFolderId); // Show all notes in the folder
    } else {
      setActiveNote(noteOrFolderId);
      setActiveFolder(null);
      setView(mode);
      setShowStudyModeSelector(false);
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

        // --- FIX: Refresh folderNotes if the moved note is in the current folder or its descendants ---
        if (activeFolder) {
          // Get all descendant folder IDs
          const childFolderIds = await getAllChildFolderIds(activeFolder);
          const allFolderIds = new Set([activeFolder, ...childFolderIds]);
          if (allFolderIds.has(newParentId)) {
            // The moved note is now in the current folder or a descendant
            const notesInFolder = allNotes.filter(n => allFolderIds.has(n.folderId));
            setFolderNotes(notesInFolder);
          }
        }
        // --- END FIX ---
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

  const handleToggleFavorite = async (itemId: string, itemType: 'folder' | 'note') => {
    await toggleFavorite(itemId, itemType);
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

  useEffect(() => {
    // Fetch latest test session for the active note
    const fetchTestSession = async () => {
      if (activeNote) {
        const sessions = await db.testSessions.where("noteId").equals(activeNote.id).reverse().toArray();
        setNoteTestSession(sessions.length > 0 ? sessions[0] : null);
      } else {
        setNoteTestSession(null);
      }
    };
    fetchTestSession();
  }, [activeNote]);

  const handleStartReview = async (studyItems: any[], folderName: string) => {
    console.log('🔄 handleStartReview called with:', { studyItems, folderName, studyItemsCount: studyItems.length });
    console.log('🔄 handleStartReview study items details:', studyItems.map(item => ({
      id: item.id,
      type: item.type,
      noteTitle: item.note?.title,
      folderId: item.folderId,
      blockContent: item.block?.content?.substring(0, 50)
    })));

    // Store the study session data
    setCurrentStudySession({
      studyItems,
      folderName,
      context: 'review',
      returnTo: 'review'
    });

    // Set the view to flashcards
    setView('flashcards');
    setActiveNote(null);
    setShowStudyModeSelector(false);
    setTestTarget(null);
    setQuizTarget(null);

    // Also clear activeFolder to ensure proper rendering
    setActiveFolder(null);

    // If we're studying a specific folder (not "All Folders"), set the activeFolder and update folderNotes
    if (folderName !== "All Folders" && studyItems.length > 0) {
      const firstStudyItem = studyItems[0];
      if (firstStudyItem && firstStudyItem.folderId) {
        setActiveFolder(firstStudyItem.folderId);
        console.log('🔄 handleStartReview: Set activeFolder to:', firstStudyItem.folderId);

        // Update folderNotes for this folder
        const notesInFolder = notes.filter(note => {
          const isInFolder = note.folderId === firstStudyItem.folderId;
          const isInSubfolder = folders.some(folder =>
            folder.parentId === firstStudyItem.folderId && note.folderId === folder.id
          );
          return isInFolder || isInSubfolder;
        });
        setFolderNotes(notesInFolder);
        console.log('🔄 handleStartReview: Updated folderNotes with', notesInFolder.length, 'notes');
        console.log('🔄 handleStartReview: FolderNotes details:', notesInFolder.map(n => ({ id: n.id, title: n.title, blocksCount: n.blocks.length })));
      }
    } else if (folderName === "All Folders") {
      // For "All Folders", set folderNotes to all notes
      setFolderNotes(notes);
      console.log('🔄 handleStartReview: Set folderNotes to all notes:', notes.length);
    }

    console.log('🔄 handleStartReview: Final state transition:', {
      view: 'flashcards',
      activeNote: null,
      showStudyModeSelector: false,
      currentStudySession: { studyItemsCount: studyItems.length, folderName },
      activeFolder: folderName !== "All Folders" && studyItems.length > 0 ? studyItems[0]?.folderId : null,
      folderNotesCount: folderName === "All Folders" ? notes.length : (studyItems.length > 0 ? notes.filter(n => n.folderId === studyItems[0]?.folderId).length : 0)
    });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={`flex h-screen ${view === 'review' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
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
          onDashboardClick={goToSophia}
          deleteFolder={deleteFolderHandler}
          deselectNote={deselectNote}
          renameFolder={renameFolderHandler}
          createNewNote={createNewNote}
          moveItem={moveItem}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showDashboard={false}
          darkMode={darkMode}
          onToggleDarkMode={onToggleDarkMode}
          onImport={openFromFile}
          onExport={saveToFile}
          restoreItem={handleRestoreItem}
          permanentDeleteItem={handlePermanentDelete}
          toggleFavorite={handleToggleFavorite}
          onSemanticAgentsClick={() => { setView('semantic-agents'); setActiveNote(null); setShowStudyModeSelector(false); }}
          onReviewClick={() => { setView('review'); setActiveNote(null); setShowStudyModeSelector(false); }}
        />
        <main className={`flex-1 flex flex-col ${view === 'review' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          {activeNote && !showStudyModeSelector && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <Tabs
                value={view || "editor"}
                onValueChange={(v) => setView(v as any)}
                className="w-full h-full flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <TabsList>
                    <TabsTrigger value="dashboard" className="flex items-center gap-2">
                      <img src="/Sophia.ico" alt="Sophia" className="w-4 h-4" />
                      Sophia
                    </TabsTrigger>
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

                <TabsContent value="dashboard" className="flex-1 p-0 m-0 h-full overflow-hidden">
                  <NoteDashboard
                    note={activeNote}
                    testSession={noteTestSession}
                  />
                </TabsContent>

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
                  {testTarget?.type === 'note' && testTarget.note && (
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

                <TabsContent value="review" className="flex-1 p-0 m-0 h-full overflow-hidden">
                  <ReviewPage folderId={activeNote.folderId} onStartReview={handleStartReview} />
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
          {(() => {
            const shouldRender = !activeNote && !showStudyModeSelector && view && ["flashcards", "quiz", "test"].includes(view);
            console.log('🔄 Render condition check:', {
              activeNote,
              showStudyModeSelector,
              view,
              shouldRender,
              currentStudySession: !!currentStudySession,
              viewType: typeof view,
              viewValue: view
            });
            return shouldRender;
          })() && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // Handle navigation based on study context
                        if (currentStudySession?.context === 'review') {
                          setView('review');
                          setCurrentStudySession(null);
                        } else if (currentStudySession?.context === 'folder') {
                          setView(null);
                          setShowStudyModeSelector(true);
                          setCurrentStudySession(null);
                        } else {
                          // Default fallback
                          setView(null);
                          setShowStudyModeSelector(true);
                        }
                        setTestTarget(null);
                      }}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      {currentStudySession?.context === 'review' ? 'Back to Review Page' : 'Back to Folder'}
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
                  <>
                    {console.log('🔄 Rendering FlashcardView with:', {
                      currentStudySession: !!currentStudySession,
                      context: currentStudySession?.context || 'none',
                      folderName: currentStudySession?.folderName || (folders.find(f => f.id === activeFolder)?.name || "Study"),
                      notesCount: folderNotes.length,
                      activeFolder
                    })}
                    <FlashcardView
                      notes={folderNotes}
                      folderName={currentStudySession ? currentStudySession.folderName : (folders.find(f => f.id === activeFolder)?.name || "Study")}
                      studyItems={currentStudySession?.studyItems}
                      onComplete={() => {
                        // Handle completion for folder-level flashcards
                        console.log("Folder flashcards completed");

                        // Handle navigation based on study context
                        if (currentStudySession?.context === 'review') {
                          setView('review');
                          setCurrentStudySession(null);
                        } else if (currentStudySession?.context === 'folder') {
                          setView(null);
                          setShowStudyModeSelector(true);
                          setCurrentStudySession(null);
                        } else {
                          // Default fallback
                          setView(null);
                          setShowStudyModeSelector(true);
                        }
                      }}
                    />
                  </>
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

                {view === "review" && (
                  <ReviewPage folderId={activeFolder || undefined} onStartReview={handleStartReview} onSelectMode={selectStudyMode} />
                )}
              </div>
            )}

          {/* Remove showDashboard and Dashboard references. Render FolderStudyMode if showStudyModeSelector and activeFolder and not activeNote. */}
          {showStudyModeSelector && activeFolder && !activeNote && (
            <FolderStudyMode
              folderName={folders.find((f) => f.id === activeFolder)?.name || "Study"}
              folderDescription={folders.find((f) => f.id === activeFolder)?.description}
              onSelectMode={selectStudyMode}
              onCreateNote={() => {
                createNewNote()
                setShowStudyModeSelector(false)
              }}
              onCreateSubfolder={(name, description) => createFolderHandler(name, activeFolder, description || "")}
              folderNotes={folderNotes}
              subfolders={folders.filter(f => f.parentId === activeFolder).map(f => ({ id: f.id, name: f.name, description: f.description }))}
              folders={folders}
              notes={notes}
              onOpenSubfolder={(subfolderId) => {
                setActiveFolder(subfolderId);
                setActiveNote(null);
                setShowStudyModeSelector(true);
                setView(null);
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

          {view === 'semantic-agents' && (
            <SemanticFolderAgents />
          )}

          {view === 'review' && activeNote && (
            <ReviewPage folderId={activeNote.folderId} onStartReview={handleStartReview} onSelectMode={selectStudyMode} />
          )}

          {/* Show ReviewPage when view is 'review' regardless of other state */}
          {view === 'review' && !activeNote && (
            <ReviewPage folderId={activeFolder || undefined} onStartReview={handleStartReview} onSelectMode={selectStudyMode} />
          )}
        </main>
      </div>
    </DndProvider>
  )
}
