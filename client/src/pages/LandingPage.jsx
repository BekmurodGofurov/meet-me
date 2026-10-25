import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import {
  PeerToPeerIcon,
  ScreenDisplayIcon,
  ChatBubbleIcon,
  ShieldLockIcon,
  LightningIcon,
  CodeBranchIcon,
} from '../components/FeatureIcons'
import { LockIcon, FileTextIcon } from '../components/icons'

const FEATURES = [
  {
    icon: PeerToPeerIcon,
    tag: 'Direct RTP',
    title: 'Peer-to-Peer Media',
    desc: 'Audio and video travel directly between peer browsers with no intermediate media server to decode or store your streams.',
  },
  {
    icon: ScreenDisplayIcon,
    tag: 'Dual Track',
    title: 'Screen Sharing',
    desc: 'Stream high-definition presentations alongside your camera feed simultaneously using isolated dual WebRTC transceivers.',
  },
  {
    icon: ChatBubbleIcon,
    tag: 'Real-Time WS',
    title: 'In-Room Live Chat',
    desc: 'Exchange instant text messages, notes, and auto-linked URLs with all participants over high-speed WebSocket signaling.',
  },
  {
    icon: ShieldLockIcon,
    tag: 'Ephemeral',
    title: 'Private & Account-Free',
    desc: 'No registration, no password, no tracking cookies. Rooms exist only while people are in them and vanish completely afterwards.',
  },
  {
    icon: LightningIcon,
    tag: '< 50ms',
    title: 'Ultra-Low Latency',
    desc: 'Direct decentralized peer connections provide natural, zero-delay conversation without centralized transcoding lag.',
  },
  {
    icon: CodeBranchIcon,
    tag: 'ISC License',
    title: '100% Open Source',
    desc: 'Fully transparent architecture. Inspect the source code, self-host your own signaling relay, or customize without restrictions.',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Create a room',
    desc: 'Click "Start a meeting" to instantly generate a secure 6-character room code and a shareable invite link.',
  },
  {
    num: '02',
    title: 'Share your link',
    desc: 'Send the one-click join URL or room code to teammates, friends, or clients on any modern browser.',
  },
  {
    num: '03',
    title: 'Admit & collaborate',
    desc: 'Review join requests from the waiting room, admit participants with a tap, and enjoy seamless video conferencing.',
  },
]

