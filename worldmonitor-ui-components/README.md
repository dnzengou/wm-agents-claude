# WorldMonitor UI Components

A production-ready React component library for the WorldMonitor OSINT platform, featuring a Palantir Apollo/Chainalysis-inspired dark mode aesthetic with high information density and analyst-first design principles.

## Design Philosophy

### "Smooth Friction" UI
- **Low Latency**: Every interaction responds in <100ms
- **High Density**: Maximum data per pixel without clutter
- **Progressive Disclosure**: Summary first, detail on demand
- **Motion as Information**: Animations indicate state changes

### Visual Language
- **Dark Mode Primary**: `#0A0B0D` background with cyan (`#00D4FF`) accents
- **Typography**: Inter for UI, JetBrains Mono for data
- **Information Hierarchy**: Clear separation through color, spacing, and weight
- **Accessibility**: WCAG AA compliant with keyboard navigation

## Component Library

### UI Components

#### Button
```tsx
import { Button } from '@/components/ui';

<Button variant="primary" size="md" loading={false}>
  Analyze
</Button>
```

**Variants**: `primary` | `secondary` | `ghost` | `danger`
**Sizes**: `sm` | `md` | `lg`

#### Badge
```tsx
import { Badge } from '@/components/ui';

<Badge variant="critical" dot pulse>
  12 Alerts
</Badge>
```

**Variants**: `critical` | `high` | `medium` | `low` | `info` | `cyan` | `green` | `purple`

#### Card
```tsx
import { Card, CardHeader, CardContent } from '@/components/ui';

<Card hover padding="md">
  <CardHeader title="Threat Analysis" subtitle="Last 24 hours" />
  <CardContent>{/* Content */}</CardContent>
</Card>
```

#### Input
```tsx
import { Input } from '@/components/ui';

<Input 
  label="Search" 
  placeholder="Enter query..."
  leftIcon={<SearchIcon />}
  error={errorMessage}
/>
```

#### Command Palette
```tsx
import { CommandPalette } from '@/components/ui';
import { useCommandPalette } from '@/hooks';

const commands = [
  { id: '1', title: 'Filter: Middle East', category: 'Filters', action: () => {} },
];

const { isOpen, searchQuery, filteredCommands, /* ... */ } = useCommandPalette(commands);

<CommandPalette
  isOpen={isOpen}
  onClose={close}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  commands={filteredCommands}
  selectedIndex={selectedIndex}
  onSelect={select}
  onExecute={execute}
/>
```

### Dashboard Components

#### ActivityFeed
```tsx
import { ActivityFeed } from '@/components/dashboard';

<ActivityFeed
  events={events}
  onEventClick={(event) => console.log(event)}
  maxHeight="400px"
/>
```

#### StatusBar
```tsx
import { StatusBar } from '@/components/dashboard';

<StatusBar
  version="2.6.5"
  isLive={true}
  region="Global"
  lastUpdate={Date.now()}
  alertCount={3}
/>
```

#### AIInsightsPanel
```tsx
import { AIInsightsPanel } from '@/components/dashboard';

<AIInsightsPanel
  insight={{
    id: '1',
    title: 'Threat Pattern Detected',
    conclusion: 'Analysis indicates...',
    overallConfidence: 94,
    category: 'threat',
    generatedAt: Date.now(),
    sources: ['Source 1', 'Source 2'],
    steps: [
      { id: '1', order: 1, description: 'Analyzed events', confidence: 98, status: 'completed' },
    ],
  }}
  onExport={() => {}}
  onShare={() => {}}
  onDeepDive={() => {}}
/>
```

### Map Components

#### LayerControl
```tsx
import { LayerControl } from '@/components/map';

<LayerControl
  layers={layers}
  onToggleLayer={(id) => {}}
  onToggleCategory={(category, enabled) => {}}
/>
```

## Hooks

### useCommandPalette
Manages command palette state, keyboard navigation, and search filtering.

```tsx
const { isOpen, searchQuery, filteredCommands, open, close, toggle } = useCommandPalette(commands);
```

### useWebSocket
Real-time WebSocket connection with auto-reconnect.

```tsx
const { status, data, send, reconnect } = useWebSocket('wss://api.worldmonitor.io/ws');
```

### useDebounce
Debounce values for search inputs.

```tsx
const debouncedSearch = useDebounce(searchQuery, 300);
```

## Utility Functions

```tsx
import { 
  formatRelativeTime, 
  formatNumber, 
  getSeverityColor,
  cn 
} from '@/lib';

formatRelativeTime(Date.now() - 60000); // "1m ago"
formatNumber(1234567); // "1,234,567"
getSeverityColor('critical'); // CSS classes for critical severity
```

## Color System

### Backgrounds
- `--bg-primary`: `#0A0B0D` - Main canvas
- `--bg-secondary`: `#111214` - Panels, cards
- `--bg-tertiary`: `#1A1B1F` - Elevated surfaces
- `--bg-hover`: `#25262C` - Interactive hover

### Accents
- `--accent-cyan`: `#00D4FF` - Primary actions
- `--accent-blue`: `#3B82F6` - Secondary actions
- `--accent-red`: `#EF4444` - Critical alerts
- `--accent-amber`: `#F59E0B` - Warnings
- `--accent-green`: `#10B981` - Success
- `--accent-purple`: `#8B5CF6` - AI content

### Text
- `--text-primary`: `#FFFFFF` - Headlines
- `--text-secondary`: `#9CA3AF` - Body text
- `--text-tertiary`: `#6B7280` - Captions
- `--text-disabled`: `#4B5563` - Disabled

## Typography

| Size | Value | Usage |
|------|-------|-------|
| 2xs | 11px | Labels, timestamps |
| xs | 12px | Secondary info |
| sm | 13px | Body text |
| base | 14px | Emphasized body |
| lg | 16px | Section headers |
| xl | 18px | Panel titles |
| 2xl | 24px | Page titles |

## Installation

```bash
npm install
npm run dev
```

## Project Structure

```
worldmonitor-ui-components/
├── app/              # Next.js app directory
│   ├── page.tsx      # Main dashboard
│   └── layout.tsx    # Root layout
├── components/
│   ├── ui/           # Base UI components
│   ├── dashboard/    # Dashboard-specific components
│   └── map/          # Map-related components
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
├── styles/           # Global styles
└── public/           # Static assets
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Targets

- First Contentful Paint: <1.5s
- Time to Interactive: <3.5s
- Animation frame rate: 60fps
- Input latency: <100ms

## License

MIT © WorldMonitor Engineering
