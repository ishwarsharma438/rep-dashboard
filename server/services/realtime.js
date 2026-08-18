// Holds the socket.io server so routes can emit without importing index.js
// (which imports the routes — that cycle would leave `io` undefined at runtime).
let io = null

export function setIo(instance) {
  io = instance
}

export function emit(event, payload) {
  io?.emit(event, payload)
}
