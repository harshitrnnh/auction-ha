import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sync user details to form inputs on mount
  useEffect(() => {
    if (user) {
      setUsername(user.name || '');
      setPhone(user.phone || '');
      setAvatar(user.avatarUrl || '');
    }
  }, [user]);

  const handleAvatarFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Please select an image smaller than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setAvatar(uploadEvent.target.result);
      setError('');
      setSuccess('');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const updates = {
        name: username.trim() || 'User',
        phone: phone.trim() ? phone.trim() : null,
        avatarUrl: avatar,
      };
      if (password) {
        updates.password = password;
      }

      await updateProfile(updates);
      setSuccess('Profile updated successfully!');
      setPassword(''); // Reset password field
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const initials = username
    ? username.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
    : '?';

  return (
    <div className="account-page">
      <div className="auth-bg">
        <div className="auth-nebula-a" />
        <div className="auth-nebula-b" />
      </div>

      <div className="account-card" style={{ maxWidth: '440px' }}>
        <div className="account-header">
          <button className="account-back" onClick={() => navigate('/')}>← Back</button>
          <div className="account-title-row">
            <div className="brand-mark" style={{ width: 26, height: 26 }} />
            <h2 className="account-title">Profile Settings</h2>
          </div>
        </div>

        <form onSubmit={handleSave} className="auth-form" style={{ gap: '18px' }}>
          {/* Avatar block */}
          <div className="account-avatar-block" style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '14px' }}>
            <div style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
              <div className="account-avatar-lg" style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden' }}>
                {avatar ? (
                  <img src={avatar} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <label 
                style={{
                  position: 'absolute',
                  bottom: '-2px',
                  right: '-2px',
                  background: 'var(--gold)',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '9px',
                  color: '#07070c'
                }}
              >
                📷
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarFile} 
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="account-name" style={{ fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div className="account-email" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">Display name</label>
            <input
              className="auth-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); setSuccess(''); }}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Email Address (Read-only)</label>
            <input
              className="auth-input"
              type="email"
              value={user?.email || ''}
              disabled
              style={{ opacity: 0.6, background: 'rgba(0,0,0,0.2)', cursor: 'not-allowed' }}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Mobile Number (For winning reminders)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="auth-input" style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8, background: 'rgba(0,0,0,0.4)', padding: '13px 10px' }}>
                <span style={{ fontSize: 13 }}>🇮🇳</span>
                <span style={{ color: 'var(--txt-dim)', fontSize: 14, fontWeight: 500 }}>+91</span>
              </div>
              <input
                className="auth-input"
                style={{ flex: 1, letterSpacing: '0.05em' }}
                type="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); setSuccess(''); }}
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">New Password (Optional)</label>
            <input
              className="auth-input"
              type="password"
              placeholder="Min. 6 characters (Optional)"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); setSuccess(''); }}
              minLength={6}
            />
          </div>

          {error && <div className="auth-error"><span>⚠</span> {error}</div>}
          
          {success && (
            <div className="auth-error" style={{ background: 'rgba(95,214,160,0.1)', border: '1px solid rgba(95,214,160,0.3)', color: 'var(--win)' }}>
              <span>✓</span> {success}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading} style={{ marginTop: '6px' }}>
            {loading ? 'Saving Changes…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
