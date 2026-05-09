# 异常场景测试验证报告

**审查人：** 赵六（ROGUE）
**审查时间：** 2026/04/29
**审查范围：** PaperMate 思维导图模块相关核心异常处理

---

## 场景一：损坏 PDF 导入不崩溃

**检查点：** `import_papers` 命令中的错误捕获

**代码位置：** `src-tauri/src/lib.rs` 第 44-94 行

**实现分析：**
- 每个源文件单独处理，循环内用 `if !src.exists()` 提前检查文件是否存在，不存在则返回含错误信息的 `ImportResult`
- `compute_file_hash()` 和 `copy_pdf_to_library()` 均用 `.map_err()` 包装，失败时返回结构化错误
- 重复文件（hash 冲突）有专门检测逻辑，返回 `Duplicate file (same hash already imported)`
- 数据库写入用 `map_err(|e| e.to_string())` 处理锁竞争和 SQL 错误
- 所有异常均被捕获并转换为 `ImportResult{ success: false, error: Some(...) }`，不会 panic

**结论：** ✅ 异常处理到位，损坏/缺失文件不会导致崩溃
**风险等级：** 低

---

## 场景二：AI Key 错误有明确提示

**检查点：** `ai_client.rs` 的错误分类

**代码位置：** `src-tauri/src/ai_client.rs` 第 9-32 行

**实现分析：**
```rust
pub enum AiError {
    ApiKeyError(String),      // API Key 问题
    NetworkError(String),     // 网络不可用
    TimeoutError(String),    // 请求超时（30s）
    ApiError(String),         // API 错误（HTTP 非 401）
    ConfigError(String),      // 配置错误
}
```

- `Display` impl 输出中文友好消息，如 `"API Key 错误：请检查 API Key 配置"`
- `From<reqwest::Error>` impl 正确分类：401 → `ApiKeyError`，超时 → `TimeoutError`，连接失败 → `NetworkError`
- HTTP 非成功状态码均返回 `ApiError` 而非 panic
- 前端 `AiChatPanel.tsx` 在 `msg.role === "error"` 时显示红色背景+重试按钮

**结论：** ✅ 错误分类完整，提示信息清晰（中文）
**风险等级：** 低

---

## 场景三：网络断开时本地功能可用

**检查点：** AI 请求的降级处理

**代码位置：** `src-tauri/src/ai_client.rs`, `src/lib/stores/ai-store.ts`

**实现分析：**

1. **缓存机制**（`ai_commands.rs`）：
   - 所有 AI 命令先调用 `check_cache()`，命中则直接返回缓存结果
   - 缓存 key 为 SHA256(query_type + query_text)，跨重启持久化在 SQLite 的 `ai_cache` 表
   - 离线时若缓存存在，用户仍可获得历史结果

2. **降级不足之处：**
   - 无网络时 `chat_completion`/`chat_completion_stream` 会直接返回 `AiError::NetworkError`
   - 前端只显示错误 toast，无"离线模式"提示
   - PDF 查看、笔记编辑、思维导图编辑等纯本地功能不受影响
   - 但新建 AI 请求在无网络时会失败

**结论：** ⚠️ 部分满足——缓存机制实现了历史结果的离线可用，但新请求无法降级
**风险等级：** 中

---

## 场景四：PDF 移动/删除后提示

**检查点：** `PdfViewer.tsx` 的文件存在检查

**代码位置：** `src/components/PdfViewer.tsx` 第 96-115 行

**实现分析：**
```typescript
const loadPdf = useCallback(async () => {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs")
      const data = await readFile(filePath)  // ← 直接读取，无存在性检查
      // ...
    } catch (e) {
      console.error("Failed to load PDF", e)  // ← 仅 console.error，无 UI 提示
    }
  }, [...])
```

**问题：**
- 文件不存在时 Tauri FS `readFile` 抛异常，被 catch 捕获但只写 `console.error`
- 用户看不到任何提示，界面停留在空白/错误状态
- 没有检测文件是否存在并给出友好提示（"文件已被移动或删除"）

