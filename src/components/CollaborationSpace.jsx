import { useState } from 'react'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { formatRelativeTime } from '../lib/format.js'
import { discussionCourseLabel } from '../lib/discussions.js'
import { ChevronDownIcon, PeopleIcon } from './icons.jsx'

/** The first course the teacher can actually post into. */
function firstEnrolledCourse(courses) {
  return courses.find((c) => c.status !== 'not_enrolled' && c.status !== 'error') ?? null
}

function ReplyPill({ count }) {
  const none = !count
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-[11px] font-medium ${
        none ? 'bg-gray-100 text-gray-500' : 'bg-rep-orange/15 text-rep-orange'
      }`}
    >
      {none ? 'No replies yet' : `${count} ${count === 1 ? 'reply' : 'replies'}`}
    </span>
  )
}

function NewDiscussionForm({ course, onDone }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = title.trim() && message.trim() && !submitting

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/discussions/${course.courseId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`)

      // The server broadcasts the refreshed list; the new topic arrives by socket.
      setTitle('')
      setMessage('')
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 rounded-xl bg-white p-4 shadow-sm">
      <fieldset disabled={submitting} className="space-y-3">
        <div>
          <label htmlFor="discussion-title" className="sr-only">
            Discussion title
          </label>
          <input
            id="discussion-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Discussion title"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 font-body text-sm text-rep-navy outline-none focus:border-rep-orange disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="discussion-message" className="sr-only">
            Message
          </label>
          <textarea
            id="discussion-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What would you like to discuss?"
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-body text-sm text-rep-navy outline-none focus:border-rep-orange disabled:opacity-60"
          />
        </div>

        <p className="font-body text-xs text-gray-400">Posting to {course.courseName}</p>

        {error && (
          <p role="alert" className="font-body text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-rep-orange px-4 py-2 font-body text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-3 py-2 font-body text-sm text-gray-500 hover:text-rep-navy"
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  )
}

