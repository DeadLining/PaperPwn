# PaperMate

本地论文阅读与 AI 辅助管理软件。

## 技术栈

- **框架**: Tauri 2.x
- **前端**: React + TypeScript + Vite
- **样式**: Tailwind CSS + shadcn/ui
- **数据存储**: 文件系统（JSON）

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
│   │   ├── main.rs                # 应用入口
│   │   ├── lib.rs                 # 入口与命令注册
│   │   ├── library_fs.rs          # 文件系统库管理（论文/笔记/标注/AI/Outline 等命令）
│   │   ├── metadata.rs            # PDF 元数据提取
│   │   └── files.rs               # SHA256 哈希、文件操作
│   ├── capabilities/              # Tauri 权限配置
│   │   └── default.json           # 默认权限声明
│   ├── build.rs                   # Tauri 构建脚本
│   ├── Cargo.toml                 # Rust 依赖配置
│   └── tauri.conf.json            # Tauri 窗口与应用配置
├── public/                        # 静态资源
├── docs/                          # 文档
│   └── BUILD_GUIDE.md            # macOS 打包指南
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
└── ai-cache/           # AI 请求/响应缓存
```

| 目录 | 说明 |
|------|------|
| `papers/` | 存储用户导入的 PDF 文件，按 SHA256 哈希命名 |
| `notes/` | 用户撰写的 Markdown 笔记，按文献 ID 组织 |
| `annotations/` | PDF 标注数据（高亮、批注等），JSON 格式存储 |
| `mindmaps/` | 思维导图数据文件，JSON 格式 |
| `ai-cache/` | AI 请求与响应缓存，减少重复 API 调用 |

## 功能概述

PaperMate 提供以下核心功能：

| 功能 | 说明 |
|------|------|
| **文献导入** | 拖拽/批量导入 PDF，自动 SHA256 去重 |
| **元数据识别** | 自动提取论文标题/作者/年份/DOI/摘要，文件名兜底 |
| **文献管理** | 标签分类、全文搜索、多维度排序、星标收藏 |
| **PDF 阅读** | 翻页浏览、缩放适配、目录导航、阅读进度记忆 |
| **标注** | 高亮标记、文字批注、颜色分类、标注导出 |
| **Markdown 笔记** | 为每篇文献撰写 Markdown 笔记，含阅读模板 |
| **AI 辅助阅读** | 摘要生成、段落解释、问答式交互 |
| **翻译** | 划词翻译、段落翻译 |
| **思维导图** | AI 自动生成 / 手动编辑 / PNG+Markdown 导出 |

## 文档

| 文档 | 说明 |
|------|------|
| `docs/BUILD_GUIDE.md` | macOS Apple Silicon 构建详细步骤与常见问题 |

## 版本信息

- **当前版本**: v1.0.0
- **应用标识符**: com.papermate.app
