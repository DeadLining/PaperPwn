use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedMetadata {
    pub title: String,
    pub authors: String,
    pub year: Option<i64>,
    pub doi: String,
    pub abstract_text: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Extract a text sample from a PDF (first N pages, capped at max_chars).
pub fn extract_text_sample_from_pdf(pdf_path: &str, max_pages: usize, max_chars: usize) -> String {
    let Ok(doc) = Document::load(pdf_path) else {
        return String::new();
    };
    let pages: Vec<u32> = (1..=max_pages as u32).collect();
    let mut text = doc.extract_text(&pages).unwrap_or_default();
    if text.chars().count() > max_chars {
        text = text.chars().take(max_chars).collect();
    }
    text
}

/// Extract metadata from a PDF file.
/// Falls back to filename (without extension) as title if parsing fails.
pub fn extract_metadata_from_pdf(pdf_path: &str) -> ExtractedMetadata {
    let path = Path::new(pdf_path);
    let filename_title = path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.replace(".pdf", ""))
        .unwrap_or_else(|| "Untitled".to_string());

    let doc_result = Document::load(pdf_path);
    match doc_result {
        Ok(doc) => {
            let title = extract_title_from_doc(&doc, &filename_title);
            let authors = extract_authors_from_doc(&doc);
            let doi = extract_doi_from_doc(&doc);
            let abstract_text = extract_abstract_from_doc(&doc);
            let year = extract_year_from_doc(&doc);
            ExtractedMetadata {
                title,
                authors,
                year,
                doi,
                abstract_text,
                success: true,
                error: None,
            }
        }
        Err(e) => ExtractedMetadata {
            title: filename_title,
            authors: String::new(),
            year: None,
            doi: String::new(),
            abstract_text: String::new(),
            success: false,
            error: Some(format!("Failed to parse PDF: {}", e)),
        },
    }
}

/// Get a string value from the Info dictionary by key.
/// lopdf 0.32: Document.trailer is a Dictionary, trailer.get() returns Result<&Object, _>.
fn get_info_string(doc: &Document, key: &[u8]) -> String {
    let Ok(info_obj) = doc.trailer.get(b"Info") else {
        return String::new();
    };

    let info_dict = match info_obj {
        lopdf::Object::Reference(id) => doc.get_object(*id).ok().and_then(|obj| obj.as_dict().ok()),
        obj => obj.as_dict().ok(),
    };

    info_dict
        .and_then(|dict| dict.get(key).ok())
        .and_then(pdf_object_to_string)
        .unwrap_or_default()
}

fn pdf_object_to_string(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => Some(decode_pdf_string(bytes)),
        lopdf::Object::Name(bytes) => String::from_utf8(bytes.clone()).ok(),
        _ => None,
    }
}

