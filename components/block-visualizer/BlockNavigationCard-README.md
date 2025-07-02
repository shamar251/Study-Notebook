# Block Navigation Card Component

A comprehensive navigation component for block visualizers that provides search, filtering, and navigation capabilities for both individual blocks and connected groups.

## Features

- **Dual View Modes**: Switch between "Blocks" and "Groups" views
- **Search Functionality**: Search blocks by content, ID, or type
- **Block Type Selection**: Filter by specific block types with count indicators
- **Active Filters**: Multiple filter system with visual indicators
- **Block List**: Scrollable list of blocks with type icons and content preview
- **Group List**: Scrollable list of connected groups with summary information
- **Navigation**: Click any block or group to navigate to its location
- **Responsive Design**: Adapts to different screen sizes
- **Accessibility**: Keyboard navigation and screen reader support

## Usage

### Basic Usage

```tsx
import { BlockNavigationCard } from '@/components/block-visualizer';

<BlockNavigationCard
  blocks={blocks}
  onNavigateToBlock={(block) => {
    // Handle navigation to block
    console.log('Navigate to:', block);
  }}
/>
```

### With Group Navigation

```tsx
import { BlockNavigationCard } from '@/components/block-visualizer';

<BlockNavigationCard
  blocks={blocks}
  onNavigateToBlock={(block) => {
    // Handle navigation to individual block
    console.log('Navigate to block:', block);
  }}
  onNavigateToGroup={(groupBlocks) => {
    // Handle navigation to group
    console.log('Navigate to group:', groupBlocks);
  }}
  className="custom-styles"
/>
```

### Using the Demo Component

```tsx
import { BlockNavigationDemo } from '@/components/block-visualizer';

<BlockNavigationDemo
  blocks={blocks}
  onNavigateToBlock={handleNavigateToBlock}
  onNavigateToGroup={handleNavigateToGroup}
/>
```

## Props

### BlockNavigationCardProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `blocks` | `Block[]` | Yes | Array of blocks to display |
| `onNavigateToBlock` | `(block: Block) => void` | Yes | Callback when a block is clicked |
| `onNavigateToGroup` | `(groupBlocks: Block[]) => void` | No | Callback when a group is clicked |
| `className` | `string` | No | Additional CSS classes |

## Features in Detail

### View Modes
- **Blocks View**: Shows individual blocks with type icons and content
- **Groups View**: Shows connected groups with summary information
- Toggle between views using the view mode buttons
- Groups view only appears when `onNavigateToGroup` prop is provided

### Search
- Searches across block content, ID, and type
- In groups view, searches within all blocks in each group
- Case-insensitive matching
- Real-time filtering as you type
- Placeholder text updates based on current view mode

### Block Type Selection
- Shows all available block types from the provided blocks
- Displays count of each block type
- "All" option to show all blocks/groups
- Visual indicators for selected type
- Count updates based on current view mode

### Active Filters
- Multiple filter system for fine-grained control
- Visual badges showing active filters
- Click to remove individual filters
- "Clear All" button to reset all filters
- Filters work in both blocks and groups views

### Block List (Blocks View)
- Each block shows:
  - Block type icon with color coding
  - Block type label
  - Truncated block ID
  - Content preview (or "Empty block" for empty blocks)
  - Navigation arrow
- Hover effects for better UX
- Scrollable when list is long

### Group List (Groups View)
- Each group shows:
  - Group icon (Users icon)
  - Group number and block count
  - Summary of block types in the group (e.g., "WHO(1), WHAT(1), HOW(2)")
  - Preview of first block's content
  - Navigation arrow
- Groups are visually distinct with blue styling
- Shows connected blocks as a cohesive unit

### Navigation
- Click any block to trigger `onNavigateToBlock` callback
- Click any group to trigger `onNavigateToGroup` callback
- Automatically closes navigation card (if using demo component)
- Maintains focus management

## Group Navigation

Groups are automatically detected using the `getConnectedGroup` function, which finds all blocks that are connected (directly or indirectly) through `linkedBlockIds`. Each group represents a connected entity or concept.

### Group Detection
- Groups are created by traversing block connections
- Each block can only belong to one group
- Groups are determined by the `getConnectedGroup` function from `@/hooks/use-block-connections`

### Group Summary
- Shows the most common block types in the group
- Displays count for each block type
- Limited to top 3 types for readability
- Shows "Mixed" if no clear pattern

## Styling

The component uses Tailwind CSS classes and follows the existing design system:
- Consistent with other visualizer components
- Uses the same color scheme as block types
- Groups have distinct blue styling to differentiate from individual blocks
- Responsive design with proper spacing
- Shadow and border styling for card appearance

## Integration Examples

### In Tree Visualizer
```tsx
import { BlockNavigationCard } from '@/components/block-visualizer';

// Add to your visualizer component
const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

<BlockNavigationCard
  blocks={blocks}
  onNavigateToBlock={(block) => {
    setSelectedBlock(block);
    // Additional navigation logic
  }}
  onNavigateToGroup={(groupBlocks) => {
    // Navigate to first block in group
    setSelectedBlock(groupBlocks[0]);
    // Additional group navigation logic
  }}
/>
```

### In Force Graph Visualizer
```tsx
import { BlockNavigationDemo } from '@/components/block-visualizer';

// Add the demo component to your visualizer
<BlockNavigationDemo
  blocks={blocks}
  onNavigateToBlock={(block) => {
    // Center the graph on the selected block
    centerOnNode(block.id);
  }}
  onNavigateToGroup={(groupBlocks) => {
    // Center the graph on the first block in the group
    centerOnNode(groupBlocks[0].id);
  }}
/>
```

### In D3 Visualizer
```tsx
import { BlockNavigationCard } from '@/components/block-visualizer';

<BlockNavigationCard
  blocks={blocks}
  onNavigateToBlock={(block) => {
    const node = nodesRef.current.find(n => n.id === block.id);
    if (node) {
      setSelectedNode(node);
      // Center view on node
    }
  }}
  onNavigateToGroup={(groupBlocks) => {
    const firstBlock = groupBlocks[0];
    const node = nodesRef.current.find(n => n.id === firstBlock.id);
    if (node) {
      setSelectedNode(node);
      // Center view on first block in group
    }
  }}
/>
```

## Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader friendly
- High contrast support through Tailwind classes
- View mode toggle is accessible

## Performance

- Memoized filtering for large block sets
- Efficient group detection using connected component algorithm
- Efficient rendering with React.memo patterns
- Debounced search (can be added if needed)
- Virtual scrolling support for very large lists (future enhancement)

## Migration Guide

### From Previous Version
If you're upgrading from a previous version that only supported block navigation:

1. **No Breaking Changes**: The existing `onNavigateToBlock` prop still works as before
2. **Optional Group Support**: Add `onNavigateToGroup` prop to enable group navigation
3. **View Mode Toggle**: Groups view only appears when `onNavigateToGroup` is provided
4. **Backward Compatibility**: All existing functionality is preserved 