# MindMap Tab Integration Plan

**For**: 钱七 (MindMap entry binding & integration testing)

---

## 1. API Completeness Check

All three MindMap APIs in `src/lib/api.ts` are complete and correct:

| API | Signature | Status |
|---|---|---|
| `saveMindmap` | `(paperId: number, contentJson: string) => Promise<void>` | OK |
| `getMindmap` | `(paperId: number) => Promise<string>` | OK |
| `generateMindmap` | `(paperId: number) => Promise<string>` | OK |

Corresponding Rust backend commands (`save_mindmap`/`get_mindmap`/`generate_mindmap`) are implemented in `ai_commands.rs`.

---

## 2. Existing Structure Analysis

### ReaderView.tsx Right Panel

- Right panel: 256px wide, contains a `<Tabs>` component
- **Current Tab order**: Annotations → Notes → AI
- AI Tab has nested sub-tabs: Chat / Translate
- Panel collapsible via ChevronRight button

### AppShell.tsx

- Left sidebar: Library / Reader (when paper loaded) / Settings
- Provides `RightPanelContext` (openPanel/closePanel) but ReaderView does not use it
- Right panel "Details" overlay mechanism exists via `openPanel(content)`

### MindMapCanvas.tsx Interface

```tsx
interface MindMapCanvasProps {
  initialNodes?: MindMapNode[]
  initialEdges?: Edge[]
  paperTitle?: string
  onNodesChange?: (nodes: MindMapNode[]) => void
}
```

### Critical Issue: MindMapCanvas vs Store Field Mismatch

- **store** (`mindmap-store.ts`): node data uses `text` field
  ```ts
  data: { text: string; [key: string]: unknown }
  ```
- **MindMapCanvas**: node data uses `label` field in `MindmapNode` component and `createDefaultNodes`
  ```tsx
  // MindmapNode renders: data.label
  // createDefaultNodes returns: data.label
  ```
- **Conclusion**: These two fields are incompatible. Must unify to `data.text` before integration.

---

## 3. Recommended Integration Approach

### Recommended: Add "MindMap" Tab in Right Panel

**Position**: After Annotations / Notes / AI as the 4th Tab Trigger

**Pros**:
- Reuses existing right panel, no layout changes needed
- Consistent with Annotations/Notes/AI pattern
- Automatically follows paperId when switching papers

**Cons**:
- AI Tab already has nested tabs (Chat/Translate) — MindMap Tab wont have sub-tabs, acceptable

### Alternative: Standalone Toolbar Button

Place a "MindMap" icon button in the top toolbar. Clicking switches to full-screen MindMapCanvas view.

**Cons**: Requires routing/view-switching logic, larger change.

---

## 4. Implementation Steps (for 钱七)

### Step 1: Fix MindMapCanvas & store field mismatch

In `src/components/MindMapCanvas.tsx`:
- `MindmapNode` component renders `data.label` → change to `data.text`
- `createDefaultNodes` returns data with `label` field → change to `text`
- Update NodeTypes declarations accordingly

### Step 2: Import in ReaderView.tsx

```tsx
import { MindMapCanvas } from "@/components/MindMapCanvas"
import { useMindMapStore } from "@/lib/stores/mindmap-store"
```

### Step 3: Add MindMap Tab Trigger in TabsList

```tsx
<TabsTrigger value="mindmap" className="text-xs h-6 px-2">MindMap</TabsTrigger>
```

### Step 4: Add TabContent

```tsx
<TabsContent value="mindmap" className="flex-1 overflow-hidden mt-0">
  <MindMapCanvas
    paperTitle={currentPaper.title}
    onNodesChange={(nodes) => {
      useMindMapStore.getState().setNodes(nodes)
    }}
  />
</TabsContent>
```

### Step 5: Load data when MindMap tab activates

Use `useEffect` to call `loadMindmap` when tab switches to "mindmap":


```tsx
const [activeRightTab, setActiveRightTab] = useState("annotations")

// On Tabs: onValueChange={setActiveRightTab}

useEffect(() => {
  if (activeRightTab === "mindmap" && currentPaper) {
    useMindMapStore.getState().loadMindmap(currentPaper.id)
  }
}, [activeRightTab, currentPaper])
```

### Step 6: Auto-generate on first open


When MindMap tab activates and `nodes.length === 0`, automatically call `generateMindmap`:

```tsx
useEffect(() => {
  if (activeRightTab === "mindmap" && currentPaper) {
    const store = useMindMapStore.getState()
    if (store.nodes.length === 0) {
      store.generateMindmap(currentPaper.id)
    } else {
      store.loadMindmap(currentPaper.id)
    }
  }
}, [activeRightTab, currentPaper])
```

### Step 7: Wrap MindMapCanvas to fill container

Add outer wrapper to ensure it fills the TabsContent parent:

```tsx
<div className="w-full h-full flex flex-col">
  <MindMapCanvas ... />
</div>
```


---

## 5. Key Notes

1. **Field mismatch must be fixed first**, otherwise node text will not display correctly
2. **Auto-generation**: When MindMapCanvas opens with empty nodes, should auto-call `generateMindmap`
3. **Export**: MindMapCanvas already has "Export PNG" and "Export Markdown" buttons in toolbar — ensure toolbar is visible in embedded mode
4. **Panel collapse**: MindMapCanvas should render correctly even when right panel is collapsed (already handled with `overflow-hidden`)

---

## 6. File Change Summary

| File | Changes |
|---|---|
| `src/components/MindMapCanvas.tsx` | Fix `data.label` → `data.text` |
| `src/pages/ReaderView.tsx` | Add MindMap Tab + useMindMapStore integration |
