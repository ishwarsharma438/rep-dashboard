import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

// One connection per tab, shared by every subscriber and ref-counted so the
// last component to unmount is the one that disconnects.
let sharedSocket = null
let subscribers = 0

/**
 * Connects on mount, disconnects on unmount, returns the socket instance.
 *
 * Same-origin: Vite's /socket.io proxy forwards to the API server in dev, and
 * in production the app is served from the same origin as the API.
 */
export default function useSocket() {
  const [socket, setSocket] = useState(sharedSocket)

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io({ transports: ['websocket', 'polling'] })
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
