// Must be first: canvasApi reads CANVAS_* env vars at module load time.
import 'dotenv/config'

import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import { Server as SocketServer } from 'socket.io'
import canvasRoutes from './routes/canvas.js'
import ltiRoutes from './routes/lti.js'
import ltiSession from './middleware/ltiSession.js'
import LTI_CONFIG, { ltiConfigErrors } from './config/ltiConfig.js'
import { startPolling } from './services/pollingService.js'
import { setIo } from './services/realtime.js'

const app = express()

// TLS terminates at the Traefik reverse proxy, so the app itself only ever sees
// plain http. Trusting the first proxy hop lets express-session read
// X-Forwarded-Proto and recognise the request as https — without this, a
// Secure cookie is silently dropped and the launch session never persists.
app.set('trust proxy', 1)

app.use(cors())
app.use(express.json())

// saveUninitialized:false means no cookie is ever issued until a launch writes
// to the session, so with LTI off this middleware is a no-op on the wire.
//
// Canvas renders the tool in an iframe, which makes every request to us a
// cross-site one. Browsers drop a cross-site cookie unless it is explicitly
// SameSite=None, and they only honour SameSite=None when it is also Secure —
// so the two must be set together or the session silently fails to stick.
app.use(
  session({
    secret: LTI_CONFIG.sessionSecret ?? 'rep-dashboard-dev-secret',
    name: 'rep.sid',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/lti', ltiRoutes)

// Resolves req.canvasUserId for every data route: the launch session when LTI
// is on, the unchanged fallback id when it is off.
app.use('/api', ltiSession, canvasRoutes)

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

// The background poll is a single server-wide loop with no request behind it,
// so it can't read a per-user LTI session. It stays pinned to the fallback user
// and drives the shared 'coursesUpdate'/'filesUpdate' broadcasts as before.
const POLL_USER_ID = LTI_CONFIG.fallbackUserId

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)

  if (LTI_CONFIG.enabled) {
    const missing = ltiConfigErrors()
    console.log(
      missing.length
        ? `[lti] ENABLED but misconfigured — missing ${missing.join(', ')}; launches will fail`
        : '[lti] enabled — POST /lti/launch is accepting Canvas launches'
    )
  } else {
    console.log(`[lti] disabled — serving fallback user ${LTI_CONFIG.fallbackUserId}`)
  }

  startPolling(io, { userId: POLL_USER_ID })
})

export { io }