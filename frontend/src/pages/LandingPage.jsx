import { useLayoutEffect, useRef } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  MessageCircle,
  Mic,
  MonitorUp,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Wifi,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const features = [
  {
    icon: MessageCircle,
    title: 'Conversations that flow',
    description:
      'Keep team chats organized, share ideas in real time, and find the details you need without the noise.',
  },
  {
    icon: Video,
    title: 'Face-to-face, from anywhere',
    description:
      'Bring everyone into the same room with simple video meetings built right into your workspace.',
  },
  {
    icon: ShieldCheck,
    title: 'Your team, in sync',
    description:
      'Know who is around, stay close to the work, and keep your team connected throughout the day.',
  },
];

function LandingPage() {
  const landingRef = useRef(null);

  useLayoutEffect(() => {
    const root = landingRef.current;
    if (
      !root ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      return undefined;
    }

    let observer;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 },
      );
      root.classList.add('landing-page--motion-ready');
      root.querySelectorAll('[data-scroll-reveal]').forEach((element) => observer.observe(element));
    } catch {
      root.classList.remove('landing-page--motion-ready');
      observer?.disconnect();
    }

    return () => {
      observer?.disconnect();
      root.classList.remove('landing-page--motion-ready');
    };
  }, []);

  return (
    <div ref={landingRef} className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="Nexora home">
            <img src="/icons/CorpTalk-Logo.png" alt="" />
          </Link>

          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#features" style={{ '--landing-delay': '120ms' }}>
              Features
            </a>
            <a href="#why-nexora" style={{ '--landing-delay': '220ms' }}>
              Why Nexora
            </a>
          </nav>

          <div className="landing-header-actions">
            <Link className="landing-login" to="/login" style={{ '--landing-delay': '260ms' }}>
              Log in
            </Link>
            <Link
              className="landing-button landing-button-small"
              to="/signup"
              style={{ '--landing-delay': '340ms' }}
            >
              Sign up free <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow landing-hero-eyebrow">
              <span className="landing-eyebrow-dot" />A better way to work together
            </p>
            <h1 className="landing-hero-title">
              Great teams start with a <span>good conversation.</span>
            </h1>
            <p className="landing-hero-description landing-hero-description-enter">
              Bring your people, messages, and meetings together in one calm, connected workspace.
              Less back and forth. More moving forward.
            </p>
            <div className="landing-hero-actions">
              <Link
                className="landing-button landing-hero-primary"
                to="/signup"
                style={{ '--landing-delay': '560ms' }}
              >
                Get started for free <ArrowRight size={18} />
              </Link>
              <a
                className="landing-text-link landing-hero-secondary"
                href="#features"
                style={{ '--landing-delay': '680ms' }}
              >
                See what you can do <ArrowDown size={16} />
              </a>
            </div>
            <div className="landing-proof landing-proof-enter">
              <div className="landing-proof-avatars" aria-hidden="true">
                <span style={{ '--landing-delay': '790ms' }}>AR</span>
                <span style={{ '--landing-delay': '850ms' }}>JM</span>
                <span style={{ '--landing-delay': '910ms' }}>SK</span>
                <span style={{ '--landing-delay': '970ms' }}>+</span>
              </div>
              <p style={{ '--landing-delay': '850ms' }}>
                Made for teams that <strong>make things happen.</strong>
              </p>
            </div>
          </div>

          <div className="landing-visual" aria-label="Nexora video meeting preview">
            <div className="landing-visual-orbit landing-visual-orbit-one" />
            <div className="landing-visual-orbit landing-visual-orbit-two" />
            <div className="landing-meeting">
              <div className="landing-meeting-topbar">
                <div className="landing-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="landing-meeting-title">
                  <span /> Product sync
                </span>
                <span className="landing-meeting-time">10:24</span>
              </div>
              <div className="landing-meeting-content">
                <div className="landing-video-tile landing-video-main">
                  <div className="landing-person landing-person-one">AM</div>
                  <div className="landing-participant-label">
                    <span className="landing-speaking-indicator" />
                    Alex Morgan
                  </div>
                </div>
                <div className="landing-video-tile landing-video-side landing-video-side-one">
                  <div className="landing-person landing-person-two">JD</div>
                  <div className="landing-participant-label">Jamie D.</div>
                </div>
                <div className="landing-video-tile landing-video-side landing-video-side-two">
                  <div className="landing-person landing-person-three">SK</div>
                  <div className="landing-participant-label">Sam Kim</div>
                </div>
                <div className="landing-screen-share">
                  <div className="landing-screen-top">
                    <span>SPRINT PLANNING</span>
                    <span>01 / 04</span>
                  </div>
                  <div className="landing-screen-copy">
                    A clearer plan.
                    <br />A closer team.
                  </div>
                  <div className="landing-screen-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="landing-screen-tag">
                    <Sparkles size={12} /> Shared by Alex
                  </div>
                </div>
              </div>
              <div className="landing-call-controls" aria-hidden="true">
                <span>
                  <Mic size={16} />
                </span>
                <span>
                  <Video size={16} />
                </span>
                <span>
                  <MonitorUp size={16} />
                </span>
                <span className="landing-call-end">
                  <Phone size={16} />
                </span>
              </div>
              <div className="landing-meeting-toast">
                <span className="landing-toast-icon">
                  <Check size={15} />
                </span>
                <span>
                  <strong>Everyone’s here</strong>
                  <small>4 teammates in this meeting</small>
                </span>
              </div>
            </div>
            <div className="landing-floating-note">
              <span>
                <Wifi size={16} />
              </span>
              Always in sync
            </div>
          </div>
        </section>

        <section className="landing-benefits" id="why-nexora">
          <div
            className="landing-benefit"
            data-scroll-reveal
            style={{ '--reveal-delay': '0ms' }}
          >
            <span className="landing-benefit-icon">
              <Users size={20} />
            </span>
            <div>
              <strong>One space for your people</strong>
              <span>Stay close, wherever work happens.</span>
            </div>
          </div>
          <div
            className="landing-benefit"
            data-scroll-reveal
            style={{ '--reveal-delay': '110ms' }}
          >
            <span className="landing-benefit-icon">
              <CalendarDays size={20} />
            </span>
            <div>
              <strong>Less switching, more doing</strong>
              <span>Chat and meet without missing a beat.</span>
            </div>
          </div>
          <div
            className="landing-benefit"
            data-scroll-reveal
            style={{ '--reveal-delay': '220ms' }}
          >
            <span className="landing-benefit-icon">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Built around your team</strong>
              <span>A workspace that feels easy from day one.</span>
            </div>
          </div>
        </section>

        <section className="landing-features" id="features">
          <div className="landing-section-heading">
            <p
              className="landing-eyebrow"
              data-scroll-reveal
              style={{ '--reveal-delay': '0ms' }}
            >
              Everything connects
            </p>
            <h2 data-scroll-reveal style={{ '--reveal-delay': '90ms' }}>
              Work feels better <span>when it comes together.</span>
            </h2>
            <p data-scroll-reveal style={{ '--reveal-delay': '180ms' }}>
              All the ways your team connects, in one easy place.
            </p>
          </div>
          <div className="landing-feature-grid">
            {features.map(({ icon: Icon, title, description }, index) => (
              <article
                className="landing-feature-card"
                data-scroll-reveal
                style={{ '--reveal-delay': `${index * 120}ms` }}
                key={title}
              >
                <div className={`landing-feature-icon landing-feature-icon-${index + 1}`}>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                <Link to="/signup" aria-label={`Get started: ${title}`}>
                  Explore Nexora <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta" data-scroll-reveal>
          <div className="landing-cta-sparkle" data-scroll-reveal>
            <Sparkles size={21} />
          </div>
          <div>
            <p className="landing-eyebrow" data-scroll-reveal style={{ '--reveal-delay': '70ms' }}>
              Your team’s next chapter
            </p>
            <h2 data-scroll-reveal style={{ '--reveal-delay': '150ms' }}>
              Make room for better conversations.
            </h2>
            <p data-scroll-reveal style={{ '--reveal-delay': '230ms' }}>
              Bring your team together with Nexora. It starts with one click.
            </p>
          </div>
          <Link
            className="landing-button landing-button-light landing-cta-button"
            to="/signup"
            data-scroll-reveal
            data-reveal-from="right"
            style={{ '--reveal-delay': '300ms' }}
          >
            Create your free account <ArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <Link to="/" className="landing-brand" aria-label="Nexora home">
            <img src="/icons/CorpTalk-Logo.png" alt="" />
          </Link>
          <p>Good conversations make great teams.</p>
          <div className="landing-footer-links">
            <a href="#features">Features</a>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Create an account</Link>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} Developer Station 25</span>
          <span>Made for teams, wherever they work.</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