fn decode_pdf_string(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xfe, 0xff]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else if bytes.starts_with(&[0xff, 0xfe]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

fn extract_title_from_doc(doc: &Document, fallback: &str) -> String {
    let title = get_info_string(doc, b"Title");
    if !title.is_empty() { title } else { fallback.to_string() }
}

fn extract_authors_from_doc(doc: &Document) -> String {
    get_info_string(doc, b"Author")
}

fn extract_year_from_doc(doc: &Document) -> Option<i64> {
    let date_str = get_info_string(doc, b"CreationDate");
    if date_str.starts_with("D:") && date_str.len() >= 6 {
        date_str[2..6].parse::<i64>().ok()
    } else {
        None
    }
}

/// Extract raw text from a PDF page content stream (simplified parser).
fn extract_page_text(doc: &Document, page_id: lopdf::ObjectId) -> String {
    let mut result = String::new();
    if let Ok(content_bytes) = doc.get_page_content(page_id) {
        let content = String::from_utf8_lossy(&content_bytes);
        let mut in_text = false;
        let mut current_line = String::new();

        for line in content.lines() {
            let line = line.trim();
            if line == "BT" {
                in_text = true;
                continue;
            }
            if line == "ET" {
                if !current_line.is_empty() {
                    result.push_str(&current_line);
                    result.push(' ');
                    current_line.clear();
                }
                in_text = false;
                continue;
            }
            if in_text {
                // Handle Tj: (text) Tj
                if let Some(pos) = line.find(" Tj") {
                    let before = line[..pos].trim();
                    if (before.starts_with('(') && before.ends_with(')')) ||
                       (before.starts_with('<') && before.ends_with('>')) {
                        let text = strip_text_delimiters(before);
                        if !text.is_empty() {
                            current_line.push_str(&text);
                        }
                    }
                }
                // Handle TJ: [(text) ...] TJ
                else if let Some(pos) = line.find(" TJ") {
                    let before = line[..pos].trim();
                    if before.starts_with('[') {
                        let inner = &before[1..before.len()-1];
                        let mut segment = String::new();
                        let mut in_paren = false;
                        let mut paren_content = String::new();
                        for ch in inner.chars() {
                            if ch == '(' { in_paren = true; paren_content.clear(); }
                            else if ch == ')' {
                                in_paren = false;
                                if !paren_content.is_empty() {
                                    segment.push_str(&paren_content);
                                }
                            }
                            else if in_paren { paren_content.push(ch); }
                        }
                        if !segment.is_empty() {
                            current_line.push_str(&segment);
                        }
                    }
                }
            }
        }
        if !current_line.is_empty() {
            result.push_str(&current_line);
        }
    }
    result
}

fn strip_text_delimiters(s: &str) -> String {
    let s = s.trim();
    if (s.starts_with('(') && s.ends_with(')')) ||
       (s.starts_with('<') && s.ends_with('>')) {
        let inner = &s[1..s.len()-1];
        if s.starts_with('<') {
            hex_to_string(inner)
        } else {
            unescape_pdf_string(inner)
        }
    } else {
        s.to_string()
    }
}

fn unescape_pdf_string(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(next) = chars.next() {
                match next {
                    'n' => result.push('\n'),
                    'r' => result.push('\r'),
                    't' => result.push('\t'),
                    '\\' => result.push('\\'),
                    '(' => result.push('('),
                    ')' => result.push(')'),
                    c if c.is_ascii_digit() => {
                        let mut octal = String::from(c);
                        for _ in 0..2 {
                            if let Some(&next_ch) = chars.peek() {
                                if next_ch.is_ascii_digit() && next_ch != '8' && next_ch != '9' {
                                    octal.push(chars.next().unwrap());
                                } else { break; }
                            }
                        }
                        if let Ok(byte) = u8::from_str_radix(&octal, 8) {
                            result.push(byte as char);
                        }
                    }
                    _ => result.push(next),
                }
            }
        } else {
            result.push(ch);
        }
    }
    result
}

fn hex_to_string(hex: &str) -> String {
    let hex: String = hex.chars().filter(|c| !c.is_whitespace()).collect();
    let mut result = String::new();
    let bytes: Vec<u8> = (0..hex.len()).step_by(2)
        .filter_map(|i| u8::from_str_radix(&hex[i..i+2.min(hex.len()-i)], 16).ok())
        .collect();
    result.push_str(&String::from_utf8_lossy(&bytes));
    result
}

fn extract_doi_from_doc(doc: &Document) -> String {
    for page_id in doc.page_iter().take(5) {
        let text = extract_page_text(doc, page_id);
        if let Some(pos) = text.find("10.") {
            let rest = &text[pos..];
            let doi_end = rest.find(|c: char| c == ' ' || c == '\n' || c == '\r')
                .unwrap_or(rest.len().min(100));
            let potential_doi = &rest[..doi_end];
            if let Some(slash_pos) = potential_doi.find('/') {
                if slash_pos > 2 && slash_pos < 10 {
                    return potential_doi.to_string();
                }
            }
        }
    }
    String::new()
}

fn extract_abstract_from_doc(doc: &Document) -> String {
    if let Some(page_id) = doc.page_iter().next() {
        let text = extract_page_text(doc, page_id);
        let lower = text.to_lowercase();
        if let Some(start) = lower.find("abstract") {
            let abstract_start = start + 8;
            let abstract_text = &text[abstract_start..];
            let end_markers = ["Introduction", "1 Introduction", "1. Introduction", "\n1", "Keywords"];
            let mut end_pos = abstract_text.len().min(2000);
            for marker in end_markers {
                if let Some(pos) = abstract_text.find(marker) {
                    if pos > 20 && pos < end_pos { end_pos = pos; }
                }
            }
            return abstract_text[..end_pos].trim().to_string();
        }
    }
    String::new()
}
