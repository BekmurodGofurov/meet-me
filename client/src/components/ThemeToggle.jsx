import { SunIcon, MoonIcon } from './FeatureIcons'
import { useTheme } from '../theme'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <SunIcon className="theme-toggle-icon theme-toggle-icon--sun" />
      ) : (
        <MoonIcon className="theme-toggle-icon theme-toggle-icon--moon" />
      )}
    </button>
  )
}
