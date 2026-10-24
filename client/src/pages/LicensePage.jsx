import { Link } from 'react-router-dom'
import Topbar from '../components/Topbar'
import { CheckIcon, InfoIcon } from '../components/icons'

export default function LicensePage({ connectionStatus }) {
  return (
    <div className="doc-page">
      <Topbar connectionStatus={connectionStatus} roomId={null} />

      <main className="doc-page__container">
        <Link to="/" className="doc-page__back">
          ← Back to Home
        </Link>

        <header className="doc-page__header">
          <span className="doc-page__tag">OPEN SOURCE LICENSE</span>
          <h1 className="doc-page__title">ISC License</h1>
          <p className="doc-page__subtitle">
            Meet-Me is free, open source software licensed under the permissive ISC License.
          </p>
        </header>

        {/* Verbatim License Box */}
        <section className="doc-page__card">
          <div className="doc-page__card-header">
            <span className="doc-page__card-title">Legal Text</span>
            <span className="doc-page__card-badge">SPDX: ISC</span>
          </div>
          <pre className="doc-page__pre">
{`ISC License

Copyright (c) 2026 Bekmurod Gofurov

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`}
          </pre>
        </section>

        {/* Summary Grid */}
        <section className="doc-page__summary">
          <h2 className="doc-page__section-title">License Summary</h2>
          <div className="doc-page__grid">
            <div className="doc-page__grid-item is-allowed">
              <span className="doc-page__check">
                <CheckIcon width={15} height={15} />
              </span>
              <div>
                <strong>Commercial Use</strong>
                <p>You can use this software and derivatives for commercial purposes without royalty fees.</p>
              </div>
            </div>
            <div className="doc-page__grid-item is-allowed">
              <span className="doc-page__check">
                <CheckIcon width={15} height={15} />
              </span>
              <div>
                <strong>Modification</strong>
                <p>You may modify, alter, or extend any part of the codebase to suit your needs.</p>
              </div>
            </div>
            <div className="doc-page__grid-item is-allowed">
              <span className="doc-page__check">
                <CheckIcon width={15} height={15} />
              </span>
              <div>
                <strong>Distribution</strong>
                <p>You can share, distribute, or bundle original or modified versions.</p>
              </div>
            </div>
            <div className="doc-page__grid-item is-condition">
              <span className="doc-page__check">
                <InfoIcon width={15} height={15} />
              </span>
              <div>
                <strong>Notice Requirement</strong>
                <p>The copyright and permission notice must appear in all copies of the software.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="doc-page__footer-nav">
          <Link to="/contributing" className="doc-page__link-btn">
            View Contributing Guidelines →
          </Link>
          <Link to="/lobby?action=create" className="doc-page__primary-btn">
            Start a meeting
          </Link>
        </footer>
      </main>
    </div>
  )
}
