import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const ADMIN_EMAILS = ['harshit.rnnh@gmail.com', 'prabhat1992@gmail.com'];

const MENU_ITEMS = [
  { label: 'Profile', path: '/profile', icon: '👤' },
  { label: 'Orders', path: '/orders', icon: '📦' },
  { label: 'Addresses', path: '/addresses', icon: '📍' },
];

export default function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = (path) => { setOpen(false); navigate(path); };
  const initials = getInitials(user.name);

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="brand-mark user-avatar"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="user-avatar-img" />
        ) : (
          <span className="user-avatar-initials">{initials}</span>
        )}
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <div className="user-dropdown-name">{user.name}</div>
            {user.email && <div className="user-dropdown-email">{user.email}</div>}
          </div>

          <div className="user-dropdown-divider" />

          {MENU_ITEMS.map(({ label, path, icon }) => (
            <button key={path} className="user-dropdown-item" onClick={() => go(path)}>
              <span className="user-dropdown-icon">{icon}</span>
              {label}
            </button>
          ))}

          {ADMIN_EMAILS.includes(user.email) && (
            <>
              <div className="user-dropdown-divider" />
              <button className="user-dropdown-item" onClick={() => go('/admin')}>
                <span className="user-dropdown-icon">⚙</span>
                Admin
              </button>
            </>
          )}

          <div className="user-dropdown-divider" />

          <button
            className="user-dropdown-item user-dropdown-signout"
            onClick={() => { logout(); setOpen(false); }}
          >
            <span className="user-dropdown-icon">↩</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
