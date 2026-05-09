import { invoke } from "@tauri-apps/api/core";

// ---- Type Definitions ----

export interface Paper {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  abstract: string;
  doi: string;
  filePath: string;
  fileHash: string;
  importTime: string;
  readStatus: string;
  starred: number;
  lastPage: number | null;
  lastOpenedAt?: string | null;
  folderIds?: string[];
}

export interface NewPaper {
  title: string;
  authors: string;
  year?: number | null;
  abstract: string;
  doi: string;
  filePath: string;
  fileHash: string;
}

export interface PaperUpdate extends Partial<Omit<Paper, "id">> {
  id: string;
}

export interface ImportResult {
  sourcePath: string;
  success: boolean;
  paperId?: string;
  error?: string;
}

export interface GetPapersParams {
  search?: string;
  tag?: string;
  readStatus?: string;
  starred?: boolean;
  limit?: number;
  offset?: number;
  folderId?: string;
}

export interface FolderMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotation {
  id: string;
  paperId: string;
  page: number;
  highlightedText: string;
  comment: string;
  color: string;
  rects: HighlightRect[];
  createdAt: string;
}

export interface Note {
  id: number;
  paperId: number;
  content: string;
  updatedAt: string;
}


export interface RecentPaper {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  readStatus: string;
  starred: number;
  lastOpenedAt: string | null;
}

export interface AiConfig {
  id: number;
  apiBase: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  proxyUrl?: string;
  updatedAt: string;
}

const AI_CONFIG_STORAGE_KEY = "paperpwn.aiConfig";

// ---- Database ----

export async function initDb(): Promise<string> {
  return "Filesystem library initialized";
}

// ---- Papers ----

export async function getPapers(params?: GetPapersParams): Promise<Paper[]> {
  return await invoke<Paper[]>("get_fs_papers", {
    search: params?.search,
    readStatus: params?.readStatus,
    starred: params?.starred,
    folderId: params?.folderId,
    limit: params?.limit,
    offset: params?.offset,
  });
}
export async function searchPapers(query: string): Promise<Paper[]> {
  return await getPapers({ search: query });
}

export async function addPaper(paper: NewPaper): Promise<Paper> {
  throw new Error("Direct addPaper is disabled in filesystem library mode. Use importPapers instead.");
}

export async function updatePaper(update: PaperUpdate): Promise<Paper> {
  return await invoke<Paper>("update_fs_paper", { update });
}

export async function importPapers(sourcePaths: string[]): Promise<ImportResult[]> {
  return await invoke<ImportResult[]>("import_papers", { sourcePaths });
}

export async function importPaperFromUrl(url: string): Promise<ImportResult> {
  const config = await getAiConfig();
  return await invoke<ImportResult>("import_paper_from_url", { url, proxyUrl: config?.proxyUrl || null });
}

export async function deletePaper(paperId: string): Promise<string> {
  return await invoke<string>("delete_paper", { paperId });
}

// ---- Tags ----
export async function addTag(paperId: number, tagName: string, tagColor?: string): Promise<Tag> {
  throw new Error("Tags are not available in filesystem library mode yet.");
}

export async function removeTag(paperId: number, tagId: number): Promise<void> {
  return;
}

export async function getTags(paperId?: number): Promise<Tag[]> {
  return [];
}

// ---- Annotations ----

function parseAnnotation(raw: any): Annotation {
  return {
    ...raw,
    rects: typeof raw.rects === 'string' ? JSON.parse(raw.rects) : raw.rects || [],
  };
}

export async function createAnnotation(paperId: string | number, page: number, highlightedText: string, comment: string, color?: string, rects?: HighlightRect[]): Promise<Annotation> {
  return await invoke<Annotation>("create_annotation", {
    paperId: String(paperId),
    page,
    highlightedText,
    comment,
    color: color ?? "yellow",
    rects: rects ?? [],
  });
}

export async function updateAnnotation(paperId: string | number, annotationId: string, comment?: string, color?: string, rects?: HighlightRect[]): Promise<Annotation> {
  return await invoke<Annotation>("update_annotation", {
    paperId: String(paperId),
    annotationId,
    comment,
    color,
    rects,
  });
}

export async function deleteAnnotation(paperId: string | number, annotationId: string): Promise<void> {
  await invoke("delete_annotation", {
    paperId: String(paperId),
    annotationId,
  });
}

export async function getAnnotationsForPaper(paperId: string | number): Promise<Annotation[]> {
  return await invoke<Annotation[]>("get_annotations_for_paper", {
    paperId: String(paperId),
  });
}

// ---- Starred & Reading Status ----

export async function toggleStarred(paperId: string): Promise<Paper> {
  return await invoke<Paper>("toggle_fs_starred", { paperId });
}

export async function updateReadingStatus(paperId: string, readStatus: string): Promise<Paper> {
  return await invoke<Paper>("update_fs_reading_status", { paperId, readStatus });
}

export async function getFolders(): Promise<FolderMetadata[]> {
  return await invoke<FolderMetadata[]>("get_folders");
}

export async function createFolder(name: string): Promise<FolderMetadata> {
  return await invoke<FolderMetadata>("create_folder", { name });
}

export async function renameFolder(folderId: string, name: string): Promise<FolderMetadata> {
  return await invoke<FolderMetadata>("rename_folder", { folderId, name });
}

export async function deleteFolder(folderId: string): Promise<string> {
  return await invoke<string>("delete_folder", { folderId });
}

// ---- Notes ----
export async function getOrCreateNote(paperId: string | number): Promise<Note> {
  const content = await invoke<string>("get_note", { paperId: String(paperId) });
  return { id: 0, paperId: typeof paperId === 'number' ? paperId : 0, content, updatedAt: new Date().toISOString() };
}

