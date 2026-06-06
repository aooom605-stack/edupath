// api/auth/signup-verify.js
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let body = req.body;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch (e) {
      body = {};
    }
  }

  const { otp } = body || {};

  if (!otp) {
    res.status(400).json({ error: 'رمز التحقق مطلوب / OTP is required' });
    return;
  }

  // Parse state cookie
  const cookies = cookie.parse(req.headers.cookie || '');
  const stateToken = cookies.ep_signup_state;

  if (!stateToken) {
    res.status(400).json({ error: 'انتهت صلاحية الجلسة، اطلب رمزاً جديداً / Session expired. Please request a new OTP.' });
    return;
  }

  const sessionSecret = process.env.SESSION_SECRET || "default_session_secret_2026";
  let state = null;

  try {
    state = jwt.verify(stateToken, sessionSecret);
  } catch (err) {
    res.status(400).json({ error: 'رمز أو جلسة غير صالحة. اطلب رمزاً جديداً / Invalid or expired state token.' });
    return;
  }

  // Verify OTP
  if (state.otp.trim() !== otp.trim()) {
    res.status(400).json({ error: 'رمز التحقق غير صحيح / Incorrect verification code' });
    return;
  }

  // OTP is valid! Register the user
  await db.initDb();
  
  // Check if email already exists
  const existingUser = await db.findUserByEmail(state.email);
  const adminEmail = process.env.ADMIN_EMAIL;
  
  if (existingUser || (adminEmail && state.email.toLowerCase() === adminEmail.toLowerCase())) {
    res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل بالفعل / Email already registered' });
    return;
  }

  let newUser;
  try {
    newUser = await db.createUser({
      name: state.name,
      email: state.email,
      password: state.password,
      role: 'user'
    });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في حفظ بيانات المستخدم / Error saving user data' });
    return;
  }

  // Clear state cookie & generate session token
  const sessionToken = jwt.sign(
    { email: newUser.email, name: newUser.name, role: newUser.role },
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

  // Clear ep_signup_state and set ep_session
  res.setHeader('Set-Cookie', [
    cookie.serialize('ep_signup_state', '', { ...cookieOptions, maxAge: 0 }),
    cookie.serialize('ep_session', sessionToken, cookieOptions)
  ]);

  res.status(200).json({ success: true, role: newUser.role });

};
