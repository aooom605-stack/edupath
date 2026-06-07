// api/videos.js
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

  // PUBLIC READ OPERATION
  if (req.method === 'GET') {
    try {
      const videos = await db.getVideos();
      res.status(200).json(videos);
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve videos' });
    }
    return;
  }

  // PROTECTED WRITE OPERATIONS (Requires Admin Authorization)
  const admin = db.verifyAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized operation. Administrator login required.' });
    return;
  }

  // Add / Edit Video
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = req.body;
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        body = {};
      }
    }

    if (!body.title || !body.youtubeUrl || !body.youtubeId || !body.duration) {
      res.status(400).json({ error: 'Missing required video fields.' });
      return;
    }

    try {
      const saved = await db.saveVideo(body);
      res.status(200).json(saved);
    } catch (err) {
      res.status(500).json({ error: 'Failed to save video: ' + err.message });
    }
    return;
  }

  // Delete Video
  if (req.method === 'DELETE') {
    if (!id) {
      res.status(400).json({ error: 'Missing video id parameter.' });
      return;
    }
    try {
      await db.deleteVideo(id);
      res.status(200).json({ success: true, message: 'Video deleted successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete video: ' + err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
};
