/**
 * Frontend Tauri event listening utilities.
 * Provides typed wrappers for listening to paper management events
 * emitted from the Rust backend, with proper unlisten cleanup.
 */

import { listen, UnlistenFn } from '@tauri-apps/api/event';

/**
 * Event types emitted by the Rust backend for paper management operations.
 */
export type PaperEventType =
  | 'paper-imported'
  | 'paper-updated'
  | 'paper-deleted'
  | 'annotation-added'
  | 'note-saved'
  | 'ai-response-received';

/**
 * Shape of a paper event payload received from the backend.
 */
export interface PaperEvent {
  type: PaperEventType;
  data: any;
}

/**
 * Subscribe to paper management events from the Rust backend.
 * @param callback - Handler invoked for each matching event
 * @returns Promise that resolves to an unlisten function for cleanup
 */
export async function onPaperEvent(
  callback: (event: PaperEvent) => void,
): Promise<UnlistenFn> {
  const unlisten = await listen<PaperEvent>('paper-event', (e) => {
    callback(e.payload as PaperEvent);
  });
  return unlisten;
}
