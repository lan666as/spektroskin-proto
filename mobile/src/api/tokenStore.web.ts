// sessionStorage, not localStorage/AsyncStorage: the demo runs a clinician window and a
// dermatologist window side by side on the same origin, and each needs its own session.
const KEY = 'spektroskin.session';

export async function loadSession(): Promise<string | null> {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveSession(value: string): Promise<void> {
  try {
    window.sessionStorage.setItem(KEY, value);
  } catch {
    // Storage blocked (private mode): the session lives only in memory for this page.
  }
}

export async function clearSession(): Promise<void> {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing persisted.
  }
}
