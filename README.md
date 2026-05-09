# PaperMate

本地论文阅读与 AI 辅助管理软件。

## 技术栈

- **框架**: Tauri 2.x
- **前端**: React + TypeScript + Vite
- **样式**: Tailwind CSS + shadcn/ui
- **数据库**: SQLite

## 环境要求

- Node.js >= 18
- Rust >= 1.70（需安装 rustup）
- macOS Apple Silicon（Tauri 构建）

## 安装步骤

### 1. 安装前端依赖

```bash
npm install
```

### 2. 安装 Rust（若尚未安装）

```bash
curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## 开发命令

### 前端开发（纯前端，无 Rust 后端）

```bash
npm run dev
```

### 全栈开发（Tauri 桌面应用）

```bash
npm run tauri dev
```

## 运行

开发模式下运行：

```bash
npm run dev          # 前端开发服务器（http://localhost:1420）
npm run tauri dev    # Tauri 桌面应用（含 Rust 后端）
```

## 打包命令

生成 macOS `.dmg` 安装包和 `.app` 应用包：

```bash
npm run tauri build
```

构建产物输出到 `src-tauri/target/release/bundle/` 目录：

| 产物 | 路径 |
|------|------|
| **DMG 安装包** | `src-tauri/target/release/bundle/dmg/PaperMate_0.1.0_aarch64.dmg` |
| **App 应用包** | `src-tauri/target/release/bundle/macos/PaperMate.app` |

详细的 macOS Apple Silicon 打包步骤、签名说明和常见问题处理请参阅 [docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md)。

## 项目结构

```
PaperMate/
├── src/                           # 前端源码
│   ├── pages/                     # 页面组件
│   │   ├── LibraryList.tsx        # 文献库列表页
│   │   ├── ReaderView.tsx         # PDF 阅读页
│   │   └── Settings.tsx           # 设置页
│   ├── components/                # UI 组件
│   │   ├── AppShell.tsx           # 应用外壳布局
│   │   ├── MindMapCanvas.tsx      # 思维导图画布
│   │   ├── NoteEditor.tsx         # Markdown 笔记编辑器
│   │   ├── AiChatPanel.tsx        # AI 对话面板
│   │   ├── TranslationPanel.tsx   # 翻译面板
│   │   ├── PdfViewer.tsx          # PDF 阅读器
│   │   ├── AnnotationSidebar.tsx  # 标注侧边栏
│   │   └── HighlightPopup.tsx    # 高亮弹出框
│   ├── lib/                       # 工具库与辅助函数
│   │   ├── api.ts                 # Tauri IPC 调用封装（25个函数）
│   │   ├── fs.ts                  # 文件系统操作封装
│   │   ├── events.ts              # 事件总线与 Tauri 事件监听
│   │   ├── utils.ts               # 通用工具函数（cn）
│   │   └── stores/                # Zustand 状态管理
│   │       ├── ai-store.ts        # AI 对话/缓存状态
│   │       ├── paper-store.ts     # 文献状态
│   │       ├── mindmap-store.ts   # 思维导图状态
│   │       ├── annotation-store.ts # 标注状态
│   │       └── pdf-viewer-store.ts # PDF 阅读器状态
│   ├── styles/                    # 全局样式
│   │   └── globals.css            # Tailwind CSS 入口
│   ├── App.tsx                    # 路由入口
│   └── main.tsx                   # 应用入口
├── src-tauri/                     # Rust 后端
│   ├── src/                       # Rust 源码
│   │   ├── main.rs                # 应用入口 & 生命周期
│   │   ├── lib.rs                 # 库模块（import_papers, delete_paper）
│   │   ├── db.rs                  # SQLite 初始化与 27 个 IPC 命令
│   │   ├── ai_commands.rs         # AI 生成/对话/翻译/缓存指令
│   │   ├── metadata.rs            # PDF 元数据提取
│   │   └── files.rs               # SHA256 哈希、文件操作
│   ├── migrations/                # 数据库迁移
│   │   ├── 001_initial_schema.sql # 初始 schema（6张表）
│   │   ├── 002_add_tables.sql     # 扩展表（ai_conversations/mind_maps/ai_config）
│   │   ├── 003_fts5.sql           # FTS5 全文搜索
│   │   └── 004_fix_constraints.sql# 约束修复
│   ├── capabilities/              # Tauri 权限配置
│   │   └── default.json           # 默认权限声明
│   ├── build.rs                   # Tauri 构建脚本
│   ├── Cargo.toml                 # Rust 依赖配置
│   └── tauri.conf.json            # Tauri 窗口与应用配置
├── public/                        # 静态资源
├── docs/                          # 文档
│   ├── BUILD_GUIDE.md            # macOS 打包指南
│   ├── TEST_RESULTS_SUMMARY.md   # 测试结果汇总（本文档索引）
│   └── EXCEPTION_TESTING.md      # 异常场景测试
├── package.json                   # Node.js 依赖与脚本
├── vite.config.ts                 # Vite 构建配置
├── tsconfig.json                  # TypeScript 配置
└── README.md                      # 本文件
```

## AI 配置

在应用内 **Settings** 页面配置以下参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| **API Base URL** | AI API 服务地址 | `https://api.openai.com/v1` 或 `http://localhost:11434/v1` |
| **API Key** | API 密钥 | `sk-...` |
| **模型名称** | 使用的模型 | `gpt-4o`、`deepseek-chat`、`llama3` |

