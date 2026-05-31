import { useNavigate } from 'react-router-dom';

export default function Orders() {
  const navigate = useNavigate();

  return (
    <div className="account-page">
      <div className="auth-bg">
        <div className="auth-nebula-a" />
        <div className="auth-nebula-b" />
      </div>

      <div className="account-card">
        <div className="account-header">
          <button className="account-back" onClick={() => navigate('/')}>← Back</button>
          <div className="account-title-row">
            <div className="brand-mark" style={{ width: 26, height: 26 }} />
            <h2 className="account-title">Orders</h2>
          </div>
        </div>

        <div className="account-empty">
          <div className="account-empty-icon">📦</div>
          <div className="account-empty-text">No orders yet</div>
          <div className="account-empty-sub">Orders from auctions you&apos;ve won will appear here.</div>
        </div>
      </div>
    </div>
  );
}
