# PaperPwn 构建指南

本文档说明在 macOS Apple Silicon 机器上构建 PaperPwn 桌面应用的完整步骤。

## 环境要求

- **Node.js**: >= 18
- **Rust**: >= 1.70
- **macOS**: Apple Silicon（M1/M2/M3/M4）
- **Xcode Command Line Tools**: `xcode-select --install`

## 前提条件

### 1. 安装 Node.js

推荐使用 [nvm](https://github.com/nvm-sh/nvm) 或直接从官网下载：

```bash
node --version  # >= 18
```

### 2. 安装 Rust

```bash
curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version  # >= 1.70
```

### 3. 安装 Xcode Command Line Tools

```bash
xcode-select --install
```

## 构建步骤

### 第一步：安装前端依赖

```bash
cd /path/to/PaperPwn
npm install
```

### 第二步：构建 Tauri 应用

```bash
npm run tauri build
```

这会执行以下操作：
1. `npm run build` — TypeScript 编译 + Vite 生产构建
2. `cargo build --release` — Rust 后端 Release 编译
3. 打包为 `.dmg` 安装程序和 `.app` 应用包

## 预期输出产物

构建完成后，产物位于 `src-tauri/target/release/bundle/` 目录下：

```
src-tauri/target/release/bundle/
├── dmg/                              # .dmg 安装包
│   └── PaperPwn_1.0.0_aarch64.dmg
└── macos/                            # .app 应用包（未签名）
    └── PaperPwn.app
```

| 产物 | 路径 | 说明 |
|------|------|------|
| **DMG 安装包** | `src-tauri/target/release/bundle/dmg/PaperPwn_1.0.0_aarch64.dmg` | 分发用安装程序 |
| **App 应用包** | `src-tauri/target/release/bundle/macos/PaperPwn.app` | 可直接运行的应用 |

### 关于 aarch64

Apple Silicon Mac 的处理器架构为 aarch64（ARM64），因此构建产物后缀为 `_aarch64`。

## 开发调试构建

### 仅构建前端

```bash
npm run build
```

输出到 `dist/` 目录。

### Tauri 开发模式

```bash
npm run tauri dev
```

这会：
1. 启动 Vite 开发服务器（`http://localhost:1420`）
2. 编译 Rust 后端（debug 模式）
3. 打开 PaperPwn 桌面窗口

### 查看 Rust 日志

在开发模式下，Tauri 窗口会自动打开 WebView 开发工具（devtools 已启用）。

## 签名与分发（可选）

### 对 .app 进行签名

```bash
codesign --force --deep --sign "Developer ID Application: Your Name" \
  src-tauri/target/release/bundle/macos/PaperPwn.app
```

### 对 .dmg 进行签名

```bash
codesign --force --sign "Developer ID Application: Your Name" \
  src-tauri/target/release/bundle/dmg/PaperPwn_1.0.0_aarch64.dmg
```

### 上传到 TestFlight / 直接分发

签名后的 .dmg 可直接分发给用户，或通过 TestFlight（需通过 App Store Connect 上传）。

## 常见问题

### Q: `npm run tauri build` 失败，提示 "Unable to find libssl"

安装 OpenSSL 开发库：

```bash
brew install openssl@3
```

并在 `.env` 中设置：

```bash
OPENSSL_INCLUDE_DIR=$(brew --prefix openssl@3)/include
OPENSSL_LIB_DIR=$(brew --prefix openssl@3)/lib
```

### Q: Rust 编译 Out of Memory

减少并发编译任务数：

```bash
export CARGO_BUILD_JOBS=4
```

### Q: dmg 打包失败

确保 `src-tauri/icons/` 目录下有完整的图标文件（32x32, 128x128, 128x128@2x, icon.icns, icon.ico）。

### Q: 应用启动闪退

检查日志：

```bash
tail -f ~/LibraryLogs/org.tauri.plog/PaperPwn/ stderr.log
```

或运行以下命令查看详细错误：

```bash
~/Library/Application\ Support/com.paperpwn.app/PaperPwn.app/Contents/MacOS/PaperPwn
```
