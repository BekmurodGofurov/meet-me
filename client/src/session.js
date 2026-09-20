const NAME_KEY = 'meet-me:name'
const SESSION_KEY = 'meet-me:session'

// Wrapped in try/catch: localStorage can throw (private browsing, blocked
// site data), and losing the ability to remember things is a fine
// degradation - crashing the app over it is not.

// The name outlives any particular room: leaving a room should still mean
// you don't have to retype it next time. Only the room itself is tied to
// "session" below, which is specifically for auto-rejoin on refresh.

export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Ignore - see note above.
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed?.roomId || !parsed?.name) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(roomId, name) {
  saveName(name)
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, name }))
  } catch {
    // Ignore - see note above.
  }
}

// Only the room is forgotten - the name is untouched, on purpose.
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore - see note above.
  }
}
