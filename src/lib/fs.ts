/**
 * Frontend file system utilities using Tauri plugin-fs API.
 * Provides typed wrappers for file read/write, directory listing,
 * path existence checks, and directory creation.
 * Used for note storage, annotation data, and other local file operations.
 */

import {
  readFile,
  writeFile,
  readDir,
  exists,
  mkdir,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

/**
 * Read a text file from the filesystem.
 * @param path - Relative path (resolved against AppData by default) or absolute path
 * @returns File content as string
 */
export async function readTextFile(path: string): Promise<string> {
  const bytes = await readFile(path, { baseDir: BaseDirectory.AppData });
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

/**
 * Write a text file to the filesystem.
 * @param path - Relative path (resolved against AppData by default) or absolute path
 * @param content - Text content to write
 */
export async function writeTextFile(path: string, content: string): Promise<void> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  await writeFile(path, bytes, { baseDir: BaseDirectory.AppData });
}

/**
 * List directory entries with name and type information.
 * @param path - Directory path to list
 * @returns Array of entries with name and isDir flag
 */
export async function listDir(path: string): Promise<Array<{ name: string; isDir: boolean }>> {
  const entries = await readDir(path, { baseDir: BaseDirectory.AppData });
  return entries.map((entry) => ({
    name: entry.name,
    isDir: entry.isDirectory,
  }));
}

/**
 * Check whether a path exists in the filesystem.
 * @param path - Path to check
 * @returns true if the path exists, false otherwise
 */
export async function pathExists(path: string): Promise<boolean> {
  return await exists(path, { baseDir: BaseDirectory.AppData });
}

/**
 * Create a directory (and any parent directories) in the filesystem.
 * @param path - Directory path to create
 */
export async function createDir(path: string): Promise<void> {
  await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true });
}
