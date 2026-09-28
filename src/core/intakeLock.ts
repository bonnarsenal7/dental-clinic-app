import { useSyncExternalStore } from 'react'

/** While a patient is filling in the intake form, every staff tab on this
 *  tablet is locked behind the staff member's password.
 *
 *  The intake tab itself has no staff session (see intakeHost.ts), so this
 *  lock is not what protects the records from the patient's *form* — it is
 *  what stops the patient switching back to the tab reception left open.
 *  Stored in localStorage so a reload, or a URL typed into that tab, still
 *  meets the lock, and so every staff tab on the device locks together.
 *
 *  Signing out clears it: once nobody is signed in there is nothing behind it
 *  to protect, and the next person meets the login screen instead. */
const KEY = 'toothco.intakeLock'

// Where storage throws (some private modes), the lock still holds for this
// tab's lifetime rather than silently not locking at all.
let memoryLock = false
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null || memoryLock
  } catch {
    return memoryLock
  }
}

function notify() {
  for (const l of listeners) l()
}

export function setIntakeLock() {
  memoryLock = true
  try {
    window.localStorage.setItem(KEY, new Date().toISOString())
  } catch {
    // memoryLock carries it
  }
  notify()
}

export function clearIntakeLock() {
  memoryLock = false
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // nothing stored to remove
  }
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab locking or unlocking arrives as a storage event.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      memoryLock = e.newValue !== null && e.key === KEY
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useIntakeLocked(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
