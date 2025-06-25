# Block Connection Manager

This module centralizes all block connection logic for the Study Notebook application. It handles relationships between WHO and WHAT blocks, sequential connections, and provides utilities for quiz/test mode generation.

## Overview

The `BlockConnectionManager` class provides a single source of truth for all block connection operations, replacing scattered logic across multiple components.

## Key Features

### Connection Types

1. **WHO-WHAT Connections**: Basic connections between WHO and WHAT blocks
2. **Sequential WHAT Connections**: Chains of WHAT blocks for sequence mode questions
3. **True/False Connections**: WHO blocks connected to WHAT blocks with truthState
4. **Multiple Choice Connections**: Regular WHO-WHAT pairs for MCQ questions

### Core Methods

#### Connection Detection
- `isWhoBlockConnected()`: Check if a WHO block has connected WHAT blocks
- `countConnectedWhatBlocks()`: Count all connected WHAT blocks (recursive)
- `getAllLinkedWhatBlocks()`: Get all WHAT blocks in sequence order
- `findWhatBlock()`: Find the first WHAT block connected to a WHO block

#### Question Type Detection
- `isSequenceBlock()`: Check if block should generate sequence questions
- `isTrueFalseBlock()`: Check if block should generate true/false questions
- `isMultipleChoiceBlock()`: Check if block should generate MCQ questions

#### UI Support
- `getConnectionState()`: Get connection state for UI rendering
- `getBlockClasses()`: Get CSS classes based on connection state
- `getUnlinkedWhoBlocks()`: Find WHO blocks without connections

#### Data Management
- `validateConnections()`: Validate data integrity
- `migrateOldConnections()`: Migrate old connection structure
- `getAvailableOptionBlocks()`: Get blocks available for MCQ options

## Usage

### In Components

```typescript
import { BlockConnectionManager } from "@/lib/block-connections"

// Check if a WHO block is connected
const isConnected = BlockConnectionManager.isWhoBlockConnected(whoBlock, allBlocks)

// Get all linked WHAT blocks for sequence mode
const whatBlocks = BlockConnectionManager.getAllLinkedWhatBlocks(whoBlock, allBlocks)

// Get connection state for UI
const connectionState = BlockConnectionManager.getConnectionState(block, index, allBlocks)
const blockClasses = BlockConnectionManager.getBlockClasses(block, connectionState)
```

### Using the Hook

```typescript
import { useBlockConnections } from "@/hooks/use-block-connections"

function MyComponent() {
  const {
    isWhoBlockConnected,
    getAllLinkedWhatBlocks,
    getConnectionState,
    getBlockClasses
  } = useBlockConnections()

  // Use the connection logic
  const isConnected = isWhoBlockConnected(block, allBlocks)
}
```

## Migration from Old Logic

The manager supports both new (`linkedBlockIds`) and old (adjacent blocks) connection structures. Use `migrateOldConnections()` to convert old data:

```typescript
const migratedBlocks = BlockConnectionManager.migrateOldConnections(blocks)
```

## Quiz/Test Mode Integration

The manager provides methods specifically for quiz and test mode generation:

```typescript
// Check if block should generate sequence questions
if (BlockConnectionManager.isSequenceBlock(whoBlock, allBlocks)) {
  const whatBlocks = BlockConnectionManager.getAllLinkedWhatBlocks(whoBlock, allBlocks)
  // Generate sequence question
}

// Check if block should generate true/false questions
if (BlockConnectionManager.isTrueFalseBlock(whoBlock, allBlocks)) {
  // Generate true/false question
}

// Get available options for MCQ questions
const options = BlockConnectionManager.getAvailableOptionBlocks(allBlocks, "what", excludeId)
```

## Benefits

1. **Centralized Logic**: All connection logic in one place
2. **Consistency**: Same logic used across all components
3. **Maintainability**: Easy to update and debug connection logic
4. **Type Safety**: Full TypeScript support
5. **Performance**: Optimized algorithms for connection traversal
6. **Validation**: Built-in data integrity checks

## Implementation Status

The centralized connection system has been implemented across:

- ✅ `lib/block-connections.ts` - Core connection manager
- ✅ `hooks/use-block-connections.ts` - React hook wrapper
- ✅ `hooks/use-block-manager.ts` - Updated to use centralized logic
- ✅ `components/editor.tsx` - Updated to use centralized logic
- ✅ `components/block-editor/block-editor.tsx` - Updated to use centralized logic
- ✅ `components/quiz-view.tsx` - Updated to use centralized logic
- ✅ `components/testview.tsx` - Updated to use centralized logic
- ✅ `lib/brain/brain.ts` - Updated to use centralized logic

## Future Enhancements

- Support for more complex connection types
- Connection visualization utilities
- Connection analytics and metrics
- Advanced validation rules
- Connection-based search and filtering 