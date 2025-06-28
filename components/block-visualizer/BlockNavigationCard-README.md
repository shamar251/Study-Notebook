# Block Navigation Card Component

A comprehensive navigation component for block visualizers that provides search, filtering, and navigation capabilities.

## Features

- **Search Functionality**: Search blocks by content, ID, or type
- **Block Type Selection**: Filter by specific block types with count indicators
- **Active Filters**: Multiple filter system with visual indicators
- **Block List**: Scrollable list of blocks with type icons and content preview
- **Navigation**: Click any block to navigate to its location
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

### With Close Handler

```tsx
import { BlockNavigationCard } from '@/components/block-visualizer';

<BlockNavigationCard
  blocks={blocks}
  onNavigateToBlock={handleNavigateToBlock}
  onClose={() => setShowNavigation(false)}
  className="custom-styles"
/>
```

### Using the Demo Component

```tsx
import { BlockNavigationDemo } from '@/components/block-visualizer';

<BlockNavigationDemo
  blocks={blocks}
  onNavigateToBlock={handleNavigateToBlock}
/>
```

## Props

### BlockNavigationCardProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `blocks` | `Block[]` | Yes | Array of blocks to display |
| `onNavigateToBlock` | `(block: Block) => void` | Yes | Callback when a block is clicked |
| `onClose` | `() => void` | No | Callback when close button is clicked |
| `className` | `string` | No | Additional CSS classes |

## Features in Detail

### Search
- Searches across block content, ID, and type
- Case-insensitive matching
- Real-time filtering as you type

### Block Type Selection
- Shows all available block types from the provided blocks
- Displays count of each block type
- "All" option to show all blocks
- Visual indicators for selected type

### Active Filters
- Multiple filter system for fine-grained control
- Visual badges showing active filters
- Click to remove individual filters
- "Clear All" button to reset all filters

### Block List
- Each block shows:
  - Block type icon with color coding
  - Block type label
  - Truncated block ID
  - Content preview (or "Empty block" for empty blocks)
  - Navigation arrow
- Hover effects for better UX
- Scrollable when list is long

### Navigation
- Click any block to trigger `onNavigateToBlock` callback
- Automatically closes navigation card (if using demo component)
- Maintains focus management

## Styling

The component uses Tailwind CSS classes and follows the existing design system:
- Consistent with other visualizer components
- Uses the same color scheme as block types
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
/>
```

## Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader friendly
- High contrast support through Tailwind classes

## Performance

- Memoized filtering for large block sets
- Efficient rendering with React.memo patterns
- Debounced search (can be added if needed)
- Virtual scrolling support for very large lists (future enhancement) 