**结论：** ❌ 缺少文件缺失的 UI 提示，用户体验不友好
**风险等级：** 高

---

## 场景五：重启后数据完整

**检查点：** 数据库和 JSON 文件双写机制

**代码位置：**
- 思维导图：`src-tauri/src/db.rs` 第 814-843 行
- 笔记：`src-tauri/src/db.rs` 第 712-728 行

**实现分析：**

**思维导图双写：**
```rust
pub fn save_mindmap(...) {
    // 先写 JSON 文件（crash-safe，事实来源）
    write_mindmap_file(&app, paper_id, &content_json)?;
    // 再写 SQLite（一致性保障）
    conn.execute("DELETE FROM mind_maps ...");
    conn.execute("INSERT INTO mind_maps ...");
}

pub fn get_mindmap(...) {
    // 优先读 JSON 文件，SQLite 作为 fallback
    if file_path.exists() {
        if let Ok(json) = fs::read_to_string(&file_path) {
            if !json.is_empty() { return Ok(json); }
        }
    }
    // SQLite fallback
}
```

**笔记双写：**
```rust
pub fn update_note(...) {
    fs::write(&note_file, &content)?;   // 先写文件
    conn.execute("UPDATE notes SET ..."); // 再写 SQLite
}
```

**结论：** ✅ 双写机制完整（JSON 文件优先，SQLite 兜底）
**风险等级：** 低

---

## 异常测试清单

| # | 场景 | 测试方法 | 预期结果 | 实际状态 |
|---|------|----------|----------|----------|
| 1 | 导入损坏/不存在 PDF | 传入不存在路径或损坏文件调用 `importPapers` | 返回 `success: false` + 错误信息，不崩溃 | ✅ 通过 |
| 2 | AI Key 错误 | 配置错误 Key 调用 AI 功能 | 显示 `ApiKeyError` 中文提示"请检查 API Key 配置" | ✅ 通过 |
| 3 | 网络断开 | 关闭网络调用 AI 功能 | 缓存命中则返回缓存，否则报错 `NetworkError` | ⚠️ 部分通过（新请求无离线降级） |
| 4 | PDF 文件已删除 | 导入后手动删除 PDF 文件，打开论文 | 显示"文件不存在"提示 | ❌ 失败（仅有 console.error） |
| 5 | 重启后思维导图丢失 | 生成思维导图后重启应用 | 思维导图数据完整保留 | ✅ 通过（JSON + SQLite 双写） |
| 6 | 重启后笔记丢失 | 编辑笔记后重启应用 | 笔记内容完整保留 | ✅ 通过（文件 + SQLite 双写） |
| 7 | AI 请求超时 | 配置极短 timeout 或慢速网络 | 显示 `TimeoutError` 提示 | ✅ 通过（30s timeout） |

---

## 修复建议

### 高优先级（必须修复）

**1. PdfViewer.tsx 文件缺失提示**
```typescript
// 在 loadPdf catch 中添加友好提示
} catch (e) {
  console.error("Failed to load PDF", e)
  toast.error("无法加载 PDF：文件可能被移动或删除了")
}
```

### 中优先级（建议改进）

**2. AI 网络错误离线提示**
- 当前 `NetworkError` 返回后，前端仅显示原始错误字符串
- 建议在 `ai-store.ts` 或 `AiChatPanel.tsx` 中识别 `NetworkError` 类型，提示"网络不可用，部分功能受限"

---

## 总结

5 个异常场景中：
- **3 个通过**（损坏 PDF 导入、AI Key 错误提示、重启后数据完整）
- **1 个部分通过**（网络断开时本地功能可用，缓存有效但新请求无降级）
- **1 个未通过**（PDF 移动/删除后无提示）

整体异常处理机制较为完善，主要短板在 PDF 文件缺失时的用户体验，以及 AI 请求在完全离线时的降级处理。
