export function logFrontendRunEvent(event: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;

  void fetch('/api/dev/run-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...payload }),
  }).catch(() => {
    // Development logs must never block the user's generation flow.
  });
}