const HERO_METRICS = [
  { value: '< 50ms', label: 'P2P Latency' },
  { value: '100%', label: 'Browser Encrypted' },
  { value: '0-Sec', label: 'Setup Time' },
  { value: '6 Peers', label: 'Mesh Capacity' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    try {
      window.scrollTo?.(0, 0)
      if (document?.documentElement) document.documentElement.scrollTop = 0
      if (document?.body) document.body.scrollTop = 0
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 160)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="landing">
      {/* Sticky Top Header on scroll */}
      <header
        className={`landing__sticky-nav ${scrolled ? 'is-visible' : ''}`}
        aria-hidden={!scrolled}
      >
        <div className="landing__sticky-nav-inner">
          <div
            className="landing__nav-logo"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ cursor: 'pointer' }}
          >
            <Logo size={28} className="landing__logo-img" />
            <span className="landing__logo-text">Meet Me</span>
          </div>

          <div className="landing__sticky-nav-right">
            <ThemeToggle />
            <button
              className="landing__btn-primary landing__btn-compact"
              onClick={() => navigate('/lobby?action=create')}
            >
              Start a meeting
            </button>
          </div>
        </div>
      </header>

      {/* Main Nav */}
      <nav className="landing__nav">
        <div className="landing__nav-logo">
          <Logo size={36} className="landing__logo-img" />
          <span className="landing__logo-text">Meet Me</span>
        </div>

        <div className="landing__nav-right">
          <ThemeToggle />
        </div>
      </nav>

      {/* Hero */}
      <section className="landing__hero">
        <div className="landing__hero-badge anim-fade-in" style={{ animationDelay: '0.05s' }}>
          <span className="landing__badge-dot" />
          <span>WebRTC 2.0 · End-to-End Encrypted · Open Source</span>
        </div>

        <h1 className="landing__hero-title anim-fade-in" style={{ animationDelay: '0.15s' }}>
          Video calls,<br />
          <span className="landing__hero-accent">no signup needed.</span>
        </h1>

        <p className="landing__hero-sub anim-fade-in" style={{ animationDelay: '0.25s' }}>
          Create a private room, share the link, and collaborate with up to 6 people.
          Audio and video flow directly browser-to-browser with ultra-low latency.
        </p>

        <div className="landing__hero-actions anim-fade-in" style={{ animationDelay: '0.35s' }}>
          <button className="landing__btn-primary" onClick={() => navigate('/lobby?action=create')}>
            Start a meeting
          </button>
          <button className="landing__btn-secondary" onClick={() => navigate('/lobby?action=join')}>
            Join with a code
          </button>
        </div>

        {/* Hero metrics / trust bar */}
        <div className="landing__hero-metrics anim-fade-in" style={{ animationDelay: '0.45s' }}>
          {HERO_METRICS.map((m) => (
            <div key={m.label} className="landing__metric-item">
              <span className="landing__metric-val">{m.value}</span>
              <span className="landing__metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="landing__features">
        <div className="landing__section-header">
          <span className="landing__section-tag">ENGINEERED FOR SPEED</span>
          <h2 className="landing__section-title">Everything you need, nothing you don't</h2>
        </div>

        <div className="landing__features-grid">
          {FEATURES.map((f, idx) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="landing__feature-card anim-card"
                style={{ animationDelay: `${0.1 + idx * 0.08}s` }}
              >
                <div className="landing__feature-top">
                  <div className="landing__feature-icon-box">
                    <Icon width={22} height={22} />
                  </div>
                  <span className="landing__feature-tag">{f.tag}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="landing__how">
        <div className="landing__section-header">
          <span className="landing__section-tag">QUICK ONBOARDING</span>
          <h2 className="landing__section-title">How it works</h2>
        </div>

        <div className="landing__steps">
          {STEPS.map((s, idx) => (
            <div
              key={s.num}
              className="landing__step anim-card"
              style={{ animationDelay: `${0.1 + idx * 0.1}s` }}
            >
              <div className="landing__step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About / Tech */}
      <section className="landing__about">
        <div className="landing__section-header">
          <span className="landing__section-tag">CORE ARCHITECTURE</span>
          <h2 className="landing__section-title">Built on open standards</h2>
        </div>

        <p className="landing__about-text">
          Meet Me uses <strong>WebRTC</strong> for direct peer-to-peer media streams and a lightweight{' '}
          <strong>WebSocket</strong> signaling server for room coordination. Audio, video, and screen
          sharing never touch a central media server — they flow straight between browsers in a full-mesh topology.
        </p>

        <div className="landing__about-badges">
          <span className="landing__about-pill">
            <LightningIcon width={14} height={14} />
            <span>WebSocket Signaling</span>
          </span>
          <span className="landing__about-pill">
            <LockIcon width={14} height={14} />
            <span>Peer-to-Peer Mesh</span>
          </span>
          <span className="landing__about-pill">
            <ShieldLockIcon width={14} height={14} />
            <span>Waiting Room Gatekeeper</span>
          </span>
          <Link to="/license" className="landing__about-pill">
            <FileTextIcon width={14} height={14} />
            <span>ISC License</span>
          </Link>
        </div>

        <a
          href="https://github.com/BekmurodGofurov/meet-me"
          target="_blank"
          rel="noopener noreferrer"
          className="landing__github-link"
        >
          View source code on GitHub →
        </a>
      </section>

      {/* Footer */}
      <footer className="landing__footer">
        <div className="landing__footer-left">
          <Logo size={28} className="landing__logo-img" />
          <span>Meet Me</span>
        </div>
        <div className="landing__footer-links">
          <Link to="/license">ISC License</Link>
          <Link to="/contributing">Contributing</Link>
          <a href="https://github.com/BekmurodGofurov/meet-me" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
        <div className="landing__footer-right">
          © 2026 Bekmurod Gofurov
        </div>
      </footer>
    </div>
  )
}
