import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API = import.meta.env.VITE_API_URL ?? '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('oxide_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => {
        setToken(null);
        localStorage.removeItem('oxide_token');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const sendEmailOtp = useCallback(async (email, type) => {
    const r = await fetch(`${API}/api/auth/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to send OTP');
    return data;
  }, []);

  const checkEmail = useCallback(async (email) => {
    const r = await fetch(`${API}/api/auth/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to check email');
    return data;
  }, []);

  const verifyEmailOtp = useCallback(async (email, otp) => {
    const r = await fetch(`${API}/api/auth/email/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Verification failed');
    localStorage.setItem('oxide_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const r = await fetch(`${API}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Google login failed');
    localStorage.setItem('oxide_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const loginWithPassword = useCallback(async (email, password) => {
    const r = await fetch(`${API}/api/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('oxide_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const updateProfile = useCallback(async (fields) => {
    if (!token) throw new Error('Not authenticated');
    const r = await fetch(`${API}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update profile');
    setUser(data.user);
    return data;
  }, [token]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('oxide_token');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        sendEmailOtp,
        verifyEmailOtp,
        loginWithGoogle,
        loginWithPassword,
        updateProfile,
        logout,
        checkEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