### 支持的 API 类型

- **OpenAI-compatible API** — 任何兼容 OpenAI 接口格式的服务（OpenAI、DeepSeek、Moonshot 等）
- **本地 Ollama** — 通过 Ollama 在本地运行大语言模型，无需外部 API

### 配置步骤

1. 打开应用，点击左侧导航栏 **Settings**
2. 填写 API Base URL、API Key、模型名称
3. 点击保存，配置将持久化到数据库

## 数据存储

应用数据存储在 `~/Library/Application Support/com.papermate.app/PaperLibrary/` 目录下：

```
~/Library/Application Support/com.papermate.app/PaperLibrary/
├── papers/             # PDF 文件（SHA256 哈希命名）
├── notes/              # Markdown 笔记
├── annotations/        # 标注数据（JSON）
├── mindmaps/           # 思维导图（JSON）
├── ai-cache/           # AI 请求/响应缓存
├── indexes/            # 全文搜索索引
└── library.db          # SQLite 主数据库
```

| 目录 | 说明 |
|------|------|
| `papers/` | 存储用户导入的 PDF 文件，按 SHA256 哈希命名 |
| `notes/` | 用户撰写的 Markdown 笔记，按文献 ID 组织 |
| `annotations/` | PDF 标注数据（高亮、批注等），JSON 格式存储 |
| `mindmaps/` | 思维导图数据文件，JSON 格式，支持 SQLite + 文件双写 |
| `ai-cache/` | AI 请求与响应缓存，减少重复 API 调用 |
| `indexes/` | 全文搜索（FTS5）索引文件 |
| `library.db` | SQLite 主数据库，存储文献元数据、标签、阅读进度、AI 配置等 |

## 功能概述

PaperMate 提供以下核心功能：

| 功能 | 说明 |
|------|------|
| **文献导入** | 拖拽/批量导入 PDF，自动 SHA256 去重 |
| **元数据识别** | 自动提取论文标题/作者/年份/DOI/摘要，文件名兜底 |
| **文献管理** | 标签分类、全文搜索（FTS5）、多维度排序、星标收藏 |
| **PDF 阅读** | 翻页浏览、缩放适配、目录导航、阅读进度记忆 |
| **标注** | 高亮标记、文字批注、颜色分类、标注导出 |
| **Markdown 笔记** | 为每篇文献撰写 Markdown 笔记，含阅读模板 |
| **AI 辅助阅读** | 摘要生成、段落解释、问答式交互 |
| **翻译** | 划词翻译、段落翻译 |
| **思维导图** | AI 自动生成 / 手动编辑 / PNG+Markdown 导出 |

## 测试结果清单

> 完整的测试结果汇总请参阅 [docs/TEST_RESULTS_SUMMARY.md](docs/TEST_RESULTS_SUMMARY.md)。

### 构建验证

| 验证项 | 命令 | 结果 |
|--------|------|------|
| TypeScript 编译 + Vite 生产构建 | `npm run build` | ✅ PASS |
| 输出 | — | `dist/index.html` + `dist/assets/index-*.css` + `dist/assets/index-*.js` |

### 功能验证

| 功能 | 验证内容 | 状态 |
|------|---------|------|
| **NoteEditor** | `md-editor-rt` 组件集成、编辑/预览切换、`contentRef` 避免闭包 | ✅ PASS |
| **新笔记模板** | 空笔记自动填充阅读模板（背景/研究问题/方法/实验/结论/局限） | ✅ PASS |
| **高亮追加到笔记** | `annotation-excerpt` 事件触发，自动追加高亮文本到笔记 | ✅ PASS |
| **AI 回答保存** | `ai-response-to-note` 事件触发，AI 回答追加到笔记 | ✅ PASS |
| **翻译保存** | 翻译结果追加到笔记，格式：`**Translation (p.{n}):** {原文}> {译文}` | ✅ PASS |
| **错误提示** | 401/超时/网络错误分类显示用户友好提示 | ✅ PASS |
| **AI 对话上下文** | PDF 选中文本和页码作为上下文传递 | ✅ PASS |
| **API 完整性** | `src/lib/api.ts` 25 个函数 → Rust 25 个 IPC 命令 | ✅ PASS |
| **MindMap 集成** | ReaderView 右侧面板 MindMap Tab，MindMapCanvas 正常渲染 | ✅ PASS |
| **React Flow 画布** | 节点拖拽、缩放、迷你地图、控件按钮栏 | ✅ PASS |
| **AI 生成导图** | generate_mindmap 指令生成 6 节点导图 | ✅ PASS |
| **手动编辑** | 双击编辑、添加子节点、删除节点、拖拽布局 | ✅ PASS |
| **PNG 导出** | html-to-image 截图导出 | ✅ PASS |
| **Markdown 导出** | nodes/edges 转缩进列表格式下载 | ✅ PASS |