function ReplyForm({ discussion, onDone, onOptimisticReply }) {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = message.trim() && !submitting

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    // Bump now, before awaiting. The server refreshes and broadcasts the true
    // count as part of handling this POST, so bumping after the response would
    // land on top of already-correct data and double-count.
    onOptimisticReply(discussion.id, +1)

    try {
      const res = await fetch(
        `/api/discussions/${discussion.courseId}/${discussion.id}/entries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`)

      setMessage('')
      onDone()
    } catch (err) {
      // Roll the optimistic bump back — the reply never landed.
      onOptimisticReply(discussion.id, -1)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 border-t border-gray-100 pt-3">
      <fieldset disabled={submitting} className="space-y-2">
        <label htmlFor={`reply-${discussion.id}`} className="sr-only">
          Your reply
        </label>
        <textarea
          id={`reply-${discussion.id}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Write a reply…"
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-body text-sm text-rep-navy outline-none focus:border-rep-orange disabled:opacity-60"
        />

        {error && (
          <p role="alert" className="font-body text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-rep-orange px-3 py-1.5 font-body text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Post Reply'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-2 py-1.5 font-body text-xs text-gray-500 hover:text-rep-navy"
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  )
}

function DiscussionCard({
  discussion,
  isNew,
  replyOpen,
  onToggleReply,
  onOptimisticReply,
  canReply = true,
}) {
  const meta = [discussion.courseName, discussion.author, formatRelativeTime(discussion.postedAt)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`rounded-xl bg-white p-4 shadow-sm ${isNew ? 'rep-new-highlight' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-sm font-bold text-rep-navy">{discussion.title}</h3>
            <ReplyPill count={discussion.replyCount} />
          </div>
          <p className="mt-1 truncate font-body text-xs text-gray-500">{meta}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            Replying posts through /api/discussions/:courseId/:topicId/entries,
            which gates on enrolment in one of the four configured courses. The
            Welcome course isn't one of them, so a reply there can never succeed
            — offer Canvas instead of a button that always errors.
          */}
          {canReply && (
            <button
              type="button"
              onClick={onToggleReply}
              className="rounded-lg px-3 py-1.5 font-body text-xs font-semibold text-rep-navy transition-colors hover:bg-black/5"
            >
              {replyOpen ? 'Close' : 'Reply'}
            </button>
          )}
          <a
            href={discussion.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-rep-orange px-3 py-1.5 text-center font-body text-xs font-semibold text-rep-orange transition-colors hover:bg-rep-orange hover:text-white"
          >
            Join Discussion
          </a>
        </div>
      </div>

      {replyOpen && (
        <ReplyForm
          discussion={discussion}
          onDone={onToggleReply}
          onOptimisticReply={onOptimisticReply}
        />
      )}
    </div>
  )
}

/**
 * One course's discussions, collapsible — same pattern as the announcements and
 * resources sections.
 */
function CourseSection({ group, children }) {
  const [open, setOpen] = useState(true)
  const count = group.discussions.length

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />

        <h3 className="min-w-0 flex-1 font-heading text-sm font-bold leading-snug text-rep-navy">
          {discussionCourseLabel(group)}
        </h3>

        <span className="shrink-0 font-body text-xs text-gray-500">{count}</span>
      </button>

      {open && <div className="space-y-3 border-t border-gray-100 p-4">{children}</div>}
    </div>
  )
}

export default function CollaborationSpace() {
  const { discussionGroups, loading, failed, courses, newDiscussionIds, bumpReplyCount } =
    useDashboardData()

  const [composing, setComposing] = useState(false)
  const [openReplyId, setOpenReplyId] = useState(null) // one reply form at a time

  const enrolledCourse = firstEnrolledCourse(courses)
  const { programme, courses: groups, programmeConfigured, total } = discussionGroups

  const card = (d, canReply) => (
    <DiscussionCard
      key={`${d.courseId}-${d.id}`}
      discussion={d}
      isNew={newDiscussionIds?.has(d.id)}
      replyOpen={openReplyId === d.id}
      onToggleReply={() => setOpenReplyId((current) => (current === d.id ? null : d.id))}
      onOptimisticReply={bumpReplyCount}
      canReply={canReply}
    />
  )

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">Collaboration Space</h2>

        {enrolledCourse && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="rounded-lg border border-rep-orange px-3 py-1.5 font-body text-xs font-semibold text-rep-orange transition-colors hover:bg-rep-orange hover:text-white"
          >
            Start New Discussion
          </button>
        )}
      </div>

      {!enrolledCourse && !loading.discussions && (
        <p className="mb-3 rounded-xl bg-white p-3 font-body text-xs text-gray-500 shadow-sm">
          You'll be able to start discussions once you're enrolled in a course
        </p>
      )}

      {composing && enrolledCourse && (
        <NewDiscussionForm course={enrolledCourse} onDone={() => setComposing(false)} />
      )}

      {loading.discussions && (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-white p-4 shadow-sm">
              <div className="h-3 w-48 rounded bg-gray-200" />
              <div className="mt-2 h-3 w-32 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!loading.discussions && failed?.discussions && (
        <p className="rounded-xl bg-white p-4 font-body text-sm text-gray-500 shadow-sm">
          Couldn't load discussions. Try refreshing.
        </p>
      )}

      {!loading.discussions && !failed?.discussions && (
        <div className="space-y-5">
          {/*
            Programme discussions come from the "Welcome to REP" course and go to
            everyone, so they sit above the per-course sections. Hidden entirely
            until that course is configured, rather than showing an empty box for
            however long it takes to create it.
          */}
          {(programmeConfigured || programme.length > 0) && (
            <section>
              <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-gray-500">
                Program Discussions
              </h3>

              {programme.length > 0 ? (
                <div className="space-y-3 border-l-4 border-rep-orange pl-3">
                  {programme.map((d) => card(d, false))}
                </div>
              ) : (
                <p className="rounded-xl border-l-4 border-rep-orange bg-white p-4 font-body text-sm text-gray-500 shadow-sm">
                  No program-wide discussions yet
                </p>
              )}
            </section>
          )}

          <section>
            {/* Only worth a heading once there's a programme section above it. */}
            {(programmeConfigured || programme.length > 0) && (
              <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-gray-500">
                Course Discussions
              </h3>
            )}

            {groups.length > 0 ? (
              <div className="space-y-3">
                {groups.map((group) => (
                  <CourseSection key={group.courseId ?? discussionCourseLabel(group)} group={group}>
                    {group.discussions.map((d) => card(d, true))}
                  </CourseSection>
                ))}
              </div>
            ) : (
              total === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-8 text-center shadow-sm">
                  <PeopleIcon className="h-9 w-9 text-gray-300" />
                  <p className="font-body text-sm text-gray-500">
                    No discussions yet — be the first to start one
                  </p>
                </div>
              )
            )}
          </section>
        </div>
      )}
    </section>
  )
}
