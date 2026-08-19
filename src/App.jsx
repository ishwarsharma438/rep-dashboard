import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import CoursesPage from './pages/CoursesPage.jsx'
import AnnouncementsPage from './pages/AnnouncementsPage.jsx'
import ResourcesPage from './pages/ResourcesPage.jsx'
import SessionsPage from './pages/SessionsPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import { ProfileProvider } from './context/ProfileContext.jsx'
import { DashboardDataProvider } from './context/DashboardDataContext.jsx'
import { MenuIcon } from './components/icons.jsx'

function Shell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-rep-bg">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim top bar, mobile only — the sidebar is a drawer below md */}
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-1 text-rep-navy hover:bg-black/5"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <div className="font-heading text-lg font-bold lowercase leading-none">
            <span className="text-rep-orange">rep</span>
            <span className="text-rep-navy">lenish</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/resources" element={<ResourcesPage />} />

            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/sessions" element={<SessionsPage />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        {/* Above the router outlet so every page shares one fetch + socket. */}
        <DashboardDataProvider>
          <Shell />
        </DashboardDataProvider>
      </ProfileProvider>
    </BrowserRouter>
  )
}
