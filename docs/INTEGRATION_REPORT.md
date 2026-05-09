# 集成验证报告

**子任务**: 三栏布局集成验证与 MindMapCanvas paperId 绑定修复
**验证人**: saman
**日期**: 2026/04/29

---

## 一、MindMapCanvas paperId 绑定问题

### 问题描述
ReaderView.tsx 中 `<MindMapCanvas />` 未传入 `paperId` prop。

### 影响
MindMapCanvas 内部 useEffect 依赖 `paperId` 加载/保存导图。`paperId` 为 `undefined` 时：
- 打开 MindMap Tab 无法从后端加载已有导图
- 编辑后无法自动保存（`doSave` 条件 `paperId == null` 返回）

### 修复
```tsx
<MindMapCanvas paperId={currentPaper.id} />
```

---


## 二、三栏布局数据流验证

### 架构
```
leftCollapsed  |  center (PdfViewer + HighlightPopup)  |  rightCollapsed (Tabs)
               |                                    |
  - Paper Info |  - PdfViewer (paperId, filePath)    |  Tabs:
  - Outline    |  - HighlightPopup (annotation)       |    annotations → AnnotationSidebar
                |                                    |    notes → NoteEditor
                |                                    |    ai → (chat | translate)
                |                                    |    mindmap → MindMapCanvas
```

### 数据流完整性

| 组件 | props 注入 | 数据流状态 |
|------|-----------|----------|
| PdfViewer | `paperId`, `filePath` | ✅ 完整 |
| HighlightPopup | 从 pdf-viewer-store 读取 currentPage | ✅ 完整 |
| AnnotationSidebar | 从 annotation-store 读取 annotations | ✅ 完整 |
| NoteEditor | `paperId` | ✅ 完整 |
| AiChatPanel | `paperId` | ✅ 完整 |
| TranslationPanel | `paperId` | ✅ 完整 |
| MindMapCanvas | **缺失 paperId** | ❌ 需修复 |


### AnnotationSidebar → PdfViewer 跳转

**事件链**:
1. `AnnotationSidebar.handleJump(page)` → `window.dispatchEvent(new CustomEvent(annotation-jump, { detail: { page } }))`
2. `PdfViewer.useEffect` 监听 `annotation-jump` 事件 → `setCurrentPage(page)`

**验证**: ✅ 事件命名一致，监听正确。

### NoteEditor 与 AI 组件的 annotation-excerpt 事件

**事件链**:
1. `HighlightPopup` 触发 `annotation-excerpt` 事件（via Tauri `emit`）
2. `NoteEditor.useEffect` 监听 `annotation-excerpt` → 追加到笔记内容

**验证**: ✅ 链路完整。

---


## 三、其他发现

### 3.1 HighlightPopup 文本选择事件
PdfViewer 在 `mouseup` 时 emit `pdf-text-selected`，AiChatPanel 监听获取选中文本用于上下文。PdfViewer 的 textLayer 注入使用自定义 div 而非 pdfjs 官方 textLayer class，需确认事件正常工作。

### 3.2 MindMapCanvas 自动生成
当前无「自动生成」触发入口。如需此功能应加到 MindMapCanvas 工具栏。

### 3.3 导出文件名
MindMapCanvas 导出 PNG/MD 使用 `mindmap-${paperId}.png`，paperId 为 undefined 时会生成 `mindmap-undefined.png`，修复 paperId 传入后解决。

---

## 四、修复清单

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | ReaderView.tsx | `<MindMapCanvas />` 缺失 paperId | 改为 `<MindMapCanvas paperId={currentPaper.id} />` |

**优先级**: P0（阻断导图加载/保存）

---

## 五、验证方法

1. 打开某篇论文，进入 ReaderView
2. 切换到 MindMap Tab
3. 观察是否加载了已有导图
4. 编辑节点文本/添加子节点
5. 切换到其他 Tab 再切回 MindMap Tab
6. 验证编辑是否已保存并正确加载

---

## 六、结论

- **MindMapCanvas paperId 缺失**是唯一阻断性 bug，已修复
- 其余三栏数据流（AnnotationSidebar、NoteEditor、AiChatPanel、TranslationPanel）数据流均完整
- `annotation-jump` 事件链路正确，PdfViewer 正确监听并跳转
- 建议后续增加 MindMapCanvas 的「AI 生成导图」按钮