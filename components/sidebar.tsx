"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import {
  ChevronDown,
  ChevronRight,
  File,
  FolderIcon,
  Trash2,
  Home,
  Edit,
  MoreHorizontal,
  Search,
  FileText,
  FolderPlus,
  Layout,
  Settings,
  Bookmark,
  RotateCcw,
  User, // Add User icon for profile button
  ChevronLeft, // For collapse button
  Bot, // Add Bot icon for semantic agents
} from "lucide-react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  DragOverEvent,
  ClientRect,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Folder, Note } from "@/components/note-app"
import { DraggableItem } from "@/components/draggable-item"
import { toast } from "@/components/ui/use-toast"
import SettingsDialog from './SettingsDialog'
import { useTheme } from 'next-themes'
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import Link from "next/link"

interface SidebarProps {
  folders: Folder[]
  notes: Note[]
  activeNote: Note | null
  activeFolder: string | null
  setActiveFolder: (folderId: string | null) => void
  onFolderClick: (folderId: string) => void
  onFolderDropdownClick: (folderId: string) => void
  setActiveNote: (note: Note | null) => void
  createFolder: (name: string, parentId: string | null, description?: string) => void
  deleteNote: (noteId: string) => void
  onDashboardClick: () => void
  deleteFolder: (folderId: string) => void
  deselectNote: () => void
  renameFolder: (folderId: string, newName: string) => void
  createNewNote: () => void
  moveItem: (itemId: string, newParentId: string | null, itemType: 'folder' | 'note') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  showDashboard: boolean
  darkMode: boolean
  onToggleDarkMode: () => void
  onImport: () => void
  onExport: () => void
  restoreItem: (itemId: string, itemType: 'folder' | 'note') => void
  permanentDeleteItem: (itemId: string, itemType: 'folder' | 'note') => void
  toggleFavorite: (itemId: string, itemType: 'folder' | 'note') => void
  onSemanticAgentsClick: () => void // <-- add this
}

// Custom alphanumeric sort: numbers first, then letters (case-insensitive)
function alphaNumSort(a: { name?: string; title?: string }, b: { name?: string; title?: string }) {
  const aLabel = (a.name ?? a.title ?? '').toString();
  const bLabel = (b.name ?? b.title ?? '').toString();
  const regex = /^\d/;
  const aIsNum = regex.test(aLabel);
  const bIsNum = regex.test(bLabel);
  if (aIsNum && !bIsNum) return -1;
  if (!aIsNum && bIsNum) return 1;
  return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base', numeric: true });
}

