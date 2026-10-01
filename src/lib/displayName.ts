// Remembers the name the user typed last, per browser. Storage can be
// unavailable (private mode, blocked site data), so failures are ignored.
const KEY = 'travel-together:display-name'

export function loadDisplayName(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim())
  } catch {
    // ignore
  }
}
