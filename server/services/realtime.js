import { userRoom } from './pollingService.js'

// Holds the socket.io server so routes can emit without importing index.js
// (which imports the routes — that cycle would leave `io` undefined at runtime).
let io = null

export function setIo(instance) {
  io = instance
}

/**
 * Broadcast to every connected socket.
 *
 * Only correct for account-wide payloads that are identical for all users —
 * announcements. Anything derived from a specific user's enrolments must use
 * emitToUser, or one teacher's data lands in another teacher's dashboard.
 */
export function emit(event, payload) {
  io?.emit(event, payload)
}

/** Emit into a single Canvas user's room. */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(String(userId))).emit(event, payload)
}
