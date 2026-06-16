import { Link } from 'react-router-dom';
import Starfield from '../components/Starfield';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import UserMenu from '../components/UserMenu';

export default function HowItWorks() {
  const { user, logout } = useAuth();

  return (
    <div className="how-it-works-page">
      <SEO page="how-it-works" />
      <Starfield />

      <header className="how-it-works-topbar">
        <div className="brand">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit' }}>
            <img src="/favicon.png" className="brand-mark" style={{ background: 'none', boxShadow: 'none' }} alt="" />
            <div>
              <div className="brand-name">Oxide</div>
              <div className="brand-sub">How it works</div>
            </div>
          </Link>
          {user ? (
            <UserMenu user={user} logout={logout} />
          ) : (
            <Link className="pill auth-pill" to="/login">Sign in</Link>
          )}
        </div>
        <div className="topbar-right">
          <Link className="pill" to="/">
            Back to live room
          </Link>
        </div>
      </header>

      <main className="how-it-works-content">
        <h1 className="page-title">How the Auction Works</h1>
        <p className="page-subtitle">A simple guide to our daily autonomous AI art tee drops.</p>

        <div className="explanation-grid">
          <div className="info-card">
            <div className="card-icon">🤖</div>
            <h3>Autonomous AI Creation</h3>
            <p>
              Every day, the Oxide system autonomously pulls global data signals—weird news headlines, Wikipedia top searches, music charts, and trending prediction markets. 
              Using these signals, it synthesizes an interpretive prompt to generate a completely unique, high-resolution piece of art.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">⏳</div>
            <h3>18-Hour Active Bidding</h3>
            <p>
              Each daily drop starts a live bidding session lasting exactly <strong>18 hours</strong>. 
              Anyone can bid in real-time to win the physical piece.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">📈</div>
            <h3>Bid Raise Logic</h3>
            <p>
              When placing a bid, your bid must be at least the current bid plus the minimum required increment (e.g. +₹50). 
              This increment updates dynamically based on bidding activity. If you're outbid, you will receive real-time notifications to raise your bid.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">🏆</div>
            <h3>Winning &amp; The 2-Hour Window</h3>
            <p>
              When the 18-hour auction ends, the highest bidder wins the lot. 
              The winner has a strict <strong>2-hour payment window</strong> to complete checkout. 
              If unpaid, the link is sent to the 2nd highest bidder for 2 hours, and then the 3rd.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">🔄</div>
            <h3>The 24-Hour Reset Cycle</h3>
            <p>
              After the 18-hour bidding concludes, a 6-hour payment settlement window occurs. 
              Immediately after this window ends, the daily auction resets and the AI launches a fresh, newly synthesized drop for the next day.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">👕</div>
            <h3>1-of-1 Organic Cotton Print</h3>
            <p>
              The winning artwork is printed onto a single, heavyweight 220 GSM organic cotton t-shirt. 
              This is a true <strong>1-of-1 edition</strong>. Once a daily lot is settled or passed, it will never be printed or auctioned again.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
