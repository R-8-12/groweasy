/**
 * Frontend API client for the AI CSV Importer.
 * Handles multipart/form-data POST to /api/import and SSE stream consumption.
 *
 * Requirements: 3.4, 3.5, 3.6, 10.3, 10.6
 */

import type { ErrorEvent, FinalEvent, ProgressEvent, SseEvent } from './types';

/** Shape of HTTP error responses returned by the backend. */
interface ApiErrorResponse {
  error: string;
  message: string;
}

/**
 * Submit a CSV file to the backend import endpoint and consume the SSE stream.
 *
 * @param file      - The CSV File object selected by the user.
 * @param callbacks - Handlers dispatched as SSE events arrive.
 * @returns An AbortController the caller can use to cancel the in-flight request.
 *
 * Requirements: 3.4 — submits file to POST /api/import
 *               3.5 — caller shows indeterminate Progress_Indicator immediately on call
 *               3.6 — onProgress carries batches_completed / batches_total
 *               10.3 — SSE progress events forwarded via onProgress
 *               10.6 — premature stream close surfaces via onError; abort is silent
 */
export function importCSV(
  file: File,
  callbacks: {
    onProgress: (event: ProgressEvent) => void;
    onFinal: (event: FinalEvent) => void;
    onError: (event: ErrorEvent) => void;
  }
): AbortController {
  const controller = new AbortController();

  // Fire-and-forget; errors are routed to onError, not thrown.
  void _runImport(file, callbacks, controller);

  return controller;
}

async function _runImport(
  file: File,
  callbacks: {
    onProgress: (event: ProgressEvent) => void;
    onFinal: (event: FinalEvent) => void;
    onError: (event: ErrorEvent) => void;
  },
  controller: AbortController
): Promise<void> {
  const { onProgress, onFinal, onError } = callbacks;

  // Build multipart body — do NOT set Content-Type manually so the browser
  // adds the correct boundary string automatically.
  const formData = new FormData();
  formData.append('file', file);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

  let response: Response;

  try {
    response = await fetch(`${backendUrl}/api/import`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    // AbortError: caller cancelled — swallow silently (Req 10.6).
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    // Any other network-level error.
    const message =
      err instanceof Error ? err.message : 'Network error occurred.';
    onError({ type: 'error', error: 'network_error', message });
    return;
  }

  // Handle HTTP error responses (4xx / 5xx) before touching the stream.
  if (!response.ok) {
    try {
      const body = (await response.json()) as Partial<ApiErrorResponse>;
      onError({
        type: 'error',
        error: body.error ?? 'http_error',
        message: body.message ?? `HTTP ${response.status}`,
      });
    } catch {
      onError({
        type: 'error',
        error: 'http_error',
        message: `HTTP ${response.status}`,
      });
    }
    return;
  }

  // Consume the SSE stream from response.body.
  const body = response.body;
  if (!body) {
    onError({
      type: 'error',
      error: 'stream_closed',
      message: 'Stream closed before import completed.',
    });
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedFinal = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Stream ended — process any remaining buffered text before checking.
        if (buffer.trim().length > 0) {
          _processLines(buffer, callbacks, (isFinal) => {
            if (isFinal) receivedFinal = true;
          });
          buffer = '';
        }

        // Premature close: stream ended without a FinalEvent (Req 10.6).
        if (!receivedFinal) {
          onError({
            type: 'error',
            error: 'stream_closed',
            message: 'Stream closed before import completed.',
          });
        }
        break;
      }

      // Decode chunk and append to rolling buffer.
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines; keep the last (potentially incomplete) segment.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const payload = line.slice('data: '.length);
        let event: SseEvent;

        try {
          event = JSON.parse(payload) as SseEvent;
        } catch {
          // Malformed JSON — skip silently (Req 10.6 / task spec §7).
          continue;
        }

        if (event.type === 'progress') {
          onProgress(event);
        } else if (event.type === 'final') {
          receivedFinal = true;
          onFinal(event);
        } else if (event.type === 'error') {
          onError(event);
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Caller cancelled mid-stream — swallow silently.
      return;
    }
    const message =
      err instanceof Error ? err.message : 'Network error occurred.';
    onError({ type: 'error', error: 'network_error', message });
  } finally {
    reader.releaseLock();
  }
}

/**
 * Process a block of text as SSE lines and dispatch events.
 * Used only when flushing a non-empty buffer on stream close.
 */
function _processLines(
  text: string,
  callbacks: {
    onProgress: (event: ProgressEvent) => void;
    onFinal: (event: FinalEvent) => void;
    onError: (event: ErrorEvent) => void;
  },
  onFinalSeen: (isFinal: boolean) => void
): void {
  const { onProgress, onFinal, onError } = callbacks;
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;

    const payload = line.slice('data: '.length);
    let event: SseEvent;

    try {
      event = JSON.parse(payload) as SseEvent;
    } catch {
      continue;
    }

    if (event.type === 'progress') {
      onProgress(event);
    } else if (event.type === 'final') {
      onFinalSeen(true);
      onFinal(event);
    } else if (event.type === 'error') {
      onError(event);
    }
  }
}
