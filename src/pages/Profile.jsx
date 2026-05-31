import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user } = useAuth();
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
            <h2 className="account-title">Profile</h2>
          </div>
        </div>

        <div className="account-avatar-block">
          <div className="account-avatar-lg">
            <span>{user?.name?.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') ?? '?'}</span>
          </div>
          <div>
            <div className="account-name">{user?.name}</div>
            <div className="account-email">{user?.email}</div>
          </div>
        </div>

        <div className="account-section-label">Account details</div>
        <div className="account-field-group">
          <div className="account-field">
            <span className="account-field-label">Name</span>
            <span className="account-field-value">{user?.name}</span>
          </div>
          <div className="account-field">
            <span className="account-field-label">Email</span>
            <span className="account-field-value">{user?.email}</span>
          </div>
        </div>

        <div className="account-coming-soon">Full profile editing coming soon.</div>
      </div>
    </div>
  );
}
