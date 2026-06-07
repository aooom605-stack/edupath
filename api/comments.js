// api/comments.js
const db = require('./db');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  await db.initDb();

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = parsedUrl.searchParams.get('id');

  // 1. PUBLIC READ OPERATION
  if (req.method === 'GET') {
    try {
      const comments = await db.getComments();
      res.status(200).json(comments);
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve comments' });
    }
    return;
  }

  // Parse Body
  let body = req.body;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch (e) {
      body = {};
    }
  }

  // 2. PUBLIC ADD COMMENT (No Admin Role Required)
  if (req.method === 'POST' && (!body.id || !body.status)) {
    if (!body.studentName || !body.text || !body.videoTitle) {
      res.status(400).json({ error: 'Missing required comment fields.' });
      return;
    }
    try {
      const saved = await db.saveComment({
        studentName: body.studentName,
        text: body.text,
        videoTitle: body.videoTitle,
        status: 'pending' // Default status for student submissions
      });
      res.status(200).json(saved);
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit comment: ' + err.message });
    }
    return;
  }

  // PROTECTED OPERATIONS (Requires Admin Authorization)
  const admin = db.verifyAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized operation. Administrator login required.' });
    return;
  }

  // 3. ADMIN MODIFY COMMENT (e.g. Approve)
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!body.id || !body.status) {
      res.status(400).json({ error: 'Missing comment id or status fields.' });
      return;
    }
    try {
      const saved = await db.saveComment(body);
      res.status(200).json(saved);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update comment: ' + err.message });
    }
    return;
  }

  // 4. ADMIN DELETE COMMENT
  if (req.method === 'DELETE') {
    if (!id) {
      res.status(400).json({ error: 'Missing comment id parameter.' });
      return;
    }
    try {
      await db.deleteComment(id);
      res.status(200).json({ success: true, message: 'Comment deleted successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete comment: ' + err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
};
