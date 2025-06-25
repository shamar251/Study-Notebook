# Block Connection Extension Guide

This guide explains how to extend and update the centralized block connection logic in the Study Notebook application.

## Current Architecture

### Core Files
- `lib/block-connections.ts` - Main connection manager class
- `hooks/use-block-connections.ts` - React hook wrapper
- `hooks/use-block-manager.ts` - Block management with connection integration

### Integration Points
- `components/editor.tsx` - Main editor using centralized logic
- `components/block-editor/block-editor.tsx` - Block editor using centralized logic
- `components/quiz-view.tsx` - Quiz generation using centralized logic
- `components/testview.tsx` - Test generation using centralized logic
- `lib/brain/brain.ts` - AI brain using centralized logic

## How to Add New Connection Logic

### 1. Add New Methods to BlockConnectionManager

```typescript
// In lib/block-connections.ts
export class BlockConnectionManager {
  // ... existing methods ...

  /**
   * New connection logic method
   */
  static newConnectionMethod(block: Block, allBlocks: Block[]): boolean {
    // Your new logic here
    return true
  }

  /**
   * Another new method
   */
  static anotherNewMethod(blocks: Block[]): Block[] {
    // Your logic here
    return blocks.filter(block => /* your condition */)
  }
}
```

### 2. Add to the Hook (if needed for React components)

```typescript
// In hooks/use-block-connections.ts
export function useBlockConnections() {
  // ... existing methods ...

  const newConnectionMethod = useCallback((block: Block, allBlocks: Block[]): boolean => {
    return BlockConnectionManager.newConnectionMethod(block, allBlocks)
  }, [])

  const anotherNewMethod = useCallback((blocks: Block[]): Block[] => {
    return BlockConnectionManager.anotherNewMethod(blocks)
  }, [])

  return {
    // ... existing returns ...
    newConnectionMethod,
    anotherNewMethod,
  }
}
```

### 3. Use in Components

```typescript
// In any component
import { BlockConnectionManager } from "@/lib/block-connections"
// OR
import { useBlockConnections } from "@/hooks/use-block-connections"

function MyComponent() {
  const { newConnectionMethod } = useBlockConnections()
  
  // Use the new logic
  const result = newConnectionMethod(block, allBlocks)
  
  // OR use directly
  const result = BlockConnectionManager.newConnectionMethod(block, allBlocks)
}
```

## Common Extension Patterns

### 1. Adding New Block Types

```typescript
// In lib/block-connections.ts
export class BlockConnectionManager {
  /**
   * Check if a block is a new type
   */
  static isNewBlockType(block: Block, allBlocks: Block[]): boolean {
    if (block.type !== "newType") return false
    
    // Your logic here
    return true
  }

  /**
   * Get connected blocks for new type
   */
  static getConnectedNewTypeBlocks(block: Block, allBlocks: Block[]): Block[] {
    if (block.type !== "newType") return []
    
    // Your connection logic here
    return []
  }
}
```

### 2. Adding New Question Types

```typescript
// In lib/block-connections.ts
export class BlockConnectionManager {
  /**
   * Check if block should generate new question type
   */
  static isNewQuestionTypeBlock(block: Block, allBlocks: Block[]): boolean {
    if (block.type !== "who") return false
    
    // Your logic to determine if this should be a new question type
    return true
  }

  /**
   * Get data needed for new question type
   */
  static getNewQuestionTypeData(block: Block, allBlocks: Block[]): any {
    if (!this.isNewQuestionTypeBlock(block, allBlocks)) return null
    
    // Return data needed for question generation
    return {
      question: block.content,
      data: /* your data */,
      // ... other properties
    }
  }
}
```

### 3. Adding New UI States

```typescript
// In lib/block-connections.ts
export class BlockConnectionManager {
  /**
   * Get extended connection state for new UI features
   */
  static getExtendedConnectionState(block: Block, index: number, allBlocks: Block[]): any {
    const baseState = this.getConnectionState(block, index, allBlocks)
    
    return {
      ...baseState,
      // Add new properties
      newProperty: this.calculateNewProperty(block, allBlocks),
      anotherProperty: this.calculateAnotherProperty(block, allBlocks),
    }
  }

  private static calculateNewProperty(block: Block, allBlocks: Block[]): boolean {
    // Your calculation logic
    return true
  }

  private static calculateAnotherProperty(block: Block, allBlocks: Block[]): string {
    // Your calculation logic
    return "value"
  }
}
```

## Updating Existing Logic

### 1. Modify Core Methods

When updating existing methods, ensure backward compatibility:

```typescript
// In lib/block-connections.ts
export class BlockConnectionManager {
  /**
   * Updated method with new logic
   */
  static isWhoBlockConnected(block: Block, allBlocks: Block[]): boolean {
    // Keep existing logic for backward compatibility
    if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
      return true
    }
    
    // Add new logic
    if (this.hasNewConnectionType(block, allBlocks)) {
      return true
    }
    
    // Keep old structure support
    const idx = allBlocks.findIndex(b => b.id === block.id)
    if (idx !== -1 && idx < allBlocks.length - 1) {
      const nextBlock = allBlocks[idx + 1]
      if (nextBlock.type === "what") {
        return true
      }
    }
    return false
  }

  private static hasNewConnectionType(block: Block, allBlocks: Block[]): boolean {
    // Your new connection type logic
    return false
  }
}
```

