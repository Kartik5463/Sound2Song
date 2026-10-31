// A random id for this browser, used to keep a personal search history without accounts.
const KEY = 'sound2song.clientId'
let memoryId = null

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  // Fallback for older browsers / non-secure contexts
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  )
}

export function getClientId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = newId()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // Storage blocked (private mode etc.): history lasts for this tab only
    memoryId ??= newId()
    return memoryId
  }
}
