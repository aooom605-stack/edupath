// api/admin.js
const fs = require('fs');
const path = require('path');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.ep_session;
  const sessionSecret = process.env.SESSION_SECRET || "default_session_secret_2026";
  
  let isAdmin = false;
  if (token) {
    try {
      const decoded = jwt.verify(token, sessionSecret);
      if (decoded && decoded.role === 'admin') {
        isAdmin = true;
      }
    } catch (e) {
      // Invalid session token
    }
  }

  if (!isAdmin) {
    res.writeHead(302, { 'Location': '/login?error=unauthorized' });
    return res.end();
  }

  // Serve the admin.html file from a private location
  const filePath = path.join(__dirname, '..', 'private', 'admin.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('خطأ في الخادم الداخلي / Internal Server Error');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    }
  });
};
