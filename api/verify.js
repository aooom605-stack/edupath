// api/verify.js
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.ep_session;

  if (!token) {
    res.status(401).json({ authenticated: false, error: 'No session cookie' });
    return;
  }

  const sessionSecret = process.env.SESSION_SECRET || "default_session_secret_2026";

  try {
    const decoded = jwt.verify(token, sessionSecret);
    res.status(200).json({ authenticated: true, user: decoded });
  } catch (err) {
    res.status(401).json({ authenticated: false, error: 'Invalid or expired session token' });
  }
};
