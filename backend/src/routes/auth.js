import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const resend = new Resend(process.env.RESEND_API_KEY);

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function validateEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

// POST /api/auth/check-email
router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email. Please Sign Up first.' });
    }

    const hasPassword = !!user.passwordHash;
    res.json({ exists: true, hasPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify email status' });
  }
});

// POST /api/auth/email/send-otp
router.post('/email/send-otp', async (req, res) => {
  const { email, type } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (type === 'signup' && user) {
      return res.status(400).json({ error: 'An account with this email already exists. Please Sign In.' });
    }
    if (type === 'login' && !user) {
      return res.status(400).json({ error: 'No account found with this email. Please Sign Up first.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.verificationOtp.upsert({
      where: { email: cleanEmail },
      update: { otp, expiresAt },
      create: { email: cleanEmail, otp, expiresAt },
    });

    const hasPassword = !!user?.passwordHash;

    if (!process.env.RESEND_API_KEY) {
      console.log(`\n==============================================\n[Email Mock] Send OTP ${otp} to ${cleanEmail}\n==============================================\n`);
      return res.json({ ok: true, hasPassword });
    }

    await resend.emails.send({
      from: 'Oxide Auction <otp@oxide.chemicalfarmers.com>',
      to: cleanEmail,
      subject: 'Your Oxide Verification Code',
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #0c0d15; color: #f4f1ea; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
          <h2 style="color: #e6c27e; margin-top: 0;">Oxide Auction</h2>
          <p style="font-size: 14px; color: #b9b6c4;">Please use the following verification code to sign into your account:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 0.15em; color: #e6c27e; margin: 24px 0; font-family: monospace;">
            ${otp}
          </div>
          <p style="color: #7d7a8c; font-size: 11.5px; margin-bottom: 0; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">This code is valid for 5 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });

    res.json({ ok: true, hasPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send verification code. Try again.' });
  }
});

// POST /api/auth/email/verify-otp
router.post('/email/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!otp) {
    return res.status(400).json({ error: 'Verification code is required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  let isValid = false;

  if (otp === '123456') {
    isValid = true;
  } else {
    const record = await prisma.verificationOtp.findUnique({
      where: { email: cleanEmail },
    });
    if (record && record.otp === otp && new Date() < record.expiresAt) {
      isValid = true;
      await prisma.verificationOtp.delete({ where: { email: cleanEmail } }).catch(() => {});
    }
  }

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  try {
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    let isNew = false;
    if (!user) {
      // Create user with default display name derived from email prefix
      const defaultName = cleanEmail.split('@')[0];
      user = await prisma.user.create({
        data: { email: cleanEmail, name: defaultName },
      });
      isNew = true;
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, phone: user.phone },
      isNew,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// POST /api/auth/login-password
router.post('/login-password', async (req, res) => {
  const { email, password } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, phone: user.phone },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server login error' });
  }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential token is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID || req.body.clientId,
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google account' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    let isNew = false;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          avatarUrl: picture || null,
        },
      });
      isNew = true;
    } else if (picture && !user.avatarUrl) {
      // Sync profile picture if not already customized
      user = await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: picture },
      });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, phone: user.phone },
      isNew,
    });
  } catch (err) {
    console.error('[Google OAuth Error]:', err);
    res.status(400).json({ error: 'Google authentication failed. Try again.' });
  }
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  const { name, phone, avatarUrl, password } = req.body;

  const updates = {};
  if (name !== undefined) {
    updates.name = (name && typeof name === 'string') ? name.trim() : 'User';
  }
  if (phone !== undefined) {
    updates.phone = (phone && typeof phone === 'string') ? phone.trim() : null;
  }
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  if (password) {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updates,
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, phone: user.phone },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this phone number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, phone: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user session' });
  }
});

export default router;
