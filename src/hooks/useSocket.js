import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { USER_ID } from '../context/ProfileContext.jsx'

// One connection per tab, shared by every subscriber and ref-counted so the
// last component to unmount is the one that disconnects.
let sharedSocket = null
let subscribers = 0

/**
 * Connects on mount, disconnects on unmount, returns the socket instance.
 *
 * Same-origin: Vite's /socket.io proxy forwards to the API server in dev, and
 * in production the app is served from the same origin as the API.
 *
 * The user id is sent as a hint only. The server decides which room this socket
 * joins from the LTI launch session and ignores whatever we claim here, so a
 * tampered value can't subscribe anyone to another user's updates.
 */
export default function useSocket() {
  const [socket, setSocket] = useState(sharedSocket)

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io({
        transports: ['websocket', 'polling'],
        // Session cookie must ride along or the server can't identify the launch.
        withCredentials: true,
        auth: { userId: String(USER_ID) },
      })

      sharedSocket.on('session', ({ userId }) => {
        console.log(`[socket] bound to user ${userId}`)
      })

      sharedSocket.on('unauthorized', ({ message }) => {
        console.warn(`[socket] ${message} — launch this tool from Canvas`)
      })
    }
    subscribers += 1
    setSocket(sharedSocket)

    return () => {
      subscribers -= 1
      if (subscribers === 0 && sharedSocket) {
        sharedSocket.disconnect()
        sharedSocket = null
      }
    }
  }, [])

  return socket
}
