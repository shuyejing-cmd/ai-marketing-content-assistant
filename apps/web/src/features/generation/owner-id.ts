const OWNER_ID_KEY = 'ai-marketing-owner-id';
const CURRENT_REMOTE_SESSION_KEY = 'ai-marketing-current-remote-session-id';
const CURRENT_FREE_REMOTE_SESSION_KEY = 'ai-marketing-current-free-remote-session-id';
const CURRENT_TEMPLATE_REMOTE_SESSION_KEY_PREFIX = 'ai-marketing-current-template-remote-session-id:';

export function getOwnerId() {
  const existing = localStorage.getItem(OWNER_ID_KEY);
  if (existing) return existing;

  const ownerId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `owner_${crypto.randomUUID()}`
      : `owner_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(OWNER_ID_KEY, ownerId);
  return ownerId;
}

export function getCurrentRemoteSessionId() {
  return getCurrentFreeRemoteSessionId();
}

export function setCurrentRemoteSessionId(sessionId: string) {
  setCurrentFreeRemoteSessionId(sessionId);
}

export function getCurrentFreeRemoteSessionId() {
  return (
    localStorage.getItem(CURRENT_FREE_REMOTE_SESSION_KEY) ??
    localStorage.getItem(CURRENT_REMOTE_SESSION_KEY) ??
    undefined
  );
}

export function setCurrentFreeRemoteSessionId(sessionId: string) {
  localStorage.setItem(CURRENT_FREE_REMOTE_SESSION_KEY, sessionId);
  localStorage.setItem(CURRENT_REMOTE_SESSION_KEY, sessionId);
}

export function getCurrentTemplateRemoteSessionId(templateId: string) {
  return localStorage.getItem(getTemplateSessionKey(templateId)) ?? undefined;
}

export function setCurrentTemplateRemoteSessionId(templateId: string, sessionId: string) {
  localStorage.setItem(getTemplateSessionKey(templateId), sessionId);
}

function getTemplateSessionKey(templateId: string) {
  return `${CURRENT_TEMPLATE_REMOTE_SESSION_KEY_PREFIX}${templateId}`;
}
