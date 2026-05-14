use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderMetadata {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperMetadata {
    pub id: String,
    pub title: String,
    pub authors: String,
    pub year: Option<i64>,
    #[serde(rename = "abstract")]
    pub abstract_: String,
    pub doi: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "fileHash")]
    pub file_hash: String,
    #[serde(rename = "importTime")]
    pub import_time: String,
    #[serde(rename = "readStatus")]
    pub read_status: String,
    pub starred: i64,
    #[serde(rename = "lastPage")]
    pub last_page: Option<i64>,
    #[serde(rename = "lastOpenedAt")]
    pub last_opened_at: Option<String>,
    #[serde(rename = "folderIds")]
    pub folder_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationRecord {
    pub id: String,
    #[serde(rename = "paperId")]
    pub paper_id: String,
    pub page: i64,
    #[serde(rename = "highlightedText")]
    pub highlighted_text: String,
    pub comment: String,
    pub color: String,
    pub rects: Vec<Rect>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    #[serde(rename = "apiBase")]
    pub api_base: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "modelName")]
    pub model_name: String,
    pub temperature: f64,
    #[serde(rename = "maxTokens")]
    pub max_tokens: i64,
    #[serde(rename = "proxyUrl")]
    pub proxy_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperUpdate {
    pub id: String,
    pub title: Option<String>,
    pub authors: Option<String>,
    pub year: Option<i64>,
    #[serde(rename = "abstract")]
    pub abstract_: Option<String>,
    pub doi: Option<String>,
    #[serde(rename = "readStatus")]
    pub read_status: Option<String>,
    pub starred: Option<i64>,
    #[serde(rename = "lastPage")]
    pub last_page: Option<i64>,
    #[serde(rename = "folderIds")]
    pub folder_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPapersParams {
    pub search: Option<String>,
    #[serde(rename = "readStatus")]
    pub read_status: Option<String>,
    pub starred: Option<bool>,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    pub success: bool,
    #[serde(rename = "paperId")]
    pub paper_id: Option<String>,
    pub error: Option<String>,
}

fn now_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("PaperLibrary"))
}

pub fn setup_library(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    let lib_dir = app_dir.join("PaperLibrary");
    for subdir in ["folders", "papers", "cache", "trash"] {
        fs::create_dir_all(lib_dir.join(subdir))?;
    }
    Ok(())
}

fn papers_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = library_dir(app)?.join("papers");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn folders_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = library_dir(app)?.join("folders");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn paper_dir(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(papers_dir(app)?.join(paper_id))
}

fn paper_metadata_path(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(paper_dir(app, paper_id)?.join("metadata.json"))
}

fn write_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn read_paper(app: &AppHandle, paper_id: &str) -> Result<PaperMetadata, String> {
    read_json(&paper_metadata_path(app, paper_id)?)
}

pub fn write_paper(app: &AppHandle, paper: &PaperMetadata) -> Result<(), String> {
    write_json(&paper_metadata_path(app, &paper.id)?, paper)
}

pub fn list_papers(app: &AppHandle, params: GetPapersParams) -> Result<Vec<PaperMetadata>, String> {
    let dir = papers_dir(app)?;
    let mut papers = Vec::new();
    if !dir.exists() {
        return Ok(papers);
    }

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata_path = entry.path().join("metadata.json");
        if metadata_path.exists() {
            if let Ok(paper) = read_json::<PaperMetadata>(&metadata_path) {
                papers.push(paper);
            }
        }
    }

    if let Some(search) = params.search.filter(|s| !s.trim().is_empty()) {
        let needle = search.to_lowercase();
        papers.retain(|paper| {
            paper.title.to_lowercase().contains(&needle)
                || paper.authors.to_lowercase().contains(&needle)
                || paper.abstract_.to_lowercase().contains(&needle)
                || paper.doi.to_lowercase().contains(&needle)
        });
    }
    if let Some(read_status) = params.read_status {
        papers.retain(|paper| paper.read_status == read_status);
    }
    if let Some(starred) = params.starred {
        papers.retain(|paper| (paper.starred != 0) == starred);
    }
    if let Some(folder_id) = params.folder_id {
        papers.retain(|paper| paper.folder_ids.iter().any(|id| id == &folder_id));
    }

    papers.sort_by(|a, b| b.import_time.cmp(&a.import_time));
    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(papers.len());
    Ok(papers.into_iter().skip(offset).take(limit).collect())
}

