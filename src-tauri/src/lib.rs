mod files;
mod library_fs;
mod metadata;

use library_fs::{
    ai_chat, ai_explain_text, ai_generate_summary, ai_translate_text, create_annotation,
    delete_annotation, generate_mindmap, generate_outline, get_annotations_for_paper,
    get_conversations, get_generated_outline, get_mindmap, get_note, get_recent_papers,
    save_conversation, save_mindmap, save_note, update_annotation,
};
use tauri::Manager;
fn setup_paper_library(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    library_fs::setup_library(app)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to PaperPwn.", name)
}

#[tauri::command]
fn get_library_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("PaperLibrary").to_string_lossy().to_string())
}

#[tauri::command]
fn import_papers(
    app: tauri::AppHandle,
    source_paths: Vec<String>,
) -> Result<Vec<library_fs::ImportResult>, String> {
    library_fs::import_papers(&app, source_paths, None)
}

#[tauri::command]
async fn import_paper_from_url(
    app: tauri::AppHandle,
    url: String,
    proxy_url: Option<String>,
) -> Result<library_fs::ImportResult, String> {
    library_fs::import_paper_from_url(&app, url, None, proxy_url).await
}

#[tauri::command]
fn delete_paper(app: tauri::AppHandle, paper_id: String) -> Result<String, String> {
    library_fs::delete_paper(&app, &paper_id)
}

#[tauri::command]
fn get_fs_papers(
    app: tauri::AppHandle,
    search: Option<String>,
    read_status: Option<String>,
    starred: Option<bool>,
    folder_id: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<library_fs::PaperMetadata>, String> {
    library_fs::list_papers(
        &app,
        library_fs::GetPapersParams {
            search,
            read_status,
            starred,
            folder_id,
            limit,
            offset,
        },
    )
}

#[tauri::command]
fn update_fs_paper(
    app: tauri::AppHandle,
    update: library_fs::PaperUpdate,
) -> Result<library_fs::PaperMetadata, String> {
    library_fs::update_paper(&app, update)
}

#[tauri::command]
fn toggle_fs_starred(
    app: tauri::AppHandle,
    paper_id: String,
) -> Result<library_fs::PaperMetadata, String> {
    let paper = library_fs::read_paper(&app, &paper_id)?;
    library_fs::update_paper(
        &app,
        library_fs::PaperUpdate {
            id: paper_id,
            title: None,
            authors: None,
            year: None,
            abstract_: None,
            doi: None,
            read_status: None,
            starred: Some(if paper.starred == 0 { 1 } else { 0 }),
            last_page: None,
            folder_ids: None,
        },
    )
}

#[tauri::command]
fn update_fs_reading_status(
    app: tauri::AppHandle,
    paper_id: String,
    read_status: String,
) -> Result<library_fs::PaperMetadata, String> {
    library_fs::update_paper(
        &app,
        library_fs::PaperUpdate {
            id: paper_id,
            title: None,
            authors: None,
            year: None,
            abstract_: None,
            doi: None,
            read_status: Some(read_status),
            starred: None,
            last_page: None,
            folder_ids: None,
        },
    )
}

#[tauri::command]
fn get_folders(app: tauri::AppHandle) -> Result<Vec<library_fs::FolderMetadata>, String> {
    library_fs::list_folders(&app)
}

#[tauri::command]
fn create_folder(
    app: tauri::AppHandle,
    name: String,
) -> Result<library_fs::FolderMetadata, String> {
    library_fs::create_folder(&app, name)
}

#[tauri::command]
fn rename_folder(
    app: tauri::AppHandle,
    folder_id: String,
    name: String,
) -> Result<library_fs::FolderMetadata, String> {
    library_fs::rename_folder(&app, folder_id, name)
}

#[tauri::command]
fn delete_folder(app: tauri::AppHandle, folder_id: String) -> Result<String, String> {
    library_fs::delete_folder(&app, folder_id)
}

#[tauri::command]
fn extract_pdf_text_sample(
    app: tauri::AppHandle,
    paper_id: String,
    max_pages: Option<usize>,
    max_chars: Option<usize>,
) -> Result<String, String> {
    let paper = library_fs::read_paper(&app, &paper_id)?;
    Ok(metadata::extract_text_sample_from_pdf(
        &paper.file_path,
        max_pages.unwrap_or(3),
        max_chars.unwrap_or(8000),
    ))
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn set_macos_dock_icon() {
    use cocoa::appkit::{NSApp, NSApplication, NSImage};
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString};

    unsafe {
        let _pool = NSAutoreleasePool::new(nil);
        let icon_path = format!(
            "{}/../src/assets/paperpwn-logo.png",
            env!("CARGO_MANIFEST_DIR")
        );
        let ns_path = NSString::alloc(nil).init_str(&icon_path);
        let image: id = NSImage::alloc(nil).initWithContentsOfFile_(ns_path);
        if image != nil {
            NSApp().setApplicationIconImage_(image);
            println!("macOS Dock icon set from {}", icon_path);
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn set_macos_dock_icon() {}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            set_macos_dock_icon();
            setup_paper_library(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_library_path,
            // Import/delete
            import_papers,
            import_paper_from_url,
            delete_paper,
            get_fs_papers,
            update_fs_paper,
            toggle_fs_starred,
            update_fs_reading_status,
            get_folders,
            create_folder,
            rename_folder,
            delete_folder,
            extract_pdf_text_sample,
            get_recent_papers,
            // Annotations
            get_annotations_for_paper,
            create_annotation,
            update_annotation,
            delete_annotation,
            // AI
            ai_generate_summary,
            ai_explain_text,
            ai_chat,
            ai_translate_text,
            // MindMap & Outline
            save_mindmap,
            get_mindmap,
            generate_mindmap,
            generate_outline,
            get_generated_outline,
            // Notes & Conversations
            get_note,
            save_note,
            get_conversations,
            save_conversation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
