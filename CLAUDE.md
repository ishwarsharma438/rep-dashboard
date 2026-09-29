# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # concurrently: API on :3001 + Vite dev server on :5173
npm run server   # API only (node server/index.js)
npm run client   # Vite only — proxies /api and /socket.io to :3001
npm run build    # vite build -> dist/ (the only build/verify step that exists)
npm start        # production: node server/index.js, serves dist/ + API on one port
```

There is no test runner, linter, or formatter configured. `npm run build` is the
only automated check — run it after frontend changes. Backend changes are
verified by running the server and hitting the route.

Ad-hoc verification of frontend logic has been done by bundling a component with
esbuild and rendering it via `react-dom/server`; mark `socket.io-client`
external and inject a fixture at the `useDashboardData()` call site. Put such
throwaway harnesses in the scratchpad, not the repo.

`node server/scripts/setupGroups.js` is dry-run by default and needs `--confirm`
to write. Do not run it with `--confirm` without an explicit instruction.

## Architecture

Single Node process serves both the API and the built SPA. In production
Express serves `dist/` with an `index.html` fallback for client routes; in dev
Vite proxies `/api` and `/socket.io` to `:3001`.

**Canvas is the only datastore.** There is no database. Everything — courses,
files, discussions, announcements, coaching groups, bookings — is read live from
the Canvas LMS REST API with an admin token, shaped server-side, and cached
in-memory for `CACHE_TTL_MS` (20s default) in `server/services/canvasApi.js`.

### Request path

```
Canvas iframe ──POST /lti/launch──> routes/lti.js  (OAuth 1.0a verify, session write)
browser ────────GET /api/*────────> middleware/ltiSession.js  (resolves req.canvasUserId)
                                    routes/canvas.js  ──> services/canvasData.js
                                                          ──> services/canvasApi.js (cachedGet)
```

`ltiSession` is the identity chokepoint. With `LTI_ENABLED=false` it sets
`req.canvasUserId` to the fallback id (2619) and never rejects; with LTI on it
takes the id from the verified launch session or 401s.

**The `:userId` path segment on `/api/user/:userId`, `/api/courses/:userId`,
`/api/files/:userId`, `/api/discussions/:userId`, `/api/groups/:userId` is
decorative** — every handler uses `req.canvasUserId` and ignores the param. The
frontend still passes a hardcoded `USER_ID = 2619` from
[ProfileContext.jsx](src/context/ProfileContext.jsx); that constant is a leftover,
not the source of identity.

### Realtime

Socket.io shares the Express HTTP server and, via `io.engine.use(sessionMiddleware)`,
the same session — so a socket can be tied to its verified launch.
`resolveSocketUser()` in [server/index.js](server/index.js) deliberately ignores
anything the client sends in the handshake.

[pollingService.js](server/services/pollingService.js) keeps a `subscriptions`
Map of `userId -> {timer, sockets:Set, courses, files, discussions}`: one poll
loop per *user*, not per socket, refcounted so it stops when the last tab
closes, broadcasting into room `user:<id>`. Announcements are account-wide and
stay on a single global loop (`startAnnouncementPolling`) emitted to everyone.

Events: `coursesUpdate`, `filesUpdate`, `discussionsUpdate` (per-room),
`newAnnouncement` (global), `session` / `unauthorized` (handshake).

The poller and the routes must call the *same* service functions. `getFiles()`
branches on `CANVAS_RESOURCE_FOLDER_ID` inside `canvasData.js` rather than in
the route precisely because the poller calls it too — filtering only at the
route would make the Resource Hub flip contents every 30 seconds.

### Frontend data flow

`ProfileProvider` (user + coaching group) wraps `DashboardDataProvider`
(courses, announcements, files, discussions + the socket), both above the
router — so one fetch and one socket serve every route, and the Dashboard
previews and the dedicated pages read identical state.

`src/data/roadmapEvents.js` is the static program roadmap (67 events, 16
coaching groups A–P, `GROUP_CAPACITY = 12`). It is imported by *both* the
frontend and `server/routes/canvas.js` — treat it as shared data, not
frontend-only. [canvasEvents.js](src/lib/canvasEvents.js) merges the teacher's
real Canvas Calendar bookings into it, folding a booking into its roadmap twin
(same day + same title) but never into another Canvas booking, since n8n writes
several same-titled 1:1 sessions per teacher.

### Bookings

Calendly links live in `src/data/coachingLinks.js`; `BookingModal` appends the
Canvas user id as `utm_content` so an n8n webhook can attribute the booking.
n8n then writes the booking into the teacher's Canvas Calendar, and
`GET /api/bookings/summary` counts those events back by regex-matching their
titles (`classifyBooking` in [server/routes/canvas.js](server/routes/canvas.js))
against `BOOKING_TOTALS`. Booking counts therefore depend on the exact title
text n8n writes — a title matching no pattern counts toward nothing.

## Constraints carried by this codebase

- **Canvas reads are `cachedGet`; writes are rare and gated.** The only writes
  are the two discussion routes (`createDiscussion`, `createDiscussionEntry`,
  both behind `assertEnrolled`) and the group join/leave routes (inert until
  `CANVAS_GROUP_CATEGORY_ID` is set). Do not add Canvas POST/PUT/DELETE calls
  without being asked.
- **`app.set('trust proxy', 1)` is load-bearing.** TLS terminates at Traefik, so
  without it express-session drops the `Secure` cookie *and* the LTI OAuth
  signature check fails against the wrong scheme.
- **Session cookie must stay `secure: true` + `sameSite: 'none'`.** Canvas
  renders the tool in an iframe; browsers only honour `SameSite=None` alongside
  `Secure`, so the two move together or the launch session never sticks.
- **The LTI nonce store is module-level** in `routes/lti.js`. A `Provider` built
  per request carries an empty store, which silently defeats replay protection.
- `connect-redis@10` exports `RedisStore` as a **named** export, not default.
- Route order in the `/groups` block is load-bearing: `/groups/my` must precede
  `/groups/:userId`.
- Nonce store, `subscriptions` Map, and (without `REDIS_URL`) sessions are all
  per-process — the deployment assumes a single replica.

## Environment

`.env.example` is the reference. Notable flags:

| Var | Effect when unset/false |
| --- | --- |
| `LTI_ENABLED` | Standalone mode: every request resolves to `LTI_FALLBACK_USER_ID` (2619), no sessions issued |
| `CANVAS_GROUP_CATEGORY_ID` | Groups render from static roadmap data; join/leave return 503 |
| `CANVAS_RESOURCE_FOLDER_ID` | Resource Hub falls back to all files across enrolled courses |
| `REDIS_URL` | express-session MemoryStore; sessions lost on restart |

`GET /health` reports `degraded` (still 200) when Redis is configured but
unreachable.

Course ids are hardcoded in [server/config/canvasConfig.js](server/config/canvasConfig.js):
456 AI Essentials, 574 Coaching, 575 Resilient Educator, 578 The Reset.

## Sipcode Output Compression

mode: default — optimizes for: diff edits, no ceremony

the rules below apply to your responses in this project. follow them.
they exist so the user pays for code, not for ceremony.
### rules (default mode)

1. **diff-only edits.** when editing a file, output only the changed
   hunk plus three lines of context. never paste the full file back
   when three lines changed. this is the single biggest win.
2. **no preamble.** skip "i'll help with that", "sure", "here's what
   i did". lead with the work. the user can see what you did.
3. **no post-amble.** don't summarize what was just shown unless the
   user explicitly asks for a summary.
4. **code over prose.** when the answer is code, the code is the
   answer. any explanation goes after the code block, not before.
5. **bullets over paragraphs** for any list of options, steps, or
   trade-offs. saves tokens versus flowing prose.
6. **one canonical example, not three.** show one good example. skip
   the exhaustive variants — the user will ask if they want more.
7. **no filler verbs.** drop "let me", "i'll go ahead and", "i'm
   going to". just do the thing.

(installed by sipcode. switch modes with `npx sipcode rules --mode <m>`.
uninstall with `npx sipcode rules --uninstall`.)