export async function updateNote(paperId: string | number, content: string): Promise<Note> {
  await invoke("save_note", { paperId: String(paperId), content });
  return { id: 0, paperId: typeof paperId === 'number' ? paperId : 0, content, updatedAt: new Date().toISOString() };
}

// ---- AI Config ----
export async function saveAiConfig(apiBase: string, apiKey: string, modelName: string, temperature: number, maxTokens: number, proxyUrl = ""): Promise<AiConfig> {
  const config: AiConfig = {
    id: 1,
    apiBase,
    apiKey,
    modelName,
    temperature,
    maxTokens,
    proxyUrl,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  return config;
}

export async function getAiConfig(): Promise<AiConfig | null> {
  const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as AiConfig;
}

// ---- AI Conversations ----
export async function saveConversation(paperId: string | number, messagesJson: string): Promise<void> {
  await invoke("save_conversation", { paperId: String(paperId), contentJson: messagesJson });
}

export async function getConversations(paperId: string | number): Promise<string> {
  return await invoke<string>("get_conversations", { paperId: String(paperId) });
}

// ---- AI Cache ----
export async function getOrCreateAiCache(queryHash: string, paperId: string | number): Promise<string | null> {
  return null;
}

export async function saveAiCache(queryHash: string, paperId: string | number, queryText: string, response: string): Promise<void> {
  return;
}

// ---- AI Commands ----
export async function generateSummary(paperId: string | number): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("ai_generate_summary", {
    paperId: String(paperId),
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

export async function generateSummaryWithContext(paperId: string | number, context: string): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("ai_generate_summary", {
    paperId: String(paperId),
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

export async function explainText(paperId: string | number, text: string, page: number): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("ai_explain_text", {
    paperId: String(paperId),
    text,
    page,
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

export async function aiChat(paperId: string | number, question: string, context?: string): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("ai_chat", {
    paperId: String(paperId),
    question,
    context,
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

export async function translateText(paperId: string | number, text: string, page?: number): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("ai_translate_text", {
    paperId: String(paperId),
    text,
    page: page ?? 1,
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

// ---- MindMap ----
export async function saveMindmap(paperId: string | number, contentJson: string): Promise<void> {
  await invoke("save_mindmap", {
    paperId: String(paperId),
    contentJson,
  });
}

export async function getMindmap(paperId: string | number): Promise<string> {
  return await invoke("get_mindmap", {
    paperId: String(paperId),
  });
}

export async function generateMindmap(paperId: string | number, force = false): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("generate_mindmap", {
    paperId: String(paperId),
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

export async function generateOutline(paperId: string | number, force?: boolean): Promise<string> {
  const config = await getAiConfig();
  if (!config) throw new Error("AI config not found. Please configure AI settings first.");
  return await invoke("generate_outline", {
    paperId: String(paperId),
    config: {
      apiBase: config.apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      proxyUrl: config.proxyUrl ?? "",
    },
  });
}

export async function getGeneratedOutline(paperId: string | number): Promise<string | null> {
  return await invoke("get_generated_outline", {
    paperId: String(paperId),
  });
}

// ---- Metadata ----
export async function extractMetadata(paperId: number): Promise<Paper> {
  throw new Error("Metadata extraction is handled during PDF import in filesystem library mode.");
}

export async function reExtractMetadata(paperId: number): Promise<Paper> {
  throw new Error("Metadata re-extraction is not available in filesystem library mode yet.");
}

export async function aiExtractMetadata(paperId: string): Promise<Paper> {
  const config = await getAiConfig();
  if (!config || !config.apiBase || !config.apiKey || !config.modelName) {
    throw new Error("AI 配置不完整，请先在设置中配置 AI 服务");
  }

  // 1. Extract PDF text sample via Tauri command
  const textSample = await invoke<string>("extract_pdf_text_sample", {
    paperId,
    maxPages: 3,
    maxChars: 8000,
  });
  if (!textSample.trim()) {
    throw new Error("无法从 PDF 提取文本");
  }

  // 2. Call OpenAI-compatible chat completion API
  const prompt = `Please extract the metadata from this academic paper text and return a JSON object with these exact fields: title (string), authors (string, comma-separated), year (number or null), doi (string), abstract (string). Return ONLY the JSON, no markdown, no explanation.\n\nPaper text:\n${textSample}`;

  const apiUrl = config.apiBase.replace(/\/$/, "") + "/chat/completions";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        { role: "system", content: "You are a metadata extraction assistant. You only return valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 1024,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API 请求失败 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI 返回内容为空");

  // 3. Parse JSON (strip optional markdown fences)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 返回内容不是有效 JSON: " + content.slice(0, 200));
  let extracted: { title?: string; authors?: string; year?: number | null; doi?: string; abstract?: string };
  try {
    extracted = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error("解析 AI 返回 JSON 失败: " + String(e));
  }

  // 4. Update paper metadata
  return await updatePaper({
    id: paperId,
    title: extracted.title,
    authors: extracted.authors,
    year: extracted.year ?? undefined,
    doi: extracted.doi,
    abstract: extracted.abstract,
  });
}

// ---- Library ----
export async function getLibraryPath(): Promise<string> {
  return await invoke<string>("get_library_path");
}


export async function getRecentPapers(limit?: number): Promise<RecentPaper[]> {
  const papers = await invoke<any[]>("get_recent_papers", { limit: limit ?? 5 });
  return papers.map(p => ({
    id: p.id,
    title: p.title,
    authors: p.authors,
    year: p.year,
    readStatus: p.read_status ?? "unread",
    starred: p.starred ?? false,
    lastOpenedAt: p.last_opened_at ?? p.created_at,
  }));
}

export async function updateLastOpenedAt(paperId: string): Promise<string> {
  return `Last opened tracking disabled for ${paperId}`;
}
