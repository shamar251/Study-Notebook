import type { Block } from "./db"

/**
 * Centralized block connection logic for managing relationships between blocks
 * Handles WHO-WHAT connections, sequential WHAT connections, and connection validation
 */
export class BlockConnectionManager {
  // Web Worker for heavy calculations
  private static worker: Worker | null = null;
  private static workerReady = false;

  /**
   * Initialize web worker for heavy calculations
   */
  private static initWorker() {
    if (typeof window === 'undefined' || this.worker) return;

    try {
      // Create worker with heavy calculation logic
      const workerCode = `
        self.onmessage = function(e) {
          const { type, data } = e.data;
          
          switch (type) {
            case 'computeGroups':
              const { blocks } = data;
              const groups = computeGroups(blocks);
              self.postMessage({ type: 'groupsResult', data: groups });
              break;
            case 'validateConnections':
              const { blocks: blocksToValidate } = data;
              const validation = validateConnections(blocksToValidate);
              self.postMessage({ type: 'validationResult', data: validation });
              break;
          }
        };

        function computeGroups(blocks) {
          const groupMap = {};
          const visited = new Set();

          function traverseAndMark(startBlock, groupId) {
            const stack = [startBlock];
            while (stack.length > 0) {
              const block = stack.pop();
              if (visited.has(block.id)) continue;
              visited.add(block.id);
              groupMap[block.id] = groupId;

              (block.linkedBlockIds || []).forEach(id => {
                const next = blocks.find(x => x.id === id);
                if (next && !visited.has(next.id)) {
                  stack.push(next);
                }
              });

              blocks.forEach(x => {
                if (x.linkedBlockIds && x.linkedBlockIds.includes(block.id) && !visited.has(x.id)) {
                  stack.push(x);
                }
              });
            }
          }

          blocks.forEach(block => {
            if (visited.has(block.id)) return;
            traverseAndMark(block, block.id);
          });

          return groupMap;
        }

        function validateConnections(blocks) {
          const errors = [];
          const visited = new Set();

          function hasCircularReference(block) {
            if (visited.has(block.id)) return true;
            visited.add(block.id);

            if (block.linkedBlockIds) {
              for (const linkedId of block.linkedBlockIds) {
                const linkedBlock = blocks.find(b => b.id === linkedId);
                if (linkedBlock && hasCircularReference(linkedBlock)) {
                  return true;
                }
              }
            }
            return false;
          }

          for (const block of blocks) {
            if (block.linkedBlockIds) {
              for (const linkedId of block.linkedBlockIds) {
                const linkedBlock = blocks.find(b => b.id === linkedId);
                if (!linkedBlock) {
                  errors.push(\`Block \${block.id} links to non-existent block \${linkedId}\`);
                }
              }

              visited.clear();
              if (hasCircularReference(block)) {
                errors.push(\`Circular reference detected in block \${block.id}\`);
              }
            }
          }

          return { isValid: errors.length === 0, errors };
        }
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.workerReady = true;
    } catch (error) {
      console.warn('Web Worker not available, falling back to main thread:', error);
      this.workerReady = false;
    }
  }

  /**
   * Compute groups using web worker if available, fallback to main thread
   */
  static async computeGroupsAsync(blocks: Block[]): Promise<Record<string, string>> {
    if (!this.workerReady) {
      this.initWorker();
    }

    if (!this.worker || !this.workerReady) {
      // Fallback to main thread
      return this.computeGroupsSync(blocks);
    }

    return new Promise((resolve) => {
      const messageHandler = (e: MessageEvent) => {
        if (e.data.type === 'groupsResult') {
          this.worker?.removeEventListener('message', messageHandler);
          resolve(e.data.data);
        }
      };

      this.worker?.addEventListener('message', messageHandler);
      this.worker?.postMessage({ type: 'computeGroups', data: { blocks } });
    });
  }

  /**
   * Synchronous group computation (fallback)
   */
  private static computeGroupsSync(blocks: Block[]): Record<string, string> {
    const groupMap: Record<string, string> = {};
    const visited = new Set<string>();

    const traverseAndMark = (startBlock: Block, groupId: string) => {
      const stack: Block[] = [startBlock];

      while (stack.length > 0) {
        const block = stack.pop()!;
        if (visited.has(block.id)) continue;

        visited.add(block.id);
        groupMap[block.id] = groupId;

        (block.linkedBlockIds || []).forEach(id => {
          const next = blocks.find(x => x.id === id);
          if (next && !visited.has(next.id)) {
            stack.push(next);
          }
        });

        blocks.forEach(x => {
          if (x.linkedBlockIds?.includes(block.id) && !visited.has(x.id)) {
            stack.push(x);
          }
        });
      }
    };

    blocks.forEach(block => {
      if (visited.has(block.id)) return;
      traverseAndMark(block, block.id);
    });

    return groupMap;
  }

  /**
   * Check if a WHO block is connected to any WHAT blocks
   * Supports both new (linkedBlockIds) and old (adjacent) connection structures
   */
  static isWhoBlockConnected(block: Block, allBlocks: Block[]): boolean {
    // New structure: linkedBlockIds
    if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
      return true
    }

    // Old structure: next block is WHAT
    const idx = allBlocks.findIndex(b => b.id === block.id)
    if (idx !== -1 && idx < allBlocks.length - 1) {
      const nextBlock = allBlocks[idx + 1]
      if (nextBlock.type === "what") {
        return true
      }
    }
    return false
  }

  /**
   * Count all connected WHAT blocks for a given block (recursive)
   * Handles chain connections where WHAT blocks link to other WHAT blocks
   */
  static countConnectedWhatBlocks(block: Block, allBlocks: Block[], visited = new Set<string>()): number {
    if (!block.linkedBlockIds || block.linkedBlockIds.length === 0) {
      return 0
    }

    let count = 0
    for (const id of block.linkedBlockIds) {
      if (visited.has(id)) continue
      visited.add(id)
      const linked = allBlocks.find(b => b.id === id && b.type === "what")
      if (linked) {
        count += 1 + this.countConnectedWhatBlocks(linked, allBlocks, visited)
      }
    }
    return count
  }

  /**
   * Get all linked HOW blocks in sequence order for a WHO block
   * Used for sequence questions in quiz/test modes
   */
  static getAllLinkedHowBlocks(whoBlock: Block, allBlocks: Block[]): Block[] {
    const result: Block[] = []
    let currentIds = whoBlock.linkedBlockIds ? [...whoBlock.linkedBlockIds] : []

    while (currentIds.length > 0) {
      const nextId = currentIds[0]
      const nextBlock = allBlocks.find(b => b.id === nextId && b.type === "how")
      if (!nextBlock) break

      result.push(nextBlock)
      currentIds = nextBlock.linkedBlockIds ? [...nextBlock.linkedBlockIds] : []
    }

    return result
  }

  /**
   * Get all linked WHAT blocks in sequence order for a WHO block
   * Used for sequence mode questions in quiz/test modes
   */
  static getAllLinkedWhatBlocks(whoBlock: Block, allBlocks: Block[]): Block[] {
    const result: Block[] = []
    let currentIds = whoBlock.linkedBlockIds ? [...whoBlock.linkedBlockIds] : []

    while (currentIds.length > 0) {
      const nextId = currentIds[0]
      const nextBlock = allBlocks.find(b => b.id === nextId && b.type === "what")
      if (!nextBlock) break

      result.push(nextBlock)
      currentIds = nextBlock.linkedBlockIds ? [...nextBlock.linkedBlockIds] : []
    }

    return result
  }

  /**
   * Find the first WHAT block connected to a WHO block
   * Supports both new and old connection structures
   */
  static findWhatBlock(whoBlock: Block, allBlocks: Block[]): Block | undefined {
    // New structure: linkedBlockIds
    if (Array.isArray(whoBlock.linkedBlockIds) && whoBlock.linkedBlockIds.length === 1) {
      return allBlocks.find(b => b.id === whoBlock.linkedBlockIds![0] && b.type === "what")
    }

    // Old structure: adjacent WHAT block
    const blockIndex = allBlocks.findIndex(b => b.id === whoBlock.id)
    if (blockIndex !== -1 && blockIndex < allBlocks.length - 1) {
      const nextBlock = allBlocks[blockIndex + 1]
      return nextBlock.type === "what" ? nextBlock : undefined
    }

    return undefined
  }

  /**
   * Check if a block is part of a sequence (2+ connected HOW blocks)
   */
  static isSequenceBlock(block: Block, allBlocks: Block[]): boolean {
    if (block.type !== "who") return false;
    // Use robust group traversal (forward and backward)
    const visited = new Set<string>();
    function traverse(b: Block) {
      if (!b || visited.has(b.id)) return;
      visited.add(b.id);
      // Forward
      (b.linkedBlockIds || []).forEach(id => {
        const next = allBlocks.find(x => x.id === id);
        if (next) traverse(next);
      });
      // Backward
      allBlocks.forEach(x => {
        if (x.linkedBlockIds?.includes(b.id)) traverse(x);
      });
    }
    traverse(block);
    // Count HOWs in the group (excluding the WHO itself)
    const howCount = Array.from(visited)
      .map(id => allBlocks.find(b => b.id === id))
      .filter(b => b && b.type === "how").length;
    return howCount >= 2;
  }

  /**
   * Check if a block should start a sequence
   */
  static isSequenceStartBlock(block: Block, allBlocks: Block[]): boolean {
    if (block.type !== "who") return false

    // If has multiple HOW blocks, it's a sequence start
    if (this.isSequenceBlock(block, allBlocks)) {
      return true
    }

    return false
  }

  /**
   * Get sequence blocks for a given WHO block
   */
  static getSequenceBlocks(whoBlock: Block, allBlocks: Block[]): Block[] {
    if (!this.isSequenceBlock(whoBlock, allBlocks)) return []

    return this.getAllLinkedHowBlocks(whoBlock, allBlocks)
  }

  /**
   * Check if a block can participate in sequence mode
   */
  static canParticipateInSequence(block: Block): boolean {
    // Only WHO blocks can participate in sequence mode
    return block.type === "who"
  }

  /**
   * Get sequence mode status for a block
   */
  static getSequenceModeStatus(block: Block, allBlocks: Block[]): {
    mode: "enabled" | "disabled" | "auto";
    isSequence: boolean;
    howBlockCount: number;
    canEnable: boolean;
  } {
    const howBlocks = this.getAllLinkedHowBlocks(block, allBlocks)
    const isSequence = this.isSequenceBlock(block, allBlocks)

    return {
      mode: "auto", // No longer configurable
      isSequence,
      howBlockCount: howBlocks.length,
      canEnable: howBlocks.length >= 2
    }
  }

  /**
   * Check if a block is a true/false block (1 WHAT block with truthState)
   */
  static isTrueFalseBlock(block: Block, allBlocks: Block[]): boolean {
    if (block.type !== "who") return false

    const whatBlock = this.findWhatBlock(block, allBlocks)
    return whatBlock ? !!(whatBlock as any).truthState : false
  }

  /**
   * Check if a block is a regular MCQ block (1 WHAT block without truthState)
   */
  static isMultipleChoiceBlock(block: Block, allBlocks: Block[]): boolean {
    if (block.type !== "who") return false

    const whatBlock = this.findWhatBlock(block, allBlocks)
    if (!whatBlock) return false

    // Not a sequence block and not a true/false block
    return !this.isSequenceBlock(block, allBlocks) && !this.isTrueFalseBlock(block, allBlocks)
  }

  /**
   * Get connection state for UI rendering
   * Returns connection information for styling and layout
   */
  static getConnectionState(block: Block, index: number, allBlocks: Block[]) {
    let isConnected = false
    let whoConnectedToPrev = false
    let whoConnectedToNext = false

    if ((block.type === "what" || block.type === "how") && index > 0) {
      const prevBlock = allBlocks[index - 1]
      if ((prevBlock.type === "who" || prevBlock.type === "what" || prevBlock.type === "how") &&
        prevBlock.linkedBlockIds?.includes(block.id)) {
        isConnected = true
      }
    }

    if (block.type === "who" && index > 0) {
      const prevBlock = allBlocks[index - 1]
      if ((prevBlock.type === "what" || prevBlock.type === "how") && prevBlock.linkedBlockIds?.includes(block.id)) {
        whoConnectedToPrev = true
      }
    }

    if (block.type === "who" && index < allBlocks.length - 1) {
      const nextBlock = allBlocks[index + 1]
      if ((nextBlock.type === "what" || nextBlock.type === "how") && block.linkedBlockIds?.includes(nextBlock.id)) {
        whoConnectedToNext = true
      }
    }

    return {
      isConnected,
      whoConnectedToPrev,
      whoConnectedToNext
    }
  }

  /**
   * Get CSS classes for block styling based on connection state and stickiness
   */
  static getBlockClasses(block: Block, connectionState: ReturnType<typeof BlockConnectionManager.getConnectionState>, shouldStick?: boolean): string {
    if (shouldStick) return "m-0 p-0";
    const { whoConnectedToPrev, whoConnectedToNext, isConnected } = connectionState;
    if (block.type === "who") {
      if (whoConnectedToPrev) {
        return whoConnectedToNext ? "mt-0 mb-0" : "mt-0 mb-4";
      }
      return "mt-4 mb-4";
    }
    return "mt-4 mb-4";
  }

  /**
   * Get unlinked WHO blocks (blocks without connected WHAT blocks)
   * Used for showing warnings in the editor
   */
  static getUnlinkedWhoBlocks(allBlocks: Block[]): Block[] {
    return allBlocks.filter((block) =>
      block.type === "who" && !this.isWhoBlockConnected(block, allBlocks)
    )
  }

  /**
   * Validate block connections for data integrity
   */
  static validateConnections(allBlocks: Block[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const block of allBlocks) {
      if (block.linkedBlockIds) {
        // Check if linked blocks exist
        for (const linkedId of block.linkedBlockIds) {
          const linkedBlock = allBlocks.find(b => b.id === linkedId)
          if (!linkedBlock) {
            errors.push(`Block ${block.id} links to non-existent block ${linkedId}`)
          }
        }

        // Check for circular references
        const visited = new Set<string>()
        if (this.hasCircularReference(block, allBlocks, visited)) {
          errors.push(`Circular reference detected in block ${block.id}`)
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Check for circular references in block connections
   */
  private static hasCircularReference(block: Block, allBlocks: Block[], visited: Set<string>): boolean {
    if (visited.has(block.id)) return true
    visited.add(block.id)

    if (block.linkedBlockIds) {
      for (const linkedId of block.linkedBlockIds) {
        const linkedBlock = allBlocks.find(b => b.id === linkedId)
        if (linkedBlock && this.hasCircularReference(linkedBlock, allBlocks, visited)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Migrate old connection structure to new linkedBlockIds structure
   */
  static migrateOldConnections(allBlocks: Block[]): Block[] {
    return allBlocks.map((block, index) => {
      if (block.type === "who" && (!block.linkedBlockIds || block.linkedBlockIds.length === 0)) {
        // Check if next block is a WHAT block (old structure)
        if (index < allBlocks.length - 1) {
          const nextBlock = allBlocks[index + 1]
          if (nextBlock.type === "what") {
            return {
              ...block,
              linkedBlockIds: [nextBlock.id]
            }
          }
        }
      }
      return block
    })
  }

  /**
   * Get all blocks that can be used as options for multiple choice questions
   * Updated to respect sequence mode settings
   */
  static getAvailableOptionBlocks(allBlocks: Block[], blockType: "who" | "what", excludeBlockId?: string): Block[] {
    return allBlocks.filter((block) => {
      if (block.type !== blockType) return false
      if (block.id === excludeBlockId) return false

      // Exclude WHAT blocks with truthState (used for true/false)
      if (blockType === "what" && (block as any).truthState) return false

      // Exclude WHAT blocks that are part of sequences (only if sequence mode is enabled)
      if (blockType === "what" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
        // Check if the connected WHO block has sequence mode enabled
        const connectedWhoBlock = allBlocks.find(b =>
          b.type === "who" && b.linkedBlockIds?.includes(block.id)
        )
        if (connectedWhoBlock && this.isSequenceBlock(connectedWhoBlock, allBlocks)) {
          return false
        }
      }

      // Exclude WHO blocks linked to true/false WHAT blocks
      if (blockType === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
        const whatBlock = allBlocks.find(b => b.id === block.linkedBlockIds![0] && b.type === "what")
        if (whatBlock && (whatBlock as any).truthState) return false
      }

      // Exclude WHO blocks that are sequence-based (only if sequence mode is enabled)
      if (blockType === "who" && this.isSequenceBlock(block, allBlocks)) return false

      return true
    })
  }

  /**
   * Migrate legacy WHO blocks to have linkedBlockIds for WHAT blocks
   * - If a WHO block has no linkedBlockIds, find adjacent or group-based WHAT blocks and set linkedBlockIds
   */
  static migrateLegacyWhoWhatLinks(allBlocks: Block[]): Block[] {
    return allBlocks.map((block, idx, arr) => {
      if (block.type === "who" && (!block.linkedBlockIds || block.linkedBlockIds.length === 0)) {
        // Try to find adjacent WHAT block
        let linkedWhatIds: string[] = [];
        if (idx < arr.length - 1) {
          const nextBlock = arr[idx + 1];
          if (nextBlock.type === "what") {
            linkedWhatIds.push(nextBlock.id);
          }
        }
        // If no adjacent, try group-based
        if (linkedWhatIds.length === 0) {
          // Use getConnectedGroup to find WHAT blocks in the same group
          // (import getConnectedGroup from hooks)
          // To avoid circular import, inline the logic here:
          const visited = new Set<string>();
          function traverse(b: Block) {
            if (!b || visited.has(b.id)) return;
            visited.add(b.id);
            (b.linkedBlockIds || []).forEach(id => {
              const next = arr.find(x => x.id === id);
              if (next) traverse(next);
            });
            arr.forEach(x => {
              if (x.linkedBlockIds?.includes(b.id)) traverse(x);
            });
          }
          traverse(block);
          const groupBlocks = arr.filter(b => visited.has(b.id));
          linkedWhatIds = groupBlocks.filter(b => b.type === "what" && b.content && b.content.trim() !== "").map(b => b.id);
        }
        if (linkedWhatIds.length > 0) {
          return { ...block, linkedBlockIds: linkedWhatIds };
        }
      }
      return block;
    });
  }

  /**
   * Automatically fix and group legacy WHO/WHAT blocks:
   * For each WHO block with no linkedBlockIds, link it to all immediately adjacent WHAT blocks (until next WHO or end of note).
   * This is idempotent and can be called on every note load or edit.
   */
  static autoFixLegacyWhoWhatLinks(allBlocks: Block[]): Block[] {
    const fixedBlocks = [...allBlocks];
    for (let i = 0; i < fixedBlocks.length; i++) {
      const block = fixedBlocks[i];
      if (block.type === "who" && (!block.linkedBlockIds || block.linkedBlockIds.length === 0)) {
        const linkedWhatIds: string[] = [];
        let j = i + 1;
        while (j < fixedBlocks.length && fixedBlocks[j].type === "what") {
          linkedWhatIds.push(fixedBlocks[j].id);
          j++;
        }
        if (linkedWhatIds.length > 0) {
          fixedBlocks[i] = { ...block, linkedBlockIds: linkedWhatIds };
        }
      }
    }
    return fixedBlocks;
  }
} 