### 数据层验证

| 验证项 | 说明 | 状态 |
|--------|------|------|
| **数据库迁移** | 4 个 SQL 迁移文件，6+3+1+1 张表 | ✅ PASS |
| **Rust 后端** | 27 个 IPC 命令（db.rs/ai_commands.rs） | ✅ PASS |
| **前端 API** | 25 个 `invoke` 函数 + 6 个 TypeScript 接口 | ✅ PASS |
| **FTS5 搜索** | 标题/摘要/作者三字段索引，INSERT/UPDATE/DELETE 同步触发器 | ✅ PASS |
| **级联删除** | 删除论文时自动清理 annotations/notes/tags/conversations/mindmaps/cache | ✅ PASS |
| **AI 配置单例** | `CHECK(id=1)` 约束确保只有一条配置 | ✅ PASS |
| **JSON 双写持久化** | `save_mindmap` 同时写入 SQLite 和 `mindmaps/{paper_id}.json` | ✅ PASS |
| **笔记文件双写** | `update_note` 同时写入文件系统和 SQLite | ✅ PASS |
| **PDF 导入 SHA256 去重** | 哈希去重，hash 命名避免冲突，单条失败不中断批量 | ✅ PASS |

### 架构一致性验证

| 验证项 | 说明 | 状态 |
|--------|------|------|
| **API 参数映射** | 前端 camelCase → Rust snake_case 自动转换 | ✅ PASS |
| **路由结构** | `/` → LibraryList, `/reader/:id` → ReaderView, `/settings` → Settings | ✅ PASS |
| **窗口配置** | 1200×800，最小 900×600，identifier: `com.papermate.app` | ✅ PASS |
| **tauri.conf.json** | `bundle.targets=[dmg,app]`，`devtools=true` | ✅ PASS |
| **Cargo.toml** | tauri 2.x, tauri-build, rusqlite, lopdf, sha2 | ✅ PASS |

### 异常场景验证（详见 `docs/EXCEPTION_TESTING.md`）

| # | 场景 | 结果 |
|---|------|------|
| 1 | 导入损坏/不存在 PDF → 返回 success:false，不崩溃 | ✅ PASS |
| 2 | AI Key 错误 → 显示中文提示"请检查 API Key 配置" | ✅ PASS |
| 3 | 网络断开 → 缓存有效，新请求返回 NetworkError | ⚠️ 部分 |
| 4 | PDF 文件已删除 → 仅 console.error，无 UI 提示 | ❌ 失败 |
| 5 | 重启后思维导图完整（JSON + SQLite 双写） | ✅ PASS |
| 6 | 重启后笔记完整（文件 + SQLite 双写） | ✅ PASS |
| 7 | AI 请求超时（30s）→ 显示 TimeoutError 提示 | ✅ PASS |

**已知遗留问题**：
- **高优先级**：PdfViewer.tsx 文件缺失时仅 console.error，缺 UI 提示
- **中优先级**：AI 网络错误时前端无"离线模式"提示

### 打包验证

| 验证项 | 结果 |
|--------|------|
| `tauri.conf.json` bundle.targets=[dmg,app] | ✅ PASS |
| devtools=true | ✅ PASS |
| package.json 含 tauri/tauri dev/tauri build | ✅ PASS |
| DMG 产物路径文档化 | ✅ PASS |
| App 产物路径文档化 | ✅ PASS |
| codesign 签名命令（见 BUILD_GUIDE.md） | ✅ PASS |

## 文档索引

| 文档 | 说明 |
|------|------|
| `README.md` | 本文件，项目概览与测试结果清单 |
| `docs/TEST_RESULTS_SUMMARY.md` | 测试结果汇总（构建/功能/数据层/异常/打包） |
| `docs/BUILD_GUIDE.md` | macOS Apple Silicon 打包详细步骤 |
| `docs/EXCEPTION_TESTING.md` | 异常场景测试审查报告 |
| `VERIFICATION.md` | 集成验证报告 |
| `FINAL_BUILD_REPORT.md` | 构建报告（架构一致性验证） |
| `FINAL_CHECKLIST.md` | 交付检查清单 |
| `DATA_LAYER_VERIFICATION.md` | 数据层验证报告 |

## 版本信息

- **当前版本**: v0.1.0
- **构建日期**: 2026-04-29
- **应用标识符**: com.papermate.app
