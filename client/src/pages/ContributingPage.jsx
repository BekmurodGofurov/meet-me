import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Topbar from '../components/Topbar'

export default function ContributingPage({ connectionStatus }) {
  useEffect(() => {
    try {
      window.scrollTo?.(0, 0)
      if (document?.documentElement) document.documentElement.scrollTop = 0
      if (document?.body) document.body.scrollTop = 0
    } catch {
      // Ignore
    }
  }, [])

  return (
    <div className="doc-page">
      <Topbar connectionStatus={connectionStatus} roomId={null} />

      <main className="doc-page__container">
        <Link to="/" className="doc-page__back">
          ← Back to Home
        </Link>

        <header className="doc-page__header">
          <span className="doc-page__tag">DEVELOPMENT & COMMUNITY</span>
          <h1 className="doc-page__title">Contributing to Meet-Me</h1>
          <p className="doc-page__subtitle">
            We welcome contributions, bug reports, and suggestions from everyone in the community!
          </p>
        </header>

        {/* Code of Conduct */}
        <section className="doc-page__section">
          <h2 className="doc-page__section-title">Code of Conduct</h2>
          <p className="doc-page__text">
            Please maintain a respectful, inclusive, and professional environment for everyone.
            Be constructive in code reviews and discussions.
          </p>
        </section>

        {/* Getting Started */}
        <section className="doc-page__section">
          <h2 className="doc-page__section-title">Getting Started</h2>
          <ol className="doc-page__steps-list">
            <li>
              <strong>Fork & clone the repository</strong>
              <pre className="doc-page__code-block">
{`git clone https://github.com/BekmurodGofurov/meet-me.git
cd meet-me`}
              </pre>
            </li>
            <li>
              <strong>Install dependencies</strong> for all project packages:
              <pre className="doc-page__code-block">
{`npm --prefix backend install
npm --prefix client install
npm --prefix e2e install`}
              </pre>
            </li>
          </ol>
        </section>

        {/* Development Workflow */}
        <section className="doc-page__section">
          <h2 className="doc-page__section-title">Development Workflow</h2>
          <ul className="doc-page__rules-list">
            <li>
              <strong>Branching:</strong> Create descriptive feature branches from <code>main</code>:
              <pre className="doc-page__code-block">
{`git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/your-bug-fix`}
              </pre>
            </li>
            <li>
              <strong>Architecture Principles:</strong>
              <ul>
                <li>Keep the WebSocket signaling layer completely separate from WebRTC media streaming.</li>
                <li>Preserve message contracts between client and backend.</li>
                <li>Support both Dark and Light theme modes.</li>
              </ul>
            </li>
            <li>
              <strong>Run Tests before committing:</strong>
              <pre className="doc-page__code-block">
{`# Backend unit & integration tests
npm --prefix backend test

# Client unit tests & linting
npm --prefix client test
npm --prefix client run lint

# End-to-end Playwright tests
npm --prefix e2e test`}
              </pre>
            </li>
            <li>
              <strong>Conventional Commits:</strong> Format your commit messages clearly:
              <pre className="doc-page__code-block">
{`git commit -m "feat(scope): concise description of changes"
git commit -m "fix(scope): description of bug resolved"`}
              </pre>
            </li>
          </ul>
        </section>

        {/* Reporting Issues */}
        <section className="doc-page__section">
          <h2 className="doc-page__section-title">Reporting Issues</h2>
          <p className="doc-page__text">
            If you encounter bugs, regressions, or unexpected behavior:
          </p>
          <ul className="doc-page__bullets">
            <li>Provide clear reproduction steps and error logs.</li>
            <li>Include your browser name, browser version, and operating system.</li>
            <li>Check for existing reports before opening a new issue.</li>
          </ul>
        </section>

        <footer className="doc-page__footer-nav">
          <Link to="/license" className="doc-page__link-btn">
            View License (ISC) →
          </Link>
          <Link to="/lobby?action=create" className="doc-page__primary-btn">
            Start a meeting
          </Link>
        </footer>
      </main>
    </div>
  )
}