export default function Sidebar({
  folders,
  notes,
  activeNote,
  activeFolder,
  setActiveFolder,
  onFolderClick,
  onFolderDropdownClick,
  setActiveNote,
  createFolder,
  deleteNote,
  onDashboardClick,
  deleteFolder,
  deselectNote,
  renameFolder,
  createNewNote,
  moveItem,
  searchQuery,
  setSearchQuery,
  showDashboard,
  darkMode,
  onToggleDarkMode,
  onImport,
  onExport,
  restoreItem,
  permanentDeleteItem,
  toggleFavorite,
  onSemanticAgentsClick,
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    root: true,
  })
  const [newFolderName, setNewFolderName] = useState("")
  const [newFolderDescription, setNewFolderDescription] = useState("")
  const [newFolderParentId, setNewFolderParentId] = useState("root")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [folderToRename, setFolderToRename] = useState<Folder | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [newFolderNameForRename, setNewFolderNameForRename] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dragMode, setDragMode] = useState<'reorder' | 'move' | null>(null)
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; y: number } | null>(null)
  const [navSection, setNavSection] = useState<'notes' | 'search' | 'favorites' | 'trash'>('notes')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false); // Profile menu state
  const [collapsed, setCollapsed] = useState(false); // Sidebar collapsed state
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLDivElement>(null);

  // Add mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (showSettingsMenu) {
        const windowHeight = window.innerHeight;
        if (e.clientY < windowHeight / 2) {
          setShowSettingsMenu(false);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [showSettingsMenu]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  useEffect(() => {
    if (folderToRename) {
      setNewFolderNameForRename(folderToRename.name)
    }
  }, [folderToRename])

  const toggleFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolders({
      ...expandedFolders,
      [folderId]: !expandedFolders[folderId],
    })
    // Only call onFolderDropdownClick if needed for other functionality
    // but not for managing folder expansion state
    if (onFolderDropdownClick) {
      onFolderDropdownClick(folderId)
    }
  }

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      // If creating a parent folder, always use null as parentId
      const parentId = newFolderParentId === "null" ? null : (activeFolder || getParentId(newFolderParentId));
      createFolder(newFolderName, parentId, newFolderDescription);
      setNewFolderName("");
      setNewFolderDescription("");
      setIsDialogOpen(false);
    }
  }

  const handleRenameFolder = () => {
    if (folderToRename && newFolderNameForRename.trim()) {
      renameFolder(folderToRename.id, newFolderNameForRename.trim())
      setRenameDialogOpen(false)
      setFolderToRename(null)
      setNewFolderNameForRename("")
    }
  }

  const handleDeleteFolder = () => {
    if (folderToDelete) {
      deleteFolder(folderToDelete.id)
      setDeleteDialogOpen(false)
      setFolderToDelete(null)
    }
  }

  const handleCreateParentFolder = () => {
    setNewFolderParentId("null") // "null" string to represent a top-level folder
    setIsDialogOpen(true)
  }

  // Helper to convert string "null" to actual null when needed
  const getParentId = (parentIdStr: string): string | null => {
    return parentIdStr === "null" ? null : parentIdStr;
  }

  // Count notes in a folder and its subfolders
  const countFolderNotes = (folderId: string): number => {
    const directNotes = notes.filter((note) => note.folderId === folderId).length

    // Get child folders
    const childFolders = folders.filter((folder) => folder.parentId === folderId)
    const childNotes = childFolders.reduce((count, folder) => {
      return count + countFolderNotes(folder.id)
    }, 0)

    return directNotes + childNotes
  }

  // Check if folder can be deleted (remove all restrictions, always return true)
  const canDeleteFolder = (folderId: string): boolean => {
    return true;
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    // Store initial position from the event
    setDragStartPosition({ x: 0, y: 0 });
    setDragMode(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Only allow drag-to-move into folders, but not into itself or its descendants
    const [activeType, activeFolderId] = activeId.split('-');
    const [overType, overFolderId] = overId.split('-');
    if (overType === 'folder') {
      // Prevent dropping onto itself or its descendants
      if (activeType === 'folder' && activeFolderId === overFolderId) return;
      const overFolder = folders.find(f => f.id === overFolderId);
      if (activeType === 'folder' && overFolder?.path?.includes(activeFolderId)) return;
      setOverId(overId);
    } else {
      setOverId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveDragId(null);
      setOverId(null);
      setDragMode(null);
      setDragStartPosition(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Don't allow dropping onto the same item
    if (activeId === overId) {
      setActiveDragId(null);
      setOverId(null);
      setDragMode(null);
      setDragStartPosition(null);
      return;
    }

    // Extract the full ID after the type prefix
    const itemType = activeId.split('-')[0];
    const itemId = activeId.substring(itemType.length + 1);
    const targetType = overId.split('-')[0];
    const targetId = overId.substring(targetType.length + 1);

    // Only allow move into folders, but not into itself or its descendants
    if (targetType === 'folder') {
      if (itemType === 'folder' && itemId === targetId) return;
      const targetFolder = folders.find(f => f.id === targetId);
      if (itemType === 'folder' && targetFolder?.path?.includes(itemId)) return;
      moveItem(itemId, targetId, itemType as 'folder' | 'note');
    }

    setActiveDragId(null);
    setOverId(null);
    setDragMode(null);
    setDragStartPosition(null);
  };

  // Toggle folder expansion and set as active if opening
  const handleFolderRowClick = (folderId: string) => {
    setExpandedFolders(prev => {
      const isExpanded = !!prev[folderId];
      return { ...prev, [folderId]: !isExpanded };
    });
    // Always set as active on click
    onFolderClick(folderId);
  };

  // Filter out deleted items for normal view
  const activeFolders = folders.filter(folder => !folder.deletedAt);
  const activeNotes = notes.filter(note => !note.deletedAt);

  // Get deleted items for trash view
  const deletedFolders = folders.filter(folder => folder.deletedAt);
  const deletedNotes = notes.filter(note => note.deletedAt);

  const renderFolderTree = (parentId: string | null, depth = 0) => {
    const childFolders = activeFolders
      .filter((folder) => folder.parentId === parentId)
      .sort(alphaNumSort);

    // Only show root-level notes at the root
    const rootLevelNotes = parentId === null
      ? activeNotes.filter(note => note.folderId === 'root')
      : [];

    return (
      <div id={parentId === null ? 'root-container' : undefined} className="flex-1 overflow-auto p-0">
        {/* Render folders first */}
        {childFolders.map((folder) => {
          const isExpanded = expandedFolders[folder.id] || false;
          // Only show notes whose folderId exactly matches this folder (not 'root' or other folders)
          const childNotes = isExpanded
            ? activeNotes.filter((note) => note.folderId === folder.id).sort(alphaNumSort)
            : [];
          const hasChildren = activeFolders.some((f) => f.parentId === folder.id) || childNotes.length > 0;
          const folderNoteCount = countFolderNotes(folder.id);

          return (
            <ContextMenu key={folder.id}>
              <ContextMenuTrigger>
                <DraggableItem
                  id={`folder-${folder.id}`}
                  type="folder"
                  name={folder.name}
                  depth={depth}
                  isActive={activeFolder === folder.id && !activeNote}
                  noteCount={folderNoteCount}
                  isExpanded={isExpanded}
                  hasChildren={hasChildren}
                  favorite={folder.favorite}
                  onClick={() => {
                    setActiveNote(null);
                    setActiveFolder(folder.id);
                    handleFolderRowClick(folder.id);
                  }}
                  onToggle={(e) => toggleFolder(folder.id, e)}
                  isOver={overId === `folder-${folder.id}`}
                  dragMode={null}
                />
              </ContextMenuTrigger>

              <ContextMenuContent className="w-56">
                <ContextMenuItem onClick={createNewNote}>
                  <File className="w-4 h-4 mr-2" /> New note
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    setNewFolderParentId(folder.id)
                    setIsDialogOpen(true)
                  }}
                >
                  <FolderIcon className="w-4 h-4 mr-2" /> New folder
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => toggleFavorite(folder.id, 'folder')}
                >
                  <Bookmark className="w-4 h-4 mr-2" />
                  {folder.favorite ? 'Remove from bookmarks' : 'Add to bookmarks'}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => {
                    setFolderToRename(folder)
                    setRenameDialogOpen(true)
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" /> Rename...
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    setFolderToDelete(folder)
                    setDeleteDialogOpen(true)
                  }}
                  disabled={false}
                  className={"text-destructive"}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => moveItem(folder.id, null, 'folder')}
                  disabled={folder.parentId === null}
                >
                  <Layout className="w-4 h-4 mr-2" /> Move to Root
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem>
                  <Search className="w-4 h-4 mr-2" /> Search in folder
                </ContextMenuItem>
              </ContextMenuContent>

              {isExpanded && (
                <div className="relative">
                  {renderFolderTree(folder.id, depth + 1)}

                  {/* Only show notes whose folderId matches this folder */}
                  {childNotes.map((note) => (
                    <ContextMenu key={note.id}>
                      <ContextMenuTrigger>
                        <DraggableItem
                          id={`note-${note.id}`}
                          type="note"
                          name={note.title}
                          depth={depth + 1}
                          isActive={activeNote?.id === note.id}
                          favorite={note.favorite}
                          onClick={() => {
                            setActiveFolder(null);
                            setActiveNote(note);
                          }}
                          isOver={overId === `note-${note.id}`}
                          dragMode={null}
                        />
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56">
                        <ContextMenuItem onClick={() => setActiveNote(note)}>
                          <Edit className="w-4 h-4 mr-2" /> Edit note
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => toggleFavorite(note.id, 'note')}
                        >
                          <Bookmark className="w-4 h-4 mr-2" />
                          {note.favorite ? 'Remove from bookmarks' : 'Add to bookmarks'}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => deleteNote(note.id)} className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => moveItem(note.id, null, 'note')}
                          disabled={note.folderId === null}
                        >
                          <Layout className="w-4 h-4 mr-2" /> Move to Root
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              )}
            </ContextMenu>
          );
        })}
        {/* Then render root-level notes below folders, always visible at root */}
        {rootLevelNotes.map((note) => (
          <ContextMenu key={note.id}>
            <ContextMenuTrigger>
              <DraggableItem
                id={`note-${note.id}`}
                type="note"
                name={note.title}
                depth={0}
                isActive={activeNote?.id === note.id}
                favorite={note.favorite}
                onClick={() => {
                  setActiveFolder(null);
                  setActiveNote(note);
                }}
                isOver={overId === `note-${note.id}`}
                dragMode={null}
              />
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem onClick={() => setActiveNote(note)}>
                <Edit className="w-4 h-4 mr-2" /> Edit note
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => toggleFavorite(note.id, 'note')}
              >
                <Bookmark className="w-4 h-4 mr-2" />
                {note.favorite ? 'Remove from bookmarks' : 'Add to bookmarks'}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => deleteNote(note.id)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => moveItem(note.id, null, 'note')}
                disabled={note.folderId === null}
              >
                <Layout className="w-4 h-4 mr-2" /> Move to Root
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    );
  }

  // When "New Folder" button is clicked, set parent to selected folder if any
  const handleNewFolderButton = () => {
    setNewFolderParentId(activeFolder || "null");
    setIsDialogOpen(true);
  }

  const renderFavoritesContent = () => {
    const favoriteFolders = activeFolders.filter(folder => folder.favorite);
    const favoriteNotes = activeNotes.filter(note => note.favorite);

    return (
      <div className="flex-1 overflow-auto p-1">
        {favoriteFolders.length === 0 && favoriteNotes.length === 0 ? (
          <div className="p-4 text-muted-foreground text-center">No bookmarks yet</div>
        ) : (
          <div>
            {favoriteFolders.map((folder) => (
              <ContextMenu key={folder.id}>
                <ContextMenuTrigger>
                  <div
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent/20 ${activeFolder === folder.id && !activeNote ? 'bg-accent/30' : ''}`}
                    onClick={() => {
                      setActiveNote(null);
                      setActiveFolder(folder.id);
                      handleFolderRowClick(folder.id);
                    }}
                  >
                    <FolderIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{folder.name}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => {
                    setActiveNote(null);
                    setActiveFolder(folder.id);
                    handleFolderRowClick(folder.id);
                  }}>
                    <FolderIcon className="w-4 h-4 mr-2" /> Open folder
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => toggleFavorite(folder.id, 'folder')}>
                    <Bookmark className="w-4 h-4 mr-2" /> Remove from bookmarks
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      setFolderToRename(folder)
                      setRenameDialogOpen(true)
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" /> Rename...
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      setFolderToDelete(folder)
                      setDeleteDialogOpen(true)
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {favoriteNotes.map((note) => (
              <ContextMenu key={note.id}>
                <ContextMenuTrigger>
                  <div
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent/20 ${activeNote?.id === note.id ? 'bg-accent/30' : ''}`}
                    onClick={() => {
                      setActiveFolder(null);
                      setActiveNote(note);
                    }}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{note.title}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => setActiveNote(note)}>
                    <Edit className="w-4 h-4 mr-2" /> Edit note
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => toggleFavorite(note.id, 'note')}>
                    <Bookmark className="w-4 h-4 mr-2" /> Remove from bookmarks
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => deleteNote(note.id)} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderTrashContent = () => {
    return (
      <div className="flex-1 overflow-auto p-1">
        {deletedFolders.length === 0 && deletedNotes.length === 0 ? (
          <div className="p-4 text-muted-foreground text-center">Trash is empty</div>
        ) : (
          <div>
            {deletedFolders.map((folder) => (
              <ContextMenu key={folder.id}>
                <ContextMenuTrigger>
                  <div className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent/20">
                    <FolderIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{folder.name}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => restoreItem(folder.id, 'folder')}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Restore
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => permanentDeleteItem(folder.id, 'folder')}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {deletedNotes.map((note) => (
              <ContextMenu key={note.id}>
                <ContextMenuTrigger>
                  <div className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent/20">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{note.title}</span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => restoreItem(note.id, 'note')}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Restore
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => permanentDeleteItem(note.id, 'note')}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      <div className="flex h-full">
        {/* Left vertical icon bar */}
        <div className="flex flex-col items-center w-12 h-full border-r rounded-r-lg border-border bg-background/80 py-2 justify-between">
          <div>
            {/* Collapse/Expand button */}
            <div
              className={`h-7 w-7 flex items-center justify-center mb-2 rounded-full cursor-pointer hover:bg-accent/20 transition-colors duration-150 text-muted-foreground`}
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </div>
            {/* Semantic Agents button */}
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent/20 text-muted-foreground mt-1"
              title="Semantic Agents"
              aria-label="Semantic Agents"
              type="button"
              style={{ background: 'none', border: 'none', padding: 0 }}
              onClick={onSemanticAgentsClick}
            >
              <Bot className="h-6 w-6 ml-1" />
            </button>
            {/* Home/Dashboard button */}
            {/* <div
              className={`h-7 w-7 flex items-center justify-center mb-2 rounded-full cursor-pointer hover:bg-accent/20 transition-colors duration-150 ${showDashboard ? 'bg-accent/30 text-accent-foreground' : 'text-muted-foreground'}`}
              onClick={onDashboardClick}
                                  title="Sophia"
            >
              <Home className="w-5 h-5 mb-1.5" />
            </div> */}
          </div>
          <div>
            {/* Settings button with hover-revealed extra buttons */}
            <div className="relative">
              {/* Floating menu */}
              {showSettingsMenu && (
                <div
                  ref={menuRef}
                  className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-2 z-50"
                >
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer bg-background hover:bg-accent/20 text-muted-foreground"
                    title="Profile"
                    onClick={() => setShowProfileMenu(true)}
                  >
                    <User className="w-5 h-5" />
                  </button>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer bg-background hover:bg-accent/20 text-muted-foreground"
                    title="Feedback"
                    onClick={() => { /* handle feedback */ }}
                  >
                    <Bookmark className="w-5 h-5" />
                  </button>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer bg-background hover:bg-accent/20 text-muted-foreground"
                    title="Trash"
                    onClick={() => setNavSection('trash')}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
              {/* Settings Button */}
              <div
                ref={settingsBtnRef}
                className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer hover:bg-accent/20 text-muted-foreground mb-2"
                title="Settings"
                onClick={() => setSettingsOpen(true)}
                onMouseEnter={() => setShowSettingsMenu(true)}
              >
                <Settings className="w-5 h-5 mt-5" />
              </div>
            </div>
          </div>
        </div>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          darkMode={darkMode}
          onToggleDarkMode={onToggleDarkMode}
          onImport={onImport}
          onExport={onExport}
        />

        {/* Profile Switcher Modal (placeholder) */}
        {showProfileMenu && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-background rounded-lg shadow-lg p-6 min-w-[300px]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Switch Profile</h2>
                <button onClick={() => setShowProfileMenu(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div>
                {/* Profile list and actions will go here */}
                <div className="text-muted-foreground">Profile switching UI coming soon...</div>
              </div>
            </div>
          </div>
        )}

        {/* Main sidebar */}
        {!collapsed && (
          <ResizableBox
            width={260}
            height={Infinity}
            minConstraints={[200, 0]}
            maxConstraints={[400, 99999]}
            axis="x"
            handle={<span className="w-1 h-full bg-transparent cursor-ew-resize absolute right-0 top-0 z-20" />}
            className="relative h-full modern-sidebar"
          >
            <div className="h-full w-full border-r rounded-lg border-border bg-background flex flex-col shadow-lg transition-all duration-200 overflow-visible">
              {/* Header nav section */}
              <div className="flex items-center justify-between p-2 border-b border-border bg-background/95">
                <div className="flex gap-1">
                  <button
                    className={`px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 ${navSection === 'notes' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/20'}`}
                    onClick={() => setNavSection('notes')}
                  >
                    <FolderIcon className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <button
                    className={`px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 ${navSection === 'search' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/20'}`}
                    onClick={() => setNavSection('search')}
                  >
                    <Search className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <button
                    className={`px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 ${navSection === 'favorites' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/20'}`}
                    onClick={() => setNavSection('favorites')}
                  >
                    <Bookmark className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Action bar - only show for notes section */}
              {navSection === 'notes' && (
                <div className="flex items-center justify-start gap-1 border-b border-border bg-background/95 py-1 pl-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent/20 text-muted-foreground"
                          onClick={createNewNote}
                          title="New note"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>New note</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent/20 text-muted-foreground"
                          onClick={handleNewFolderButton}
                          title="New folder"
                        >
                          <FolderPlus className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>New folder</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent/20 text-muted-foreground"
                          onClick={handleCreateParentFolder}
                          title="New parent folder"
                        >
                          <Layout className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>New parent folder</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              {/* Search bar, only visible when 'search' tab is active */}
              {navSection === 'search' && (
                <div className="flex items-center px-2 py-2 border-b border-border bg-background/95">
                  <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                  <Input
                    placeholder="Search notes and tags..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {/* Main content: notes/folders, search, favorites, or trash */}
              {navSection === 'notes' ? (
                renderFolderTree(null)
              ) : navSection === 'search' ? (
                // Search results list
                activeNotes.length > 0 ? (
                  <div className="flex-1 overflow-auto p-1">
                    {activeNotes.map((note) => (
                      <div
                        key={note.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent/20 ${activeNote?.id === note.id ? 'bg-accent/30' : ''}`}
                        onClick={() => setActiveNote(note)}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate text-sm">{note.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-muted-foreground text-center">No results found.</div>
                )
              ) : navSection === 'favorites' ? (
                renderFavoritesContent()
              ) : (
                renderTrashContent()
              )}

              {/* Footer section */}


              {/* Dialogs and overlays (unchanged) */}
              <div className="p-2 flex items-center justify-between border-b border-border">
                {/* <div
                  className="flex items-center gap-2 px-2 py-1 text-sm font-normal rounded-md cursor-pointer hover:bg-accent/20"
                  onClick={onDashboardClick}
                >
                  <Home className="w-4 h-4" /> Sophia
                </div> */}
              </div>

              {activeNote && (
                <div className="p-2 border-b border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate flex-1">{activeNote.title}</span>
                    <div
                      className="h-6 w-6 flex items-center justify-center cursor-pointer text-muted-foreground hover:bg-accent/20 rounded-sm"
                      onClick={deselectNote}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              )}

              {/* Create Folder Dialog */}
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{newFolderParentId === "null" ? "Create New Parent Folder" : "Create New Folder"}</DialogTitle>
                    {newFolderParentId !== "null" && newFolderParentId !== "root" && (
                      <DialogDescription>
                        Creating folder inside: {folders.find((f) => f.id === newFolderParentId)?.name || ""}
                      </DialogDescription>
                    )}
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <label htmlFor="folderName" className="text-sm font-medium">
                        Folder Name
                      </label>
                      <Input
                        id="folderName"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Enter folder name"
                        autoFocus
                      />
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="folderDescription" className="text-sm font-medium">
                        Description
                      </label>
                      <Input
                        id="folderDescription"
                        value={newFolderDescription}
                        onChange={(e) => setNewFolderDescription(e.target.value)}
                        placeholder="Enter folder description (optional)"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <div
                      className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </div>
                    <div
                      className="inline-flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium cursor-pointer"
                      onClick={handleCreateFolder}
                    >
                      Create
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Rename Folder Dialog */}
              <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Rename Folder</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <label htmlFor="renameFolderName" className="text-sm font-medium">
                        New Folder Name
                      </label>
                      <Input
                        id="renameFolderName"
                        value={newFolderNameForRename}
                        onChange={(e) => setNewFolderNameForRename(e.target.value)}
                        placeholder="Enter new folder name"
                        autoFocus
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <div
                      className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      onClick={() => setRenameDialogOpen(false)}
                    >
                      Cancel
                    </div>
                    <div
                      className="inline-flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium cursor-pointer"
                      onClick={handleRenameFolder}
                    >
                      Rename
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Delete Folder Dialog */}
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Folder</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{folderToDelete?.name}"? This will move all notes in this folder to the
                      parent folder.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <div
                      className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      onClick={() => setDeleteDialogOpen(false)}
                    >
                      Cancel
                    </div>
                    <div
                      className="inline-flex h-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 text-sm font-medium cursor-pointer"
                      onClick={handleDeleteFolder}
                    >
                      Delete
                    </div>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </ResizableBox>
        )}
        <DragOverlay>
          {activeDragId ? (
            <div className="bg-accent/80 p-2 rounded-md shadow-lg border border-border">
              {activeDragId.startsWith('folder-') ? (
                <div className="flex items-center">
                  <FolderIcon className="w-4 h-4 mr-2" />
                  <span>{folders.find(f => f.id === activeDragId.split('-')[1])?.name}</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <File className="w-4 h-4 mr-2" />
                  <span>{notes.find(n => n.id === activeDragId.split('-')[1])?.title}</span>
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  )
}