### 2. Add New Connection Types

```typescript
// In lib/block-connections.ts
export class BlockConnectionManager {
  /**
   * Support for new connection types
   */
  static getConnectionType(block: Block, allBlocks: Block[]): "who-what" | "sequence" | "true-false" | "new-type" {
    if (this.isSequenceBlock(block, allBlocks)) return "sequence"
    if (this.isTrueFalseBlock(block, allBlocks)) return "true-false"
    if (this.isNewTypeBlock(block, allBlocks)) return "new-type"
    return "who-what"
  }

  static isNewTypeBlock(block: Block, allBlocks: Block[]): boolean {
    // Your new type detection logic
    return false
  }
}
```

## Testing New Logic

### 1. Unit Tests

```typescript
// Create tests for new methods
describe('BlockConnectionManager', () => {
  describe('newConnectionMethod', () => {
    it('should return true for valid new connections', () => {
      const block: Block = { /* test block */ }
      const allBlocks: Block[] = [/* test blocks */]
      
      const result = BlockConnectionManager.newConnectionMethod(block, allBlocks)
      
      expect(result).toBe(true)
    })
  })
})
```

### 2. Integration Tests

```typescript
// Test integration with components
describe('Editor with new connection logic', () => {
  it('should use new connection logic correctly', () => {
    // Test that components use the new logic
    const result = BlockConnectionManager.newConnectionMethod(block, allBlocks)
    // Assert expected behavior
  })
})
```

## Migration Strategy

### 1. Gradual Migration

When adding new connection types, support both old and new:

```typescript
export class BlockConnectionManager {
  static isWhoBlockConnected(block: Block, allBlocks: Block[]): boolean {
    // New logic
    if (this.hasNewConnectionType(block, allBlocks)) {
      return true
    }
    
    // Existing logic (for backward compatibility)
    if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
      return true
    }
    
    // Old structure support
    const idx = allBlocks.findIndex(b => b.id === block.id)
    if (idx !== -1 && idx < allBlocks.length - 1) {
      const nextBlock = allBlocks[idx + 1]
      if (nextBlock.type === "what") {
        return true
      }
    }
    return false
  }
}
```

### 2. Data Migration

```typescript
export class BlockConnectionManager {
  /**
   * Migrate to new connection structure
   */
  static migrateToNewStructure(allBlocks: Block[]): Block[] {
    return allBlocks.map(block => {
      if (this.needsMigration(block)) {
        return this.migrateBlock(block, allBlocks)
      }
      return block
    })
  }

  private static needsMigration(block: Block): boolean {
    // Check if block needs migration
    return false
  }

  private static migrateBlock(block: Block, allBlocks: Block[]): Block {
    // Perform migration
    return block
  }
}
```

## Best Practices

### 1. Always Add JSDoc Comments

```typescript
/**
 * Brief description of what the method does
 * 
 * @param block - The block to check
 * @param allBlocks - All blocks in the note
 * @returns Description of what is returned
 * 
 * @example
 * ```typescript
 * const isConnected = BlockConnectionManager.newMethod(block, allBlocks)
 * ```
 */
static newMethod(block: Block, allBlocks: Block[]): boolean {
  // Implementation
}
```

### 2. Use TypeScript Strictly

```typescript
// Always define return types
static getConnectedBlocks(block: Block, allBlocks: Block[]): Block[] {
  return []
}

// Use proper typing for complex objects
interface ConnectionState {
  isConnected: boolean
  connectionType: string
  metadata?: any
}

static getConnectionState(block: Block, allBlocks: Block[]): ConnectionState {
  return {
    isConnected: true,
    connectionType: "who-what"
  }
}
```

### 3. Handle Edge Cases

```typescript
static safeMethod(block: Block, allBlocks: Block[]): boolean {
  // Always check for null/undefined
  if (!block || !allBlocks) return false
  
  // Check for required properties
  if (!block.id || !block.type) return false
  
  // Handle empty arrays
  if (allBlocks.length === 0) return false
  
  // Your logic here
  return true
}
```

### 4. Performance Considerations

```typescript
// Cache expensive calculations
static getExpensiveCalculation(block: Block, allBlocks: Block[]): any {
  // Use memoization for expensive operations
  const cacheKey = `${block.id}-${allBlocks.length}`
  
  if (this.cache.has(cacheKey)) {
    return this.cache.get(cacheKey)
  }
  
  const result = this.performExpensiveCalculation(block, allBlocks)
  this.cache.set(cacheKey, result)
  
  return result
}

private static cache = new Map<string, any>()
```

## Summary

The centralized block connection system provides a solid foundation for extending connection logic. By following these patterns, you can:

1. **Add new connection types** without breaking existing functionality
2. **Extend question generation** for new quiz/test modes
3. **Add new UI states** for enhanced user experience
4. **Maintain backward compatibility** during migrations
5. **Ensure consistent behavior** across all components

Remember to always test your changes and update the documentation when adding new features. 