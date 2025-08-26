"use client"

import React, { useState, useEffect } from "react"
import {
  BookOpen,
  Clock,
  TrendingUp,
  Target,
  RotateCcw,
  Pause,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  FolderOpen,
  Lightbulb,
  ChevronUp,
  ChevronDown,
  Layers
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SpacedRepetitionService, type StudyItemWithBlock } from "@/lib/spaced-repetition"
import { db, type Folder, type Note, type Block } from "@/lib/db"
import { Rating } from "ts-fsrs"
import { useToast } from "@/components/ui/use-toast"
import { FolderIcon } from "lucide-react"

// Extend the Note interface to include study data
interface NoteWithStudyData extends Note {
  studyStats?: {
    quizAttempts: number;
    quizCorrect: number;
    flashcardReviews: number;
    studyItems?: any[];
    lastStudied?: number;
  };
}

interface ReviewPageProps {
  folderId?: string
  onStartReview?: (studyItems: StudyItemWithBlock[], folderName: string) => void
  onSelectMode?: (mode: "flashcards" | "quiz" | "test" | "review", note?: Note, subfolderId?: string) => void
}

export default function ReviewPage({ folderId, onStartReview, onSelectMode }: ReviewPageProps) {
  console.log('🔄 ReviewPage component MOUNTING with props:', { folderId });

  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>(folderId || "all")
  const [studyItems, setStudyItems] = useState<StudyItemWithBlock[]>([])
  const [dueItems, setDueItems] = useState<StudyItemWithBlock[]>([])
  const [notes, setNotes] = useState<NoteWithStudyData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFiltering, setIsFiltering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)

  const { toast } = useToast()

  // Update selectedFolderId when folderId prop changes
  useEffect(() => {
    if (folderId) {
      setSelectedFolderId(folderId);
    }
  }, [folderId]);

  // Helper functions for review history
  const getUpcomingReviewsCount = (): number => {
    if (!studyItems.length) return 0;
    const now = Date.now();
    return studyItems.filter(item =>
      !item.suspended && (item.nextReview || 0) > now
    ).length;
  };

  const getCompletedReviewsCount = (): number => {
    if (!notes.length) return 0;
    let completed = 0;
    notes.forEach(note => {
      if (note.studyStats?.lastStudied) {
        completed++;
      }
    });
    return completed;
  };

  const renderUpcomingReviews = () => {
    if (!studyItems.length) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium mb-2 text-center">No upcoming reviews scheduled</p>
          <p className="text-sm opacity-80 text-center">All your study items are up to date!</p>
        </div>
      );
    }

    const now = Date.now();
    const upcomingItems = studyItems
      .filter(item => !item.suspended && (item.nextReview || 0) > now)
      .sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0))
      .slice(0, 10); // Show next 10 items

    if (upcomingItems.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <p className="text-lg font-medium mb-2 text-green-700 dark:text-green-400 text-center">All caught up!</p>
          <p className="text-sm opacity-80 text-center">No reviews due at the moment.</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {upcomingItems.map((item) => {
          const daysUntil = Math.ceil(((item.nextReview || 0) - now) / (24 * 60 * 60 * 1000));
          const timeUntil = new Date(item.nextReview || 0).toLocaleDateString();

          return (
            <div key={item.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-2.5 h-2.5 bg-primary rounded-full flex-shrink-0"></div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-relaxed text-foreground mb-1 text-left">
                    {item.block.content ? `${item.block.content.substring(0, 60)}...` : 'No content'}
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight text-left">
                    {item.note.title} • {item.type.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <Badge
                  variant={daysUntil <= 1 ? "destructive" : daysUntil <= 3 ? "secondary" : "outline"}
                  className="text-xs font-medium px-3 py-1 mb-2"
                >
                  {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`}
                </Badge>
                <p className="text-xs text-muted-foreground leading-tight">{timeUntil}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderReviewHistory = () => {
    if (!notes.length) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium mb-2 text-center">No review history available</p>
          <p className="text-sm opacity-80 text-center">Start studying to build your learning history!</p>
        </div>
      );
    }

    const notesWithHistory = notes
      .filter(note => note.studyStats?.lastStudied)
      .sort((a, b) => (b.studyStats?.lastStudied || 0) - (a.studyStats?.lastStudied || 0))
      .slice(0, 10); // Show last 10 reviewed notes

    if (notesWithHistory.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium mb-2 text-center">No recent study activity</p>
          <p className="text-sm opacity-80 text-center">Begin your learning journey today!</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {notesWithHistory.map((note) => {
          const lastStudied = note.studyStats?.lastStudied;
          const daysAgo = lastStudied ? Math.floor((Date.now() - lastStudied) / (24 * 60 * 60 * 1000)) : 0;
          const studyItemsCount = note.studyStats?.studyItems?.length || 0;

          return (
            <div key={note.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full flex-shrink-0"></div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-relaxed text-foreground mb-1 text-left">{note.title}</p>
                  <p className="text-xs text-muted-foreground leading-tight text-left">
                    {studyItemsCount} study items • {note.blocks.length} blocks
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <Badge variant="outline" className="text-xs font-medium px-3 py-1 mb-2">
                  {daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`}
                </Badge>
                <p className="text-xs text-muted-foreground leading-tight">
                  {lastStudied ? new Date(lastStudied).toLocaleDateString() : "Unknown"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };



  // Debug logging for dropdown changes
  useEffect(() => {
    console.log('🔄 selectedFolderId changed to:', selectedFolderId);
    console.log('🔄 filteredFolders count:', getFilteredFolders().length);

    // Add a brief filtering animation
    if (!isLoading) {
      setIsFiltering(true);
      const timer = setTimeout(() => setIsFiltering(false), 200);
      return () => clearTimeout(timer);
    }
  }, [selectedFolderId, isLoading]);

  useEffect(() => {
    const initializePage = async () => {
      try {
        setIsLoading(true)
        setError(null)

        console.log('Initializing review page...')
        await loadFolders()
        await loadNotes()
        await loadStudyItems()

        console.log('Review page initialized successfully')
      } catch (err) {
        console.error('Failed to initialize review page:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    initializePage()
  }, []) // Remove selectedFolderId dependency - it's just a visual filter

  // Count notes in a folder and its subfolders (same logic as sidebar)
  const countFolderNotes = (folderId: string): number => {
    const directNotes = notes.filter((note) => note.folderId === folderId).length;

    // Get child folders
    const childFolders = folders.filter((folder) => folder.parentId === folderId);
    const childNotes = childFolders.reduce((count, folder) => {
      return count + countFolderNotes(folder.id);
    }, 0);

    return directNotes + childNotes;
  };

  const loadFolders = async () => {
    const allFolders = await db.folders.toArray()
    console.log('📁 Loaded folders:', allFolders.map(f => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      hasChildren: allFolders.some(child => child.parentId === f.id)
    })));
    setFolders(allFolders)
  }

  const loadNotes = async () => {
    const allNotes = await db.notes.toArray();
    console.log('Loaded notes:', allNotes.map(note => ({
      id: note.id,
      title: note.title,
      folderId: note.folderId,
      hasStudyStats: !!note.studyStats,
      blocksCount: note.blocks.length,
      whoBlocks: note.blocks.filter(b => b.type === 'who').length,
      whatBlocks: note.blocks.filter(b => b.type === 'what').length
    })));
    setNotes(allNotes);
  };

  const loadStudyItems = async () => {
    try {
      console.log('Loading study items...');

      // Always load all study items and due items
      const items = await SpacedRepetitionService.getStudyItems()
      console.log('Loaded study items:', items);
      setStudyItems(items)

      const due = await SpacedRepetitionService.getDueStudyItems()
      console.log('Loaded due items:', due);
      console.log('Due items details:', due.map(item => ({
        id: item.id,
        type: item.type,
        nextReview: item.nextReview,
        suspended: item.suspended,
        folderId: item.folderId,
        blockContent: item.block?.content?.substring(0, 50) || 'No content'
      })));
      setDueItems(due)

    } catch (error) {
      console.error('Error loading study items:', error)
      toast({
        title: "Error",
        description: "Failed to load study items",
        variant: "destructive"
      })
    }
  }

  const refreshData = async () => {
    await loadStudyItems()
  }



  const startReview = (folderId?: string) => {
    // For folder-specific reviews, only show due items
    // For global review, show all due items
    const itemsToReview = folderId ? dueItems.filter(item => item.folderId === folderId) : dueItems;

    if (itemsToReview.length === 0) {
      toast({
        title: "No items to review",
        description: folderId ? "This folder has no items due for review" : "No items are due for review",
      })
      return
    }

    // Start the review using the existing flashcard system
    const folderName = folderId ? folders.find(f => f.id === folderId)?.name || "Unknown Folder" : "All Folders";

    if (onStartReview) {
      onStartReview(itemsToReview, folderName);
    } else {
      // Fallback: show toast if no callback provided
      toast({
        title: "Review session",
        description: `Starting review of ${itemsToReview.length} items from ${folderName}`,
      })
    }
  }

  const startStudy = (folderId: string) => {
    // Get all notes in this folder and its subfolders for study
    const getFolderNotes = (folderId: string): NoteWithStudyData[] => {
      const directNotes = notes.filter(note => note.folderId === folderId);
      const childFolders = folders.filter(f => f.parentId === folderId);
      const childNotes = childFolders.reduce((acc, folder) => {
        return [...acc, ...getFolderNotes(folder.id)];
      }, [] as NoteWithStudyData[]);
      return [...directNotes, ...childNotes];
    };

    const folderNotes = getFolderNotes(folderId);

    if (folderNotes.length === 0) {
      toast({
        title: "No notes to study",
        description: "This folder has no notes to study",
      })
      return
    }

    // Start the study session using the existing flashcard system
    const folderName = folders.find(f => f.id === folderId)?.name || "Unknown Folder";

    if (onStartReview) {
      // Create study items from WHO/WHAT pairs (same logic as getFolderStudyItems)
      const studyItems: StudyItemWithBlock[] = [];

      folderNotes.forEach(note => {
        note.blocks.forEach((block, idx) => {
          if (block.type === "who") {
            if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
              const whatBlock = note.blocks.find(b => b.id === block.linkedBlockIds![0] && b.type === "what");
              if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
                studyItems.push({
                  id: `study-${note.id}-${block.id}`,
                  blockId: block.id,
                  noteId: note.id,
                  folderId: note.folderId,
                  type: block.type,
                  nextReview: Date.now(),
                  suspended: false,
                  block: block,
                  note: note
                });
              }
            } else {
              if (idx < note.blocks.length - 1) {
                const nextBlock = note.blocks[idx + 1];
                if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
                  studyItems.push({
                    id: `study-${note.id}-${block.id}`,
                    blockId: block.id,
                    noteId: note.id,
                    folderId: note.folderId,
                    type: block.type,
                    nextReview: Date.now(),
                    suspended: false,
                    block: block,
                    note: note
                  });
                }
              }
            }
          }
        });
      });

      if (studyItems.length === 0) {
        toast({
          title: "No study items found",
          description: "This folder has no WHO/WHAT blocks to study",
        })
        return
      }

      console.log('🔄 startStudy: Calling onStartReview with:', { studyItems, folderName, studyItemsCount: studyItems.length });
      onStartReview(studyItems, folderName);
    } else {
      // Fallback: show toast if no callback provided
      toast({
        title: "Study session",
        description: `Starting study of ${studyItems.length} study items from ${folderName}`,
      })
    }
  }

  const startStudyAll = () => {
    if (notes.length === 0) {
      toast({
        title: "No notes to study",
        description: "No notes found in your study system",
      })
      return
    }

    // Start the study session using the existing flashcard system
    const folderName = "All Folders";

    if (onStartReview) {
      // Create study items from WHO/WHAT pairs (same logic as getFolderStudyItems)
      const studyItems: StudyItemWithBlock[] = [];

      notes.forEach(note => {
        note.blocks.forEach((block, idx) => {
          if (block.type === "who") {
            if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
              const whatBlock = note.blocks.find(b => b.id === block.linkedBlockIds![0] && b.type === "what");
              if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
                studyItems.push({
                  id: `study-${note.id}-${block.id}`,
                  blockId: block.id,
                  noteId: note.id,
                  folderId: note.folderId,
                  type: block.type,
                  nextReview: Date.now(),
                  suspended: false,
                  block: block,
                  note: note
                });
              }
            } else {
              if (idx < note.blocks.length - 1) {
                const nextBlock = note.blocks[idx + 1];
                if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
                  studyItems.push({
                    id: `study-${note.id}-${block.id}`,
                    blockId: block.id,
                    noteId: note.id,
                    folderId: note.folderId,
                    type: block.type,
                    nextReview: Date.now(),
                    suspended: false,
                    block: block,
                    note: note
                  });
                }
              }
            }
          }
        });
      });

      if (studyItems.length === 0) {
        toast({
          title: "No study items found",
          description: "No WHO/WHAT blocks found in your study system",
        })
        return
      }

      console.log('🔄 startStudyAll: Calling onStartReview with:', { studyItems, folderName, studyItemsCount: studyItems.length });
      onStartReview(studyItems, folderName);
    } else {
      // Fallback: show toast if no callback provided
      toast({
        title: "Study session",
        description: `Starting study of ${studyItems.length} study items from all folders`,
      })
    }
  }

  // Filter folders based on selection
  const getFilteredFolders = () => {
    if (selectedFolderId === "all") {
      return folders;
    }
    // For specific folder selection, include the folder and all its descendants
    const getDescendants = (folderId: string): string[] => {
      const descendants: string[] = [folderId];
      const children = folders.filter(f => f.parentId === folderId);
      children.forEach(child => {
        descendants.push(...getDescendants(child.id));
      });
      return descendants;
    };

    const descendantIds = getDescendants(selectedFolderId);
    return folders.filter(folder => descendantIds.includes(folder.id));
  };

  // Get filtered stats based on selection
  const getFilteredStats = () => {
    if (selectedFolderId === "all") {
      return {
        dueItems: dueItems.length,
        studyItems: studyItems.length,
        folders: folders.length
      };
    }

    // Get all descendants of the selected folder
    const getDescendants = (folderId: string): string[] => {
      const descendants: string[] = [folderId];
      const children = folders.filter(f => f.parentId === folderId);
      children.forEach(child => {
        descendants.push(...getDescendants(child.id));
      });
      return descendants;
    };

    const descendantIds = getDescendants(selectedFolderId);
    const filteredDueItems = dueItems.filter(item => descendantIds.includes(item.folderId));
    const filteredStudyItems = studyItems.filter(item => descendantIds.includes(item.folderId));
    const descendantFolders = folders.filter(folder => descendantIds.includes(folder.id));

    return {
      dueItems: filteredDueItems.length,
      studyItems: filteredStudyItems.length,
      folders: descendantFolders.length
    };
  };

  const filteredFolders = getFilteredFolders();
  const filteredStats = getFilteredStats();



  // Recursive function to render nested folders
  const renderFolderTree = (parentId: string | null, depth = 0, visitedIds: Set<string> = new Set()) => {
    // Safety check to prevent infinite recursion
    if (depth > 100) {
      console.warn('Maximum folder depth exceeded, stopping recursion');
      return null;
    }

    console.log(`🔍 renderFolderTree called with parentId: ${parentId}, depth: ${depth}`);

    let foldersToRender: typeof folders;

    if (parentId === null) {
      // Root level - show all folders with no parent
      foldersToRender = folders
        .filter(folder => folder.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name));
      console.log('🌳 Root level folders:', foldersToRender.map(f => f.name));
    } else {
      // Specific folder - show the folder and its immediate children
      const parentFolder = folders.find(f => f.id === parentId);
      if (!parentFolder) return null;

      // Check for circular references
      if (visitedIds.has(parentId)) {
        console.warn('Circular reference detected in folder structure:', parentId);
        return null;
      }

      // Get immediate children of this folder
      const immediateChildren = folders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Start with the parent folder, then add its immediate children
      foldersToRender = [parentFolder, ...immediateChildren];
      console.log(`📂 Parent folder: ${parentFolder.name}, immediate children:`, immediateChildren.map(c => c.name));
    }

    return foldersToRender.map(folder => {
      // Count study items and due items in this folder and all its subfolders
      const getFolderStudyItems = (folderId: string): number => {
        // Count WHO/WHAT pairs (study items) like folder-study-mode.tsx does
        const getFolderNotes = (folderId: string): Note[] => {
          const directNotes = notes.filter(note => note.folderId === folderId);
          const childFolders = folders.filter(f => f.parentId === folderId);
          const childNotes = childFolders.reduce((acc, folder) => {
            return [...acc, ...getFolderNotes(folder.id)];
          }, [] as Note[]);
          return [...directNotes, ...childNotes];
        };

        const folderNotes = getFolderNotes(folderId);

        // Count WHO/WHAT pairs using the same logic as folder-study-mode.tsx
        let count = 0;
        folderNotes.forEach(note => {
          note.blocks.forEach((block, idx) => {
            if (block.type === "who") {
              if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
                const whatBlock = note.blocks.find(b => b.id === block.linkedBlockIds![0] && b.type === "what");
                if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
                  count++;
                }
              } else {
                if (idx < note.blocks.length - 1) {
                  const nextBlock = note.blocks[idx + 1];
                  if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
                    count++;
                  }
                }
              }
            }
          });
        });
        return count;
      };

      const getFolderDueItems = (folderId: string): number => {
        const directItems = dueItems.filter(item => item.folderId === folderId).length;
        const childFolders = folders.filter(f => f.parentId === folderId);
        const childItems = childFolders.reduce((count, folder) => {
          return count + getFolderDueItems(folder.id);
        }, 0);
        return directItems + childItems;
      };

      const folderStudyItems = getFolderStudyItems(folder.id);
      const folderDueItems = getFolderDueItems(folder.id);
      const folderNotes = countFolderNotes(folder.id);

      console.log(`📁 Folder: ${folder.name}, totalNotes: ${folderNotes}, studyItems: ${folderStudyItems}, dueItems: ${folderDueItems}`);

      return (
        <div key={folder.id} className="space-y-3">
          <Card
            className={`group hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-[1.02] ${selectedFolderId === folder.id
              ? 'bg-white dark:bg-gray-950 border-2 border-primary/50 dark:border-primary/40 shadow-md'
              : folder.parentId
                ? 'bg-white dark:bg-gray-950 border-2 border-slate-300 dark:border-slate-600 ml-8'
                : 'bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-950/30 dark:to-slate-900/20'
              }`}
            onClick={() => setSelectedFolderId(folder.id)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg border border-border/30 shadow-sm group-hover:shadow-md transition-all ${selectedFolderId === folder.id
                      ? 'bg-white dark:bg-gray-950'
                      : folder.parentId
                        ? 'bg-white dark:bg-gray-950'
                        : 'bg-slate-50 dark:bg-slate-900/20'
                      }`}>
                      <FolderIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors leading-tight">
                          {folder.name}
                        </h3>
                        <Badge variant="outline" className="mt-1 text-xs font-medium px-2 py-0.5">
                          {folderNotes} notes
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="flex items-center justify-center w-6 h-6 bg-green-50 dark:bg-green-950/30 rounded border border-green-200/50 dark:border-green-800/30">
                        <BookOpen className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <span className="text-xs font-medium">{folderStudyItems} study items</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="flex items-center justify-center w-6 h-6 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200/50 dark:border-blue-800/30">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="text-xs font-medium">{folderDueItems} due today</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 ml-6">
                  <Button
                    onClick={() => startReview(folder.id)}
                    disabled={folderDueItems === 0}
                    className="flex items-center gap-2 h-9 px-3 text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Review ({folderDueItems})
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent card click
                      console.log('🔄 Study button clicked for folder:', folder.id, folder.name);
                      if (onSelectMode) {
                        onSelectMode("flashcards", undefined, folder.id);
                      } else {
                        startStudy(folder.id);
                      }
                    }}
                    disabled={folderStudyItems === 0}
                    variant="outline"
                    className="flex items-center gap-2 h-9 px-3 text-sm font-medium border hover:border-primary/50 transition-all duration-200"
                  >
                    <Target className="w-3.5 h-3.5" />
                    Study ({folderStudyItems})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      );
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-background">
        <div className="flex items-center gap-4 mb-8 pt-8 pl-8">
          <Lightbulb className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Review</h1>
        </div>
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-6 text-primary" />
            <p className="text-lg text-muted-foreground font-medium">Loading review data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-background">
        <div className="flex items-center gap-4 mb-8 pt-8 pl-8">
          <Lightbulb className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Review</h1>
        </div>
        <div className="mx-8 mb-8">
          <Card className="border-destructive shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-destructive mb-3">
                <AlertCircle className="w-6 h-6" />
                <p className="text-lg font-semibold">Error loading data</p>
              </div>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button
                variant="outline"
                size="default"
                className="font-medium"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-background overflow-y-auto">
      <div className="flex items-center gap-4 mb-10 pt-10 pl-8">
        <div className="flex items-center justify-center w-12 h-12 bg-white rounded-xl border border-border/30 shadow-sm">
          <Lightbulb className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-1">Review</h1>
          <p className="text-sm text-muted-foreground font-medium">Track your progress and manage study sessions</p>
        </div>
      </div>
      {/* Global Actions - Only show when "All folders" is selected */}
      {selectedFolderId === "all" && (
        <div className="pl-8 pr-8 max-w-7xl pb-8">
          <div className="flex gap-4">
            <Button
              onClick={() => startReview()}
              disabled={dueItems.length === 0}
              className="flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Review All Due Items ({dueItems.length})
            </Button>

            <Button
              variant="outline"
              onClick={() => startReview()}
              disabled={dueItems.length === 0}
              className="flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Review All Items Due Today ({dueItems.length})
            </Button>

            <Button
              variant="outline"
              onClick={refreshData}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                console.log('🔄 Study All button clicked');
                if (onSelectMode) {
                  onSelectMode("flashcards");
                } else {
                  startStudyAll();
                }
              }}
              disabled={notes.length === 0}
              className="flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              Study All Notes ({notes.length})
            </Button>
          </div>
        </div>
      )}

      <div className="pl-8 pr-8 max-w-7xl pb-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card className="group transition-all duration-300 hover:shadow-xl border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/30 dark:to-indigo-900/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Items Due Today</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">{filteredStats.dueItems}</span>
                <div className="p-2 bg-white rounded-lg border border-border/30 shadow-sm group-hover:shadow-md transition-all">
                  <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-indigo-600 dark:text-indigo-400">
                {filteredStats.dueItems === 0 ? 'All caught up!' : `${filteredStats.dueItems} items need your attention`}
              </p>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-300 hover:shadow-xl border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Total Study Items</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">{filteredStats.studyItems}</span>
                <div className="p-2 bg-white rounded-lg border border-border/30 shadow-sm group-hover:shadow-md transition-all">
                  <Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {filteredStats.studyItems === 0 ? 'No study items yet' : `${filteredStats.studyItems} items available for study`}
              </p>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-300 hover:shadow-xl border-0 shadow-sm hover:scale-[1.02] bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Study Decks</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-rose-900 dark:text-rose-100">{filteredStats.folders}</span>
                <div className="p-2 bg-white rounded-lg border border-border/30 shadow-sm group-hover:shadow-md transition-all">
                  <FolderIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {filteredStats.folders === 1 ? '1 organized deck' : `${filteredStats.folders} organized decks`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Review History & Upcoming Reviews */}
        <div className="mb-10">
          <Card className="group transition-all duration-300 hover:shadow-xl border-0 shadow-sm bg-gradient-to-r from-slate-50 to-slate-100/30 dark:from-slate-950/20 dark:to-slate-900/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-border/30 shadow-sm group-hover:shadow-md transition-all">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Review Schedule & History</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs font-medium px-3 py-1.5">
                  {getUpcomingReviewsCount()} upcoming
                </Badge>
                <Badge variant="outline" className="text-xs font-medium px-3 py-1.5">
                  {getCompletedReviewsCount()} completed
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  className="h-9 w-9 p-0 hover:bg-muted/50 transition-colors"
                >
                  {isHistoryExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </CardHeader>

            {isHistoryExpanded && (
              <CardContent className="pt-0">
                <div className="text-sm text-muted-foreground mb-4 text-left">
                  Track your study progress and see what's coming up next
                </div>
                <Tabs defaultValue="upcoming" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-10 mb-4">
                    <TabsTrigger value="upcoming" className="text-sm font-medium text-center">Upcoming Reviews</TabsTrigger>
                    <TabsTrigger value="history" className="text-sm font-medium text-center">Review History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="upcoming" className="mt-4">
                    <div className="space-y-3">
                      {renderUpcomingReviews()}
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <div className="space-y-3">
                      {renderReviewHistory()}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Folder Selection */}
        <div className="mb-10">
          <div className="bg-muted/30 rounded-xl p-6 border border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg border border-border/30 shadow-sm">
                  <FolderIcon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filter Study Decks</h3>
              </div>
              {selectedFolderId !== "all" && (
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="px-3 py-1.5 text-sm font-medium">
                    {folders.find(f => f.id === selectedFolderId)?.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground font-medium">
                    • {filteredStats.folders} folders • {filteredStats.dueItems} items due
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFolderId("all")}
                    className="h-8 px-3 text-sm font-medium hover:bg-muted/50"
                  >
                    Clear Filter
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-4">
                <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                  <SelectTrigger className="w-64 h-12 border-2 border-border hover:border-primary/50 transition-all duration-200 text-base font-medium">
                    <SelectValue placeholder="Select folder to focus on" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-base py-3">
                      <div className="flex items-center gap-2">
                        <FolderIcon className="w-4 h-4" />
                        All folders
                      </div>
                    </SelectItem>
                    {folders.map(folder => (
                      <SelectItem key={folder.id} value={folder.id} className="text-base py-3">
                        <div className="flex items-center gap-2">
                          <FolderIcon className="w-4 h-4" />
                          {folder.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

              </div>
            </div>
          </div>

          {/* Breadcrumb for nested folders */}
          {selectedFolderId !== "all" && (() => {
            const getFolderPath = (folderId: string): Folder[] => {
              const path: Folder[] = [];
              let currentFolder = folders.find(f => f.id === folderId);

              while (currentFolder) {
                path.unshift(currentFolder);
                if (!currentFolder!.parentId) break;
                const nextFolder = folders.find(f => f.id === currentFolder!.parentId);
                if (!nextFolder) break;
                currentFolder = nextFolder!;
              }

              return path;
            };

            const folderPath = getFolderPath(selectedFolderId);

            if (folderPath.length > 1) {
              return (
                <div className="mt-4 p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <FolderIcon className="w-4 h-4" />
                    <span className="font-medium">Folder Path:</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {folderPath.map((folder, index) => (
                      <div key={folder.id} className="flex items-center gap-2">
                        <span
                          className="hover:text-primary cursor-pointer font-medium transition-colors px-2 py-1 rounded hover:bg-muted/50"
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          {folder.name}
                        </span>
                        {index < folderPath.length - 1 && (
                          <span className="text-muted-foreground font-light">/</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Folders as Decks */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-border/30 shadow-sm">
                <Lightbulb className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Study Decks
                </h2>
                {selectedFolderId !== "all" && (
                  <p className="text-lg text-muted-foreground font-medium">
                    {folders.find(f => f.id === selectedFolderId)?.name}
                  </p>
                )}
              </div>
            </div>
            {selectedFolderId !== "all" && (
              <div className="text-sm text-muted-foreground bg-muted/50 px-4 py-3 rounded-xl border border-border/30">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <FolderIcon className="w-4 h-4" />
                    {filteredStats.folders} folders
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {filteredStats.dueItems} items due
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {filteredStats.studyItems} total items
                  </span>
                </div>
              </div>
            )}
          </div>

          {isFiltering && (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Filtering...</span>
            </div>
          )}

          {filteredFolders.length === 0 ? (
            <Card className="border-dashed border-2 border-muted-foreground/20 shadow-sm">
              <CardContent className="p-12 text-center">
                <FolderIcon className="w-16 h-16 mx-auto mb-6 text-muted-foreground/60" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-3">
                  {selectedFolderId === "all"
                    ? "No folders found in your study system."
                    : `No folders found matching the selected criteria.`
                  }
                </h3>
                {selectedFolderId !== "all" && (
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setSelectedFolderId("all")}
                    className="font-medium"
                  >
                    Show All Folders
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            selectedFolderId === "all"
              ? renderFolderTree(null)
              : renderFolderTree(selectedFolderId)
          )}
        </div>


      </div>
    </div>
  );
}
