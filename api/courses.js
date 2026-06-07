// api/courses.js
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
      const courses = await db.getCourses();
      res.status(200).json(courses);
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve courses' });
    }
    return;
  }

  // PROTECTED WRITE OPERATIONS (Requires Admin Authorization)
  const admin = db.verifyAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized operation. Administrator login required.' });
    return;
  }

  // Add / Edit Course
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = req.body;
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        body = {};
      }
    }

    if (!body.name || !body.category || !body.level || !body.duration || !body.icon) {
      res.status(400).json({ error: 'Missing required course fields.' });
      return;
    }

    try {
      const saved = await db.saveCourse(body);
      res.status(200).json(saved);
    } catch (err) {
      res.status(500).json({ error: 'Failed to save course: ' + err.message });
    }
    return;
  }

  // Delete Course
  if (req.method === 'DELETE') {
    if (!id) {
      res.status(400).json({ error: 'Missing course id parameter.' });
      return;
    }
    try {
      await db.deleteCourse(id);
      
      // Also unlink related videos to match the frontend warning
      const videos = await db.getVideos();
      for (const v of videos) {
        if (v.courseId === id) {
          v.courseId = '';
          await db.saveVideo(v);
        }
      }

      res.status(200).json({ success: true, message: 'Course deleted and related videos unlinked.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete course: ' + err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
};
