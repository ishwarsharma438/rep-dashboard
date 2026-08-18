// Must be first: canvasApi reads CANVAS_* env vars at module load time.
import 'dotenv/config'

import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { Server as SocketServer } from 'socket.io'
import canvasRoutes from './routes/canvas.js'
import { startPolling } from './services/pollingService.js'
import { setIo } from './services/realtime.js'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api', canvasRoutes)

// Unknown /api path -> clean JSON instead of Express' HTML 404.
app.use('/api', (req, res) => {
  res.status(404).json({ error: true, message: `No route for ${req.method} ${req.originalUrl}` })
})

// Serve the built React app (vite build -> dist/) and fall back to
// index.html for client-side routes, without swallowing /api requests.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

app.use(express.static(distDir))

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(distDir, 'index.html'))
})

// Catch-all error handler: keeps the server alive and always answers with JSON.
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
app.use((err, req, res, next) => {
  const status = err.response?.status ?? err.status ?? 500
  const message =
    err.response?.data?.errors?.[0]?.message ?? err.response?.data?.message ?? err.message

  console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}: ${message}`)

  if (res.headersSent) return

  res.status(status).json({ error: true, message })
})

const PORT = process.env.PORT || 3001

// socket.io shares the express http server rather than binding its own port.
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: { origin: true },
})

// Let routes broadcast without importing this module back.
setIo(io)

io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`)
  socket.on('disconnect', (reason) => {
    console.log(`[socket] client disconnected: ${socket.id} (${reason})`)
  })
})

// Wired to a fixed user until Canvas LTI identity lands in a later milestone.
const POLL_USER_ID = 2619

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
  startPolling(io, { userId: POLL_USER_ID })
})

export { io }