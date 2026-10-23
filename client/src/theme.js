import { useState, useEffect } from 'react'

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem('meet-me:theme')
    if (stored === 'light' || stored === 'dark') return stored
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    // Ignore error
  }
  return 'dark'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('meet-me:theme', theme)
  } catch {
    // Ignore error
  }
}

// Immediately apply theme on initial load to avoid flash of wrong theme
if (typeof document !== 'undefined') {
  applyTheme(getInitialTheme())
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggleTheme }
}
