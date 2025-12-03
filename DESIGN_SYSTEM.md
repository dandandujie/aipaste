# AI Paste Design System (Alpha Arena Retro Style)

## Design Philosophy
Clean, professional, retro financial terminal aesthetic inspired by Bloomberg Terminal and classic stock tickers. White/cream backgrounds with precise 1px borders, monospace typography, and minimal color palette.

## Color Palette

### Background Colors
- `#F8F6F1` - Primary background (warm cream)
- `#FFFEF9` - Card/Panel background (off-white)
- `#FFFFFF` - Content area background (pure white)
- `bg-neutral-50` - Section headers, subtle backgrounds

### Border Colors
- `border-neutral-400` - Primary borders (cards, panels)
- `border-neutral-300` - Secondary borders (inner elements)
- `border-neutral-200` - Subtle dividers
- `border-amber-400` - Selected/Active state
- `border-neutral-500` - Hover state

### Text Colors
- `text-neutral-800` - Primary text
- `text-neutral-700` - Body text
- `text-neutral-600` - Secondary text
- `text-neutral-500` - Muted text, labels
- `text-neutral-400` - Placeholder text
- `text-green-700` - Success status
- `text-red-600` - Error status

### Status Indicators
- `bg-green-500` - Active/On state
- `bg-neutral-400` - Inactive/Off state
- `bg-green-100 text-green-800 border-green-300` - Success badge
- `bg-amber-50 border-amber-400` - Selected item

## Typography

### Fonts
- Primary: `font-mono` (monospace for data, code, status)
- Branding: `font-serif` (for "AI PASTE" logo)

### Sizes & Styles
- Logo: `text-base font-serif font-bold tracking-tight`
- Section title: `text-[10px] uppercase tracking-wider font-bold`
- Body: `text-xs`
- Small/Labels: `text-[10px] uppercase`
- Data: `text-xs font-mono`

### Text Transform
- Labels and headers: `uppercase tracking-wider`
- Status messages: `UPPERCASE` (in code)

## Spacing & Layout

### Border Style
- All borders: 1px solid (no rounded corners for retro feel)
- Cards/Panels: `border border-neutral-400`
- Inner elements: `border border-neutral-300`
- Dashed borders: `border-2 border-dashed border-neutral-300`

### Padding
- Card padding: `p-5`
- Section header: `px-4 py-2`
- Button padding: `px-3 py-1.5` or `p-3`
- Input padding: `px-2 py-1.5`

## Components

### Top Navigation Bar
```html
<header class="h-12 border-b border-neutral-400 flex items-center justify-between px-4 bg-[#FFFEF9]">
  <h1 class="font-serif font-bold text-base tracking-tight">AI PASTE</h1>
</header>
```

### Navigation Tab
```html
<button class="px-3 py-1.5 text-xs uppercase tracking-wider border {active ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-transparent text-neutral-600 border-neutral-300 hover:border-neutral-500'}">
  Tab Name
</button>
```

### Card/Section
```html
<section class="bg-[#FFFEF9] border border-neutral-400 p-5">
  <div class="flex items-center gap-2 mb-4 pb-2 border-b border-neutral-300">
    <span class="text-[10px] uppercase tracking-wider font-bold">Section Title</span>
  </div>
  <!-- content -->
</section>
```

### Section with Header Bar
```html
<section class="bg-[#FFFEF9] border border-neutral-400">
  <div class="px-4 py-2 border-b border-neutral-300 bg-neutral-50">
    <span class="text-[10px] uppercase tracking-wider font-bold">Section Title</span>
  </div>
  <div class="p-4">
    <!-- content -->
  </div>
</section>
```

### Button - Primary
```html
<button class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs uppercase tracking-wider">
  Action
</button>
```

### Button - Secondary
```html
<button class="px-3 py-1.5 bg-white text-neutral-700 text-xs border border-neutral-400 hover:bg-neutral-100 uppercase tracking-wider">
  Action
</button>
```

### Action Button (List Item)
```html
<button class="w-full flex items-center justify-between p-3 border border-neutral-300 hover:bg-neutral-50 hover:border-neutral-500 transition-colors">
  <span class="text-xs uppercase tracking-wider">Action Name</span>
  <kbd class="text-[10px] bg-neutral-100 px-2 py-0.5 border border-neutral-300">⌘M</kbd>
</button>
```

### Input
```html
<input class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-xs" />
```

### Select
```html
<select class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-xs">
```

### Toggle Switch
```html
<button class="w-10 h-5 border border-neutral-400 transition-colors relative {active ? 'bg-green-600 border-green-600' : 'bg-neutral-200'}">
  <div class="w-4 h-4 bg-white border border-neutral-300 absolute top-0 transition-transform {active ? 'left-5' : 'left-0'}"></div>
</button>
```

### Status Badge
```html
<span class="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 border border-green-300 uppercase">Default</span>
```

### Keyboard Shortcut
```html
<kbd class="bg-neutral-100 px-2 py-0.5 border border-neutral-300 text-[10px]">⌘+Shift+M</kbd>
```

### Radio Selection Item
```html
<label class="flex items-center gap-3 p-3 cursor-pointer border border-neutral-300 mb-2 hover:bg-neutral-50 {selected ? 'bg-amber-50 border-amber-400' : ''}">
  <input type="radio" class="accent-neutral-800" />
  <div class="flex-1">
    <div class="font-medium text-sm">Item Name</div>
    <div class="text-[10px] text-neutral-500 uppercase">Description</div>
  </div>
</label>
```

### Status Indicator
```html
<div class="text-xs font-mono bg-neutral-100 px-2 py-1 border border-neutral-300 {error ? 'text-red-600' : success ? 'text-green-700' : 'text-neutral-700'}">
  STATUS TEXT
</div>
```

## Effects

### Scrollbar (Retro Style)
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #F8F6F1; }
::-webkit-scrollbar-thumb { background: #d4d4d4; border: 1px solid #a3a3a3; }
::-webkit-scrollbar-thumb:hover { background: #a3a3a3; }
```

### Progress Animation
```css
@keyframes progress {
  0% { width: 0%; margin-left: 0; }
  50% { width: 50%; margin-left: 25%; }
  100% { width: 0%; margin-left: 100%; }
}
.animate-progress {
  animation: progress 1.5s infinite ease-in-out;
}
```

## Layout Structure

### Main App Layout
```
┌─────────────────────────────────────────────────┐
│ [AI PASTE]  [Dashboard] [Settings]    Status: X │  <- Top Nav (h-12)
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────┐  ┌─────────────────┐  │
│  │ CAPTURE AREA        │  │ QUICK ACTIONS   │  │
│  │                     │  ├─────────────────┤  │
│  │                     │  │ CLIPBOARD INFO  │  │
│  ├─────────────────────┤  ├─────────────────┤  │
│  │ RECOGNITION RESULT  │  │ SHORTCUTS       │  │
│  │                     │  │                 │  │
│  └─────────────────────┘  └─────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Grid Layout
- Main content: `xl:col-span-8`
- Sidebar: `xl:col-span-4`
- Gap: `gap-5`

## Icons
- Minimal use of icons
- Prefer text labels with uppercase styling
- Status indicators: simple squares (`w-2 h-2`)