pub fn update_paper(app: &AppHandle, update: PaperUpdate) -> Result<PaperMetadata, String> {
    let mut paper = read_paper(app, &update.id)?;
    if let Some(title) = update.title {
        paper.title = title;
    }
    if let Some(authors) = update.authors {
        paper.authors = authors;
    }
    if update.year.is_some() {
        paper.year = update.year;
    }
    if let Some(abstract_) = update.abstract_ {
        paper.abstract_ = abstract_;
    }
    if let Some(doi) = update.doi {
        paper.doi = doi;
    }
    if let Some(read_status) = update.read_status {
        paper.read_status = read_status;
    }
    if let Some(starred) = update.starred {
        paper.starred = starred;
    }
    if update.last_page.is_some() {
        paper.last_page = update.last_page;
    }
    if let Some(folder_ids) = update.folder_ids {
        paper.folder_ids = folder_ids;
    }
    write_paper(app, &paper)?;
    Ok(paper)
}

pub fn delete_paper(app: &AppHandle, paper_id: &str) -> Result<String, String> {
    let dir = paper_dir(app, paper_id)?;
    if !dir.exists() {
        return Err(format!("Paper not found: {}", paper_id));
    }
    let trash_dir = library_dir(app)?.join("trash");
    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    let dest = trash_dir.join(format!("{}-{}", paper_id, now_string()));
    fs::rename(&dir, &dest)
        .or_else(|_| {
            fs::remove_dir_all(&dir)?;
            Ok::<(), std::io::Error>(())
        })
        .map_err(|e| e.to_string())?;
    Ok(format!("Paper {} moved to trash", paper_id))
}

fn collect_pdf_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_pdf_files(&path, out)?;
        } else if path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
        {
            out.push(path);
        }
    }
    Ok(())
}

fn file_name_for_pdf(src: &Path) -> String {
    src.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("paper.pdf")
        .to_string()
}

pub fn import_papers(
    app: &AppHandle,
    source_paths: Vec<String>,
    folder_id: Option<String>,
) -> Result<Vec<ImportResult>, String> {
    let mut results = Vec::new();
    let mut import_paths = Vec::new();

    for source_path in &source_paths {
        let src = PathBuf::from(source_path);
        if !src.exists() {
            results.push(ImportResult {
                source_path: source_path.clone(),
                success: false,
                paper_id: None,
                error: Some(format!("Source file not found: {}", source_path)),
            });
            continue;
        }
        if src.is_dir() {
            collect_pdf_files(&src, &mut import_paths)?;
        } else {
            import_paths.push(src);
        }
    }

    let existing = list_papers(
        app,
        GetPapersParams {
            search: None,
            read_status: None,
            starred: None,
            folder_id: None,
            limit: None,
            offset: None,
        },
    )?;

    for src in import_paths {
        let source_path = src.to_string_lossy().to_string();
        if !src
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
        {
            results.push(ImportResult {
                source_path,
                success: false,
                paper_id: None,
                error: Some("Only PDF files can be imported".to_string()),
            });
            continue;
        }

        let file_hash = match crate::files::compute_file_hash(&src) {
            Ok(hash) => hash,
            Err(e) => {
                results.push(ImportResult {
                    source_path,
                    success: false,
                    paper_id: None,
                    error: Some(e),
                });
                continue;
            }
        };
        if existing.iter().any(|paper| paper.file_hash == file_hash) {
            results.push(ImportResult {
                source_path,
                success: false,
                paper_id: None,
                error: Some("Duplicate file (same hash already imported)".to_string()),
            });
            continue;
        }

        let paper_id = format!("paper_{}", Uuid::new_v4().simple());
        let dir = paper_dir(app, &paper_id)?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let pdf_name = file_name_for_pdf(&src);
        let dest_path = dir.join(&pdf_name);
        fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;

        let fallback_title = src
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let meta = crate::metadata::extract_metadata_from_pdf(&dest_path.to_string_lossy());
        let title = if meta.title.trim().is_empty() {
            fallback_title
        } else {
            meta.title
        };
        let now = now_string();
        let paper = PaperMetadata {
            id: paper_id.clone(),
            title,
            authors: meta.authors,
            year: meta.year,
            abstract_: meta.abstract_text,
            doi: meta.doi,
            file_path: dest_path.to_string_lossy().to_string(),
            file_hash,
            import_time: now,
            read_status: "unread".to_string(),
            starred: 0,
            last_page: None,
            last_opened_at: None,
            folder_ids: folder_id.clone().into_iter().collect(),
        };
        write_paper(app, &paper)?;
        results.push(ImportResult {
            source_path,
            success: true,
            paper_id: Some(paper_id),
            error: None,
        });
    }

    Ok(results)
}

