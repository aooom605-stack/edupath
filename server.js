// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Import database utility and initialize
const db = require('./api/db');
db.initDb().then(isMongo => {
  if (isMongo) {
    console.log('Database initialized successfully with MongoDB.');
  } else {
    console.log('Database initialized with local JSON fallback.');
  }
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// Import serverless handlers
const loginHandler = require('./api/auth/login');
const logoutHandler = require('./api/auth/logout');
const verifyHandler = require('./api/verify');
const signupRequestHandler = require('./api/auth/signup-request');
const signupVerifyHandler = require('./api/auth/signup-verify');
const adminHandler = require('./api/admin');
const coursesHandler = require('./api/courses');
const videosHandler = require('./api/videos');
const commentsHandler = require('./api/comments');

const server = http.createServer((req, res) => {
  // Helper to serve static files
  const serveStaticFile = (filePath, contentType = 'text/html') => {
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('خطأ في الخادم الداخلي / Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  };

  // Decorate response object with serverless helper methods
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (data) {
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(data));
    return this;
  };
  res.redirect = function (url) {
    this.writeHead(302, { 'Location': url });
    this.end();
    return this;
  };

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Read request body for POST/PUT methods
  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    req.body = body;

    // ROUTING

    // API Handlers
    if (pathname === '/api/auth/login') {
      return loginHandler(req, res);
    }
    if (pathname === '/api/auth/logout') {
      return logoutHandler(req, res);
    }
    if (pathname === '/api/verify') {
      return verifyHandler(req, res);
    }
    if (pathname === '/api/auth/signup-request') {
      return signupRequestHandler(req, res);
    }
    if (pathname === '/api/auth/signup-verify') {
      return signupVerifyHandler(req, res);
    }
    if (pathname === '/api/admin') {
      return adminHandler(req, res);
    }
    if (pathname === '/api/courses') {
      return coursesHandler(req, res);
    }
    if (pathname === '/api/videos') {
      return videosHandler(req, res);
    }
    if (pathname === '/api/comments') {
      return commentsHandler(req, res);
    }

    // Static Frontend routes
    if (pathname === '/' || pathname === '/index.html') {
      return serveStaticFile(path.join(__dirname, 'public', 'index.html'));
    }
    if (pathname === '/admin' || pathname === '/admin.html') {
      return adminHandler(req, res);
    }
    if (pathname === '/login') {
      return serveStaticFile(path.join(__dirname, 'public', 'login.html'));
    }
    if (pathname === '/signup') {
      return serveStaticFile(path.join(__dirname, 'public', 'signup.html'));
    }
    if (pathname === '/assets/app.js') {
      return serveStaticFile(path.join(__dirname, 'public', 'assets', 'app.js'), 'application/javascript');
    }

    // Fallback for other files inside public/
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const localFilePath = path.join(__dirname, 'public', safePath);

    fs.stat(localFilePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const ext = path.extname(localFilePath).toLowerCase();
        let contentType = 'text/plain';
        if (ext === '.html') contentType = 'text/html';
        else if (ext === '.css') contentType = 'text/css';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.json') contentType = 'application/json';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.svg') contentType = 'image/svg+xml';
        else if (ext === '.ico') contentType = 'image/x-icon';

        return serveStaticFile(localFilePath, contentType);
      }

      // If file not found, return 404
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - الصفحة غير موجودة / Page Not Found</h1>');
    });
  });
});

server.listen(PORT, () => {
  console.log(`EduPath dev server is running at http://localhost:${PORT}`);
});
