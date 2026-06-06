// api/auth/login.js
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
require('dotenv').config();

// Define input validation schema
const loginSchema = z.object({
  email: z.string().email({ message: 'صيغة البريد الإلكتروني غير صحيحة / Invalid email format' }),
  password: z.string().min(1, { message: 'كلمة المرور مطلوبة / Password is required' })
});

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Ensure body parsing if not already parsed
  let body = req.body;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch (e) {
      body = {};
    }
  }

  // Validate inputs
  const validation = loginSchema.safeParse(body || {});
  if (!validation.success) {
    const errorMessages = validation.error.errors.map(err => err.message).join(' | ');
    res.status(400).json({ error: errorMessages });
    return;
  }

  const { email, password } = validation.data;

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || "edupath2025";
  const sessionSecret = process.env.SESSION_SECRET || "default_session_secret_2026";

  let authenticatedUser = null;

  // 1. Verify against Environment Variables
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
    authenticatedUser = { email: adminEmail, name: 'Admin', role: 'admin' };
  } else {
    // 2. Verify against database (MongoDB / users.json)
    await db.initDb();
    const foundUser = await db.findUserByEmail(email);
    if (foundUser && await db.comparePassword(password, foundUser.password)) {
      authenticatedUser = { email: foundUser.email, name: foundUser.name, role: foundUser.role };
    }
  }

  if (authenticatedUser) {
    const token = jwt.sign(
      authenticatedUser,
      sessionSecret,
      { expiresIn: '24h' }
    );

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60
    };

    res.setHeader('Set-Cookie', cookie.serialize('ep_session', token, cookieOptions));
    res.status(200).json({ success: true, role: authenticatedUser.role });
  } else {
    res.status(401).json({ error: 'بيانات خاطئة. حاول مرة أخرى / Incorrect email or password.' });
  }
};