fn normalize_paper_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Paper URL cannot be empty".to_string());
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if trimmed.contains("arxiv.org/abs/") {
            return Ok(trimmed.replace("/abs/", "/pdf/")
                + if trimmed.ends_with(".pdf") {
                    ""
                } else {
                    ".pdf"
                });
        }
        return Ok(trimmed.to_string());
    }

    let arxiv_id = trimmed.strip_prefix("arxiv:").unwrap_or(trimmed);
    if arxiv_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '/'))
    {
        return Ok(format!("https://arxiv.org/pdf/{}.pdf", arxiv_id));
    }

    Err("Unsupported paper address. Use a direct PDF URL, arXiv URL, or arXiv ID.".to_string())
}

fn file_name_from_url(url: &str) -> String {
    let without_query = url.split('?').next().unwrap_or(url);
    let name = without_query
        .rsplit('/')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("paper.pdf");
    if name.to_lowercase().ends_with(".pdf") {
        name.to_string()
    } else {
        format!("{}.pdf", name)
    }
}

pub async fn import_paper_from_url(
    app: &AppHandle,
    input: String,
    folder_id: Option<String>,
    proxy_url: Option<String>,
) -> Result<ImportResult, String> {
    let url = normalize_paper_url(&input)?;
    let mut client_builder = reqwest::Client::builder();
    if let Some(proxy_url) = proxy_url.filter(|value| !value.trim().is_empty()) {
        let proxy = reqwest::Proxy::all(proxy_url.trim())
            .map_err(|e| format!("Invalid proxy URL: {}", e))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download paper: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Download failed with HTTP status {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read downloaded paper: {}", e))?;
    if bytes.is_empty() {
        return Err("Downloaded file is empty".to_string());
    }

    let tmp_dir = library_dir(app)?.join("cache").join("downloads");
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let tmp_path = tmp_dir.join(format!(
        "{}-{}",
        Uuid::new_v4().simple(),
        file_name_from_url(&url)
    ));
    fs::write(&tmp_path, &bytes).map_err(|e| format!("Failed to save downloaded paper: {}", e))?;

    let mut results = import_papers(app, vec![tmp_path.to_string_lossy().to_string()], folder_id)?;
    let result = results.pop().unwrap_or(ImportResult {
        source_path: input,
        success: false,
        paper_id: None,
        error: Some("Import produced no result".to_string()),
    });
    let _ = fs::remove_file(&tmp_path);
    Ok(ImportResult {
        source_path: url,
        ..result
    })
}

pub fn list_folders(app: &AppHandle) -> Result<Vec<FolderMetadata>, String> {
    let dir = folders_dir(app)?;
    let mut folders = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata_path = entry.path().join("metadata.json");
        if metadata_path.exists() {
            if let Ok(folder) = read_json::<FolderMetadata>(&metadata_path) {
                folders.push(folder);
            }
        }
    }
    folders.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(folders)
}

pub fn create_folder(app: &AppHandle, name: String) -> Result<FolderMetadata, String> {
    if name.trim().is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    let id = format!("folder_{}", Uuid::new_v4().simple());
    let now = now_string();
    let folder = FolderMetadata {
        id: id.clone(),
        name,
        created_at: now.clone(),
        updated_at: now,
    };
    write_json(&folders_dir(app)?.join(&id).join("metadata.json"), &folder)?;
    Ok(folder)
}

pub fn rename_folder(
    app: &AppHandle,
    folder_id: String,
    name: String,
) -> Result<FolderMetadata, String> {
    if name.trim().is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    let path = folders_dir(app)?.join(&folder_id).join("metadata.json");
    let mut folder: FolderMetadata = read_json(&path)?;
    folder.name = name;
    folder.updated_at = now_string();
    write_json(&path, &folder)?;
    Ok(folder)
}

pub fn delete_folder(app: &AppHandle, folder_id: String) -> Result<String, String> {
    let dir = folders_dir(app)?.join(&folder_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    for mut paper in list_papers(
        app,
        GetPapersParams {
            search: None,
            read_status: None,
            starred: None,
            folder_id: None,
            limit: None,
            offset: None,
        },
    )? {
        paper.folder_ids.retain(|id| id != &folder_id);
        write_paper(app, &paper)?;
    }
    Ok(format!("Folder {} deleted", folder_id))
}

#[tauri::command]
pub fn get_recent_papers(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<PaperMetadata>, String> {
    let mut papers = list_papers(
        &app,
        GetPapersParams {
            search: None,
            read_status: None,
            starred: None,
            folder_id: None,
            limit: None,
            offset: None,
        },
    )?;
    // Sort by last_opened_at (if available) or import_time
    papers.sort_by(|a, b| {
        let a_time = a.last_opened_at.as_ref().unwrap_or(&a.import_time);
        let b_time = b.last_opened_at.as_ref().unwrap_or(&b.import_time);
        b_time.cmp(a_time) // Descending order
    });
    let limit = limit.unwrap_or(10).min(papers.len());
    papers.truncate(limit);
    Ok(papers)
}

// ---- Annotations ----

fn annotations_path(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(paper_dir(app, paper_id)?.join("annotations.json"))
}

fn read_annotations(app: &AppHandle, paper_id: &str) -> Result<Vec<AnnotationRecord>, String> {
    let path = annotations_path(app, paper_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    read_json(&path)
}

fn write_annotations(
    app: &AppHandle,
    paper_id: &str,
    annotations: &[AnnotationRecord],
) -> Result<(), String> {
    let path = annotations_path(app, paper_id)?;
    write_json(&path, annotations)
}

#[tauri::command]
pub fn get_annotations_for_paper(
    app: AppHandle,
    paper_id: String,
) -> Result<Vec<AnnotationRecord>, String> {
    read_annotations(&app, &paper_id)
}

#[tauri::command]
pub fn create_annotation(
    app: AppHandle,
    paper_id: String,
    page: i64,
    highlighted_text: String,
    comment: String,
    color: String,
    rects: Vec<Rect>,
) -> Result<AnnotationRecord, String> {
    let mut annotations = read_annotations(&app, &paper_id)?;
    let new_annotation = AnnotationRecord {
        id: format!("anno_{}", Uuid::new_v4().simple()),
        paper_id: paper_id.clone(),
        page,
        highlighted_text,
        comment,
        color,
        rects,
        created_at: now_string(),
    };
    annotations.push(new_annotation.clone());
    write_annotations(&app, &paper_id, &annotations)?;
    Ok(new_annotation)
}

#[tauri::command]
pub fn update_annotation(
    app: AppHandle,
    paper_id: String,
    annotation_id: String,
    comment: Option<String>,
    color: Option<String>,
    rects: Option<Vec<Rect>>,
) -> Result<AnnotationRecord, String> {
    let mut annotations = read_annotations(&app, &paper_id)?;
    let annotation = annotations
        .iter_mut()
        .find(|a| a.id == annotation_id)
        .ok_or_else(|| format!("Annotation not found: {}", annotation_id))?;
    if let Some(c) = comment {
        annotation.comment = c;
    }
    if let Some(c) = color {
        annotation.color = c;
    }
    if let Some(r) = rects {
        annotation.rects = r;
    }
    let updated = annotation.clone();
    write_annotations(&app, &paper_id, &annotations)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_annotation(
    app: AppHandle,
    paper_id: String,
    annotation_id: String,
) -> Result<(), String> {
    let mut annotations = read_annotations(&app, &paper_id)?;
    let original_len = annotations.len();
    annotations.retain(|a| a.id != annotation_id);
    if annotations.len() == original_len {
        return Err(format!("Annotation not found: {}", annotation_id));
    }
    write_annotations(&app, &paper_id, &annotations)?;
    Ok(())
}

fn extract_pdf_pages(pdf_path: &str) -> Vec<(u32, String)> {
    let Ok(doc) = Document::load(pdf_path) else {
        return Vec::new();
    };
    doc.get_pages()
        .keys()
        .filter_map(|page| {
            let text = doc.extract_text(&[*page]).unwrap_or_default();
            let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if normalized.is_empty() {
                None
            } else {
                Some((*page, normalized))
            }
        })
        .collect()
}

fn extract_figure_number(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for marker in ["figure", "fig.", "fig", "图"] {
        let mut start = 0;
        while let Some(pos) = lower[start..].find(marker) {
            let idx = start + pos + marker.len();
            let rest = &lower[idx..];
            let digits: String = rest
                .chars()
                .skip_while(|c| c.is_whitespace() || *c == ':' || *c == '：')
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if !digits.is_empty() {
                return Some(digits);
            }
            start = idx;
        }
    }
    None
}

fn query_terms(question: &str) -> Vec<String> {
    question
        .split(|c: char| !c.is_alphanumeric() && c != '-')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.chars().count() >= 3)
        .filter(|s| {
            !matches!(
                s.as_str(),
                "what"
                    | "why"
                    | "how"
                    | "the"
                    | "and"
                    | "for"
                    | "with"
                    | "about"
                    | "figure"
                    | "fig"
                    | "page"
            )
        })
        .collect()
}

fn requested_scope(context: Option<&str>) -> Option<ContextScope> {
    let ctx = context?;
    for line in ctx.lines() {
        let line = line.trim();
        if line == "scope:full" {
            return Some(ContextScope::Full);
        }
        if let Some(page) = line.strip_prefix("scope:page:") {
            if let Ok(page) = page.trim().parse::<u32>() {
                return Some(ContextScope::Page(page));
            }
        }
    }
    None
}

enum ContextScope {
    Full,
    Page(u32),
}

fn select_pdf_context(
    pdf_path: &str,
    question: &str,
    context: Option<&str>,
    max_chars: usize,
) -> String {
    let pages = extract_pdf_pages(pdf_path);
    if pages.is_empty() {
        return String::new();
    }

    let scope = requested_scope(context);
    if let Some(ContextScope::Page(target_page)) = scope {
        let mut out = String::new();
        if let Some(ctx) = context.filter(|c| !c.trim().is_empty()) {
            out.push_str("Reader context:\n");
            out.push_str(ctx);
            out.push_str("\n\n");
        }
        out.push_str("Requested PDF page excerpt:\n");
        if let Some((page, text)) = pages.into_iter().find(|(page, _)| *page == target_page) {
            let snippet: String = text.chars().take(max_chars).collect();
            out.push_str(&format!("\n[Page {}]\n{}\n", page, snippet));
        } else {
            out.push_str(&format!(
                "\n[Page {}] No extractable text found.\n",
                target_page
            ));
        }
        return out;
    }

    if matches!(scope, Some(ContextScope::Full)) {
        let mut out = String::new();
        if let Some(ctx) = context.filter(|c| !c.trim().is_empty()) {
            out.push_str("Reader context:\n");
            out.push_str(ctx);
            out.push_str("\n\n");
        }
        out.push_str(
            "Full-paper PDF excerpts, ordered by page and capped to fit the model context:\n",
        );
        for (page, text) in pages {
            if out.chars().count() >= max_chars {
                break;
            }
            let remaining = max_chars.saturating_sub(out.chars().count());
            let snippet: String = text.chars().take(remaining.min(2500)).collect();
            out.push_str(&format!("\n[Page {}]\n{}\n", page, snippet));
        }
        return out;
    }

    let terms = query_terms(question);
    let figure_no = extract_figure_number(question);
    let mut scored: Vec<(i64, u32, String)> = pages
        .into_iter()
        .map(|(page, text)| {
            let lower = text.to_lowercase();
            let mut score = 0_i64;
            for term in &terms {
                if lower.contains(term) {
                    score += 3;
                }
            }
            if let Some(no) = &figure_no {
                for pattern in [
                    format!("figure {}", no),
                    format!("figure{}", no),
                    format!("fig. {}", no),
                    format!("fig.{}", no),
                    format!("fig {}", no),
                    format!("图{}", no),
                    format!("图 {}", no),
                ] {
                    if lower.contains(&pattern) {
                        score += 50;
                    }
                }
            }
            (score, page, text)
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let mut selected: Vec<(u32, String)> = scored
        .iter()
        .filter(|(score, _, _)| *score > 0)
        .take(6)
        .map(|(_, page, text)| (*page, text.clone()))
        .collect();

    if selected.is_empty() {
        selected = scored
            .iter()
            .take(8)
            .map(|(_, page, text)| (*page, text.clone()))
            .collect();
    }
    selected.sort_by_key(|(page, _)| *page);

    let mut out = String::new();
    if let Some(ctx) = context.filter(|c| !c.trim().is_empty()) {
        out.push_str(
            "Reader context:
",
        );
        out.push_str(ctx);
        out.push_str(
            "

",
        );
    }
    out.push_str(
        "Relevant full-text excerpts extracted from the PDF:
",
    );
    for (page, text) in selected {
        if out.chars().count() >= max_chars {
            break;
        }
        let remaining = max_chars.saturating_sub(out.chars().count());
        let snippet: String = text.chars().take(remaining.min(3500)).collect();
        out.push_str(&format!(
            "
[Page {}]
{}
",
            page, snippet
        ));
    }
    out
}

// ---- AI Functions ----

async fn call_ai_api(
    system_prompt: &str,
    user_prompt: &str,
    config: &AiConfig,
) -> Result<String, String> {
    use reqwest::Client;
    use serde_json::json;

    let mut client_builder = Client::builder();
    if !config.proxy_url.is_empty() {
        let proxy = reqwest::Proxy::all(&config.proxy_url)
            .map_err(|e| format!("Invalid proxy URL: {}", e))?;
        client_builder = client_builder.proxy(proxy);
    }
    let client = client_builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let request_body = json!({
        "model": config.model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
    });

    let response = client
        .post(&format!(
            "{}/chat/completions",
            config.api_base.trim_end_matches('/')
        ))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("AI API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("AI API error {}: {}", status, error_text));
    }

    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI API response: {}", e))?;

    response_json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "AI API response missing content".to_string())
}

#[tauri::command]
pub async fn ai_generate_summary(
    app: AppHandle,
    paper_id: String,
    context: Option<String>,
    config: AiConfig,
) -> Result<String, String> {
    let paper = read_paper(&app, &paper_id)?;
    let pdf_context = context.unwrap_or_else(|| {
        select_pdf_context(
            &paper.file_path,
            "summary abstract introduction conclusion",
            None,
            18000,
        )
    });
    let system_prompt = "You are a helpful assistant that summarizes academic papers. Provide a concise summary in Chinese. Use the provided PDF text when available and cite page numbers as Page N.";
    let user_prompt = format!(
        "Please summarize the following paper using its PDF text.\n\nTitle: {}\n\nAbstract: {}\n\nPDF text/context:\n{}",
        paper.title, paper.abstract_, pdf_context
    );
    call_ai_api(&system_prompt, &user_prompt, &config).await
}

#[tauri::command]
pub async fn ai_explain_text(
    app: AppHandle,
    paper_id: String,
    text: String,
    page: i64,
    config: AiConfig,
) -> Result<String, String> {
    let paper = read_paper(&app, &paper_id)?;
    let system_prompt = "You are a helpful assistant that explains academic paper content. Provide clear explanations in Chinese.";
    let user_prompt = format!(
        "Please explain the following text from page {} of the paper \"{}\":\n\n{}",
        page, paper.title, text
    );
    call_ai_api(&system_prompt, &user_prompt, &config).await
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    paper_id: String,
    question: String,
    context: Option<String>,
    config: AiConfig,
) -> Result<String, String> {
    let paper = read_paper(&app, &paper_id)?;
    let system_prompt = "You are a helpful assistant that answers questions about academic papers. Answer in Chinese. Base your answer on the provided PDF excerpts, not just the title. If the excerpts do not contain enough evidence, say so. When referencing specific content from the paper, include the page number using the format \"Page N\".";
    let pdf_context = select_pdf_context(&paper.file_path, &question, context.as_deref(), 22000);
    let user_prompt = format!(
        "Based on the paper \"{}\", answer the following question.\n\nQuestion: {}\n\nPDF context:\n{}",
        paper.title, question, pdf_context
    );
    call_ai_api(&system_prompt, &user_prompt, &config).await
}

#[tauri::command]
pub async fn ai_translate_text(
    app: AppHandle,
    paper_id: String,
    text: String,
    page: i64,
    config: AiConfig,
) -> Result<String, String> {
    let paper = read_paper(&app, &paper_id)?;
    let system_prompt =
        "You are a helpful assistant that translates academic text. Translate to Chinese.";
    let user_prompt = format!(
        "Translate the following text from page {} of the paper \"{}\" to Chinese:\n\n{}",
        page, paper.title, text
    );
    call_ai_api(&system_prompt, &user_prompt, &config).await
}

// ---- MindMap & Outline ----

fn mindmap_path(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(paper_dir(app, paper_id)?.join("mindmap.json"))
}

fn outline_path(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(paper_dir(app, paper_id)?.join("outline.json"))
}

#[tauri::command]
pub fn save_mindmap(app: AppHandle, paper_id: String, content_json: String) -> Result<(), String> {
    let path = mindmap_path(&app, &paper_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mindmap(app: AppHandle, paper_id: String) -> Result<String, String> {
    let path = mindmap_path(&app, &paper_id)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_mindmap(
    app: AppHandle,
    paper_id: String,
    config: AiConfig,
) -> Result<String, String> {
    let paper = read_paper(&app, &paper_id)?;
    let system_prompt = "You are a helpful assistant that generates mind maps for academic papers. Return ONLY valid JSON, no markdown, no code blocks.";
    let user_prompt = format!(
        "Generate a mind map for the following paper:\n\nTitle: {}\n\nAbstract: {}\n\nReturn ONLY this exact JSON format (no markdown, no explanation):\n{{\"nodes\":[{{\"id\":\"root\",\"label\":\"Paper Title\",\"color\":\"#2563eb\"}},{{\"id\":\"1\",\"label\":\"Key Point 1\",\"color\":\"#059669\"}},{{\"id\":\"2\",\"label\":\"Key Point 2\",\"color\":\"#059669\"}}],\"edges\":[{{\"source\":\"root\",\"target\":\"1\"}},{{\"source\":\"root\",\"target\":\"2\"}}]}}",
        paper.title, paper.abstract_
    );
    let mindmap_json = call_ai_api(&system_prompt, &user_prompt, &config).await?;
    // Clean up markdown code blocks if present
    let cleaned = mindmap_json
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();
    // Validate JSON
    if let Err(_) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        return Err("AI returned invalid JSON for mindmap".to_string());
    }
    save_mindmap(app, paper_id, cleaned.clone())?;
    Ok(cleaned)
}

#[tauri::command]
pub async fn generate_outline(
    app: AppHandle,
    paper_id: String,
    config: AiConfig,
) -> Result<String, String> {
    let paper = read_paper(&app, &paper_id)?;
    let system_prompt = "You are a helpful assistant that generates outlines for academic papers. Return the outline as a JSON array of sections.";
    let user_prompt = format!(
        "Generate an outline for the following paper:\n\nTitle: {}\n\nAbstract: {}\n\nReturn JSON format: [{{\"title\":\"\",\"page\":null,\"items\":[{{\"title\":\"\",\"page\":null}}]}}]",
        paper.title, paper.abstract_
    );
    call_ai_api(&system_prompt, &user_prompt, &config).await
}

#[tauri::command]
pub fn get_generated_outline(app: AppHandle, paper_id: String) -> Result<Option<String>, String> {
    let path = outline_path(&app, &paper_id)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map_err(|e| e.to_string())
        .map(Some)
}

// ---- Notes & Conversations ----

fn note_path(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(paper_dir(app, paper_id)?.join("note.md"))
}

fn conversations_path(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    Ok(paper_dir(app, paper_id)?.join("conversations.json"))
}

#[tauri::command]
pub fn get_note(app: AppHandle, paper_id: String) -> Result<String, String> {
    let path = note_path(&app, &paper_id)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_note(app: AppHandle, paper_id: String, content: String) -> Result<(), String> {
    let path = note_path(&app, &paper_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_conversations(app: AppHandle, paper_id: String) -> Result<String, String> {
    let path = conversations_path(&app, &paper_id)?;
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_conversation(
    app: AppHandle,
    paper_id: String,
    content_json: String,
) -> Result<(), String> {
    let path = conversations_path(&app, &paper_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content_json).map_err(|e| e.to_string())
}
