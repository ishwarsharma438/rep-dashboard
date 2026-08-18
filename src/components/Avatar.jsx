import { useState } from 'react'

// Canvas serves this generic silhouette when a user has no real avatar.
const isPlaceholderAvatar = (url) => !url || url.includes('avatar-50.png')

export function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar with an initials fallback for missing, broken or placeholder images.
 */
export default function Avatar({ user, size = 36, className = '' }) {
  const [broken, setBroken] = useState(false)
  const name = user?.name ?? ''
  const showInitials = !user || broken || isPlaceholderAvatar(user.avatarUrl)
  const style = { width: size, height: size }

  if (showInitials) {
    return (
      <div
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-full bg-rep-orange text-xs font-semibold text-white ${className}`}
        aria-hidden="true"
      >
        {initialsOf(name)}
      </div>
    )
  }

  return (
    <img
      src={user.avatarUrl}
      alt=""
      style={style}
      onError={() => setBroken(true)}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  )
}
