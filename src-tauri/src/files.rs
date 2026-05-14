use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct LibraryStats {
    pub total_papers: i64,
    pub total_size_bytes: u64,
    pub missing_files: Vec<String>,
}

/// Compute SHA-256 hash of a file, reading in chunks to handle large files.
pub fn compute_file_hash(path: &Path) -> Result<String, String> {
    let mut hasher = Sha256::new();
    let file = fs::File::open(path).map_err(|e| format!("Cannot open file: {}", e))?;
    let mut reader = std::io::BufReader::new(file);
    let mut buffer = [0u8; 8192];
    loop {
        let n = std::io::Read::read(&mut reader, &mut buffer)
            .map_err(|e| format!("Read error: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Delete a paper file from the papers/ directory.
#[allow(dead_code)]
pub fn delete_paper_file(file_path: &Path) -> Result<(), String> {
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|e| format!("Delete file failed: {}", e))?;
    }
    Ok(())
}

/// Check if a file path still exists on disk.
#[allow(dead_code)]
pub fn file_exists(path: &Path) -> bool {
    path.exists()
}

/// Generate a UUID string.
#[allow(dead_code)]
pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
