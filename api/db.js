// api/db.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const USERS_DB_PATH = path.join(__dirname, '..', 'users.json');
const COURSES_DB_PATH = path.join(__dirname, '..', 'courses.json');
const VIDEOS_DB_PATH = path.join(__dirname, '..', 'videos.json');
const COMMENTS_DB_PATH = path.join(__dirname, '..', 'comments.json');

// Mongoose connection state & models
let isConnected = false;
let UserModel = null;
let CourseModel = null;
let VideoModel = null;
let CommentModel = null;

// File locking/queueing mechanism
let dbQueue = Promise.resolve();

function runInQueue(operation) {
  return new Promise((resolve, reject) => {
    dbQueue = dbQueue.then(async () => {
      try {
        const result = await operation();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ----------------------------------------------------
// SCHEMAS DEFINITIONS
// ----------------------------------------------------

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const courseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true },
  level: { type: String, required: true },
  duration: { type: String, required: true },
  price: { type: Number, default: 0 },
  icon: { type: String, required: true },
  status: { type: String, default: 'published' }
});

const videoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  youtubeUrl: { type: String, required: true },
  youtubeId: { type: String, required: true },
  courseId: { type: String },
  order: { type: Number, default: 1 },
  duration: { type: String },
  status: { type: String, default: 'published' },
  dateAdded: { type: String }
});

const commentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  studentName: { type: String, required: true },
  text: { type: String, required: true },
  videoTitle: { type: String, required: true },
  date: { type: String },
  status: { type: String, default: 'pending' }
});

// ----------------------------------------------------
// DEFAULT SEED DATA
// ----------------------------------------------------

const defaultCourses = [
  { id: "c1", name: "Python للمبتدئين", description: "تعلم بايثون من الصفر", category: "Programming", level: "مبتدئ", duration: "8 ساعات", price: 0, icon: "fa-brands fa-python", status: "published" },
  { id: "c2", name: "JavaScript الحديث", description: "احترف الجافاسكريبت الحديثة", category: "Programming", level: "متوسط", duration: "12 ساعة", price: 299, icon: "fa-brands fa-js", status: "published" },
  { id: "c3", name: "Excel الاحترافي", description: "احترف برنامج اكسل بالكامل", category: "Office", level: "مبتدئ", duration: "6 ساعات", price: 199, icon: "fa-solid fa-file-excel", status: "published" },
  { id: "c4", name: "SQL وقواعد البيانات", description: "تعلم SQL وقواعد البيانات", category: "Data", level: "متقدم", duration: "14 ساعة", price: 349, icon: "fa-solid fa-database", status: "draft" },
  { id: "c5", name: "تصميم UI/UX بـ Figma", description: "تعلم واجهات المستخدم بفيجما", category: "Design", level: "متوسط", duration: "10 ساعات", price: 249, icon: "fa-brands fa-figma", status: "published" }
];

const defaultVideos = [
  { id: "v1", title: "مقدمة إلى Python للمبتدئين", description: "شرح مبسط للبداية مع لغة بايثون وتثبيت بيئة العمل.", youtubeUrl: "https://www.youtube.com/watch?v=kqtD5dpn9C8", youtubeId: "kqtD5dpn9C8", courseId: "c1", order: 1, duration: "14:22", status: "published", dateAdded: "2026-06-01" },
  { id: "v2", title: "المتغيرات وأنواع البيانات في Python", description: "فهم المتغيرات وأنواع البيانات الأساسية وطريقة استخدامها.", youtubeUrl: "https://www.youtube.com/watch?v=Z1Yd7upQsXY", youtubeId: "Z1Yd7upQsXY", courseId: "c1", order: 2, duration: "18:05", status: "published", dateAdded: "2026-06-02" },
  { id: "v3", title: "مقدمة إلى JavaScript", description: "أساسيات لغة جافا سكريبت وكيفية تشغيلها في المتصفح.", youtubeUrl: "https://www.youtube.com/watch?v=W6NZfCO5SIk", youtubeId: "W6NZfCO5SIk", courseId: "c2", order: 1, duration: "22:10", status: "published", dateAdded: "2026-06-03" },
  { id: "v4", title: "المصفوفات والكائنات في JavaScript", description: "شرح التعامل مع المصفوفات Arrays والكائنات Objects بالتفصيل.", youtubeUrl: "https://www.youtube.com/watch?v=oigfaZ5ApsM", youtubeId: "oigfaZ5ApsM", courseId: "c2", order: 2, duration: "16:48", status: "published", dateAdded: "2026-06-04" },
  { id: "v5", title: "Excel للمبتدئين — الدرس الأول", description: "شرح واجهة برنامج اكسل والتعامل مع الخلايا والجداول.", youtubeUrl: "https://www.youtube.com/watch?v=rwbho0CgEkE", youtubeId: "rwbho0CgEkE", courseId: "c3", order: 1, duration: "11:30", status: "published", dateAdded: "2026-06-04" },
  { id: "v6", title: "المعادلات الأساسية في Excel", description: "كتابة المعادلات والعمليات الحسابية البسيطة والجمع التلقائي.", youtubeUrl: "https://www.youtube.com/watch?v=BoJPFqnRBDs", youtubeId: "BoJPFqnRBDs", courseId: "c3", order: 2, duration: "19:15", status: "published", dateAdded: "2026-06-05" },
  { id: "v7", title: "SQL — استعلامات SELECT المتقدمة", description: "شرح جلب البيانات وتصفيتها باستخدام جمل SQL المتقدمة.", youtubeUrl: "https://www.youtube.com/watch?v=7S_tz1z_5bA", youtubeId: "7S_tz1z_5bA", courseId: "c4", order: 1, duration: "25:40", status: "draft", dateAdded: "2026-06-05" },
  { id: "v8", title: "تصميم الـ UI بـ Figma — البداية", description: "تثبيت فيجما والتعامل مع الأدوات الأساسية والـ Frames.", youtubeUrl: "https://www.youtube.com/watch?v=FTFaQWZBqQ8", youtubeId: "FTFaQWZBqQ8", courseId: "c5", order: 1, duration: "20:00", status: "draft", dateAdded: "2026-06-06" }
];

const defaultComments = [
  { id: "com1", studentName: "أحمد محمد", text: "شرح ممتاز جداً، استفدت كتير!", videoTitle: "مقدمة إلى Python للمبتدئين", date: "2026-06-06", status: "pending" },
  { id: "com2", studentName: "سارة أحمد", text: "متى هيتضاف الجزء التاني؟", videoTitle: "Excel للمبتدئين — الدرس الأول", date: "2026-06-06", status: "pending" },
  { id: "com3", studentName: "كريم حسن", text: "أفضل كورس JavaScript شوفته", videoTitle: "مقدمة إلى JavaScript", date: "2026-06-05", status: "approved" },
  { id: "com4", studentName: "منى إبراهيم", text: "الصوت في الفيديو مش واضح", videoTitle: "SQL — استعلامات SELECT المتقدمة", date: "2026-06-04", status: "pending" },
  { id: "com5", studentName: "عمر عبدالله", text: "محتاج مزيد من التفاصيل", videoTitle: "تصميم الـ UI بـ Figma — البداية", date: "2026-06-03", status: "approved" },
  { id: "com6", studentName: "ليلى محمود", text: "شكراً على المحتوى الرائع!", videoTitle: "المتغيرات وأنواع البيانات في Python", date: "2026-06-02", status: "approved" }
];

// ----------------------------------------------------
// DATABASE INITIALIZATION
// ----------------------------------------------------

async function initDb() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      if (!isConnected) {
        await mongoose.connect(uri);
        isConnected = true;
        UserModel = mongoose.models.User || mongoose.model('User', userSchema);
        CourseModel = mongoose.models.Course || mongoose.model('Course', courseSchema);
        VideoModel = mongoose.models.Video || mongoose.model('Video', videoSchema);
        CommentModel = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
        console.log('Successfully connected to MongoDB.');

        // Seed courses if empty
        const courseCount = await CourseModel.countDocuments();
        if (courseCount === 0) {
          await CourseModel.insertMany(defaultCourses);
          console.log('Seeded default courses to MongoDB.');
        }

        // Seed videos if empty
        const videoCount = await VideoModel.countDocuments();
        if (videoCount === 0) {
          await VideoModel.insertMany(defaultVideos);
          console.log('Seeded default videos to MongoDB.');
        }

        // Seed comments if empty
        const commentCount = await CommentModel.countDocuments();
        if (commentCount === 0) {
          await CommentModel.insertMany(defaultComments);
          console.log('Seeded default comments to MongoDB.');
        }

        return true;
      }
    } catch (err) {
      console.error('Failed to connect to MongoDB, falling back to local JSON database:', err);
    }
  }

  // Fallback to local files: Check and auto-migrate plaintext passwords to bcrypt
  await runInQueue(async () => {
    try {
      // 1. Users DB
      if (!fs.existsSync(USERS_DB_PATH)) {
        fs.writeFileSync(USERS_DB_PATH, '[]', 'utf-8');
      } else {
        const data = fs.readFileSync(USERS_DB_PATH, 'utf-8');
        const users = JSON.parse(data || '[]');
        let mutated = false;
        for (const user of users) {
          const isBcrypt = typeof user.password === 'string' &&
            user.password.length === 60 &&
            (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'));

          if (!isBcrypt) {
            user.password = await bcrypt.hash(user.password, 10);
            mutated = true;
          }
        }
        if (mutated) {
          fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
          console.log('Migrated plaintext user passwords in users.json to bcrypt.');
        }
      }

      // 2. Courses DB (Seed if empty)
      if (!fs.existsSync(COURSES_DB_PATH) || fs.readFileSync(COURSES_DB_PATH, 'utf-8').trim() === '[]' || fs.readFileSync(COURSES_DB_PATH, 'utf-8').trim() === '') {
        fs.writeFileSync(COURSES_DB_PATH, JSON.stringify(defaultCourses, null, 2), 'utf-8');
        console.log('Seeded default courses to courses.json.');
      }

      // 3. Videos DB (Seed if empty)
      if (!fs.existsSync(VIDEOS_DB_PATH) || fs.readFileSync(VIDEOS_DB_PATH, 'utf-8').trim() === '[]' || fs.readFileSync(VIDEOS_DB_PATH, 'utf-8').trim() === '') {
        fs.writeFileSync(VIDEOS_DB_PATH, JSON.stringify(defaultVideos, null, 2), 'utf-8');
        console.log('Seeded default videos to videos.json.');
      }

      // 4. Comments DB (Seed if empty)
      if (!fs.existsSync(COMMENTS_DB_PATH) || fs.readFileSync(COMMENTS_DB_PATH, 'utf-8').trim() === '[]' || fs.readFileSync(COMMENTS_DB_PATH, 'utf-8').trim() === '') {
        fs.writeFileSync(COMMENTS_DB_PATH, JSON.stringify(defaultComments, null, 2), 'utf-8');
        console.log('Seeded default comments to comments.json.');
      }

    } catch (err) {
      console.error('Error initializing/migrating local JSON databases:', err);
    }
  });

  return false;
}

// ----------------------------------------------------
// USERS CRUD HELPERS
// ----------------------------------------------------

async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  if (isConnected && UserModel) {
    return await UserModel.findOne({ email: normalizedEmail }).lean();
  }
  return await runInQueue(async () => {
    if (!fs.existsSync(USERS_DB_PATH)) return null;
    const data = fs.readFileSync(USERS_DB_PATH, 'utf-8');
    const users = JSON.parse(data || '[]');
    const user = users.find(u => u.email.toLowerCase() === normalizedEmail);
    return user ? { ...user } : null;
  });
}

async function createUser(userData) {
  const normalizedEmail = userData.email.toLowerCase().trim();
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  const newUser = {
    name: userData.name,
    email: normalizedEmail,
    password: hashedPassword,
    role: userData.role || 'user',
    createdAt: new Date().toISOString()
  };

  if (isConnected && UserModel) {
    const doc = new UserModel(newUser);
    const saved = await doc.save();
    return saved.toObject();
  }

  return await runInQueue(async () => {
    let users = [];
    if (fs.existsSync(USERS_DB_PATH)) {
      const data = fs.readFileSync(USERS_DB_PATH, 'utf-8');
      users = JSON.parse(data || '[]');
    }
    if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      throw new Error('Email already registered');
    }
    users.push(newUser);
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
    return newUser;
  });
}

async function comparePassword(plaintext, hashed) {
  return await bcrypt.compare(plaintext, hashed);
}

// ----------------------------------------------------
// COURSES CRUD HELPERS
// ----------------------------------------------------

async function getCourses() {
  if (isConnected && CourseModel) {
    return await CourseModel.find({}).lean();
  }
  return await runInQueue(async () => {
    const data = fs.readFileSync(COURSES_DB_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  });
}

async function saveCourse(courseData) {
  if (isConnected && CourseModel) {
    if (courseData.id) {
      return await CourseModel.findOneAndUpdate({ id: courseData.id }, courseData, { new: true, upsert: true }).lean();
    } else {
      courseData.id = "c_" + Date.now();
      const doc = new CourseModel(courseData);
      const saved = await doc.save();
      return saved.toObject();
    }
  }

  return await runInQueue(async () => {
    const data = fs.readFileSync(COURSES_DB_PATH, 'utf-8');
    let courses = JSON.parse(data || '[]');
    if (courseData.id) {
      const idx = courses.findIndex(c => c.id === courseData.id);
      if (idx !== -1) {
        courses[idx] = { ...courses[idx], ...courseData };
      } else {
        courses.push(courseData);
      }
    } else {
      courseData.id = "c_" + Date.now();
      courses.push(courseData);
    }
    fs.writeFileSync(COURSES_DB_PATH, JSON.stringify(courses, null, 2), 'utf-8');
    return courseData;
  });
}

async function deleteCourse(id) {
  if (isConnected && CourseModel) {
    return await CourseModel.findOneAndDelete({ id });
  }
  return await runInQueue(async () => {
    const data = fs.readFileSync(COURSES_DB_PATH, 'utf-8');
    let courses = JSON.parse(data || '[]');
    courses = courses.filter(c => c.id !== id);
    fs.writeFileSync(COURSES_DB_PATH, JSON.stringify(courses, null, 2), 'utf-8');
    return true;
  });
}

// ----------------------------------------------------
// VIDEOS CRUD HELPERS
// ----------------------------------------------------

async function getVideos() {
  if (isConnected && VideoModel) {
    return await VideoModel.find({}).lean();
  }
  return await runInQueue(async () => {
    const data = fs.readFileSync(VIDEOS_DB_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  });
}

async function saveVideo(videoData) {
  if (isConnected && VideoModel) {
    if (videoData.id) {
      return await VideoModel.findOneAndUpdate({ id: videoData.id }, videoData, { new: true, upsert: true }).lean();
    } else {
      videoData.id = "v_" + Date.now();
      videoData.dateAdded = new Date().toISOString().split('T')[0];
      const doc = new VideoModel(videoData);
      const saved = await doc.save();
      return saved.toObject();
    }
  }

  return await runInQueue(async () => {
    const data = fs.readFileSync(VIDEOS_DB_PATH, 'utf-8');
    let videos = JSON.parse(data || '[]');
    if (videoData.id) {
      const idx = videos.findIndex(v => v.id === videoData.id);
      if (idx !== -1) {
        videos[idx] = { ...videos[idx], ...videoData };
      } else {
        videos.push(videoData);
      }
    } else {
      videoData.id = "v_" + Date.now();
      videoData.dateAdded = new Date().toISOString().split('T')[0];
      videos.push(videoData);
    }
    fs.writeFileSync(VIDEOS_DB_PATH, JSON.stringify(videos, null, 2), 'utf-8');
    return videoData;
  });
}

async function deleteVideo(id) {
  if (isConnected && VideoModel) {
    return await VideoModel.findOneAndDelete({ id });
  }
  return await runInQueue(async () => {
    const data = fs.readFileSync(VIDEOS_DB_PATH, 'utf-8');
    let videos = JSON.parse(data || '[]');
    videos = videos.filter(v => v.id !== id);
    fs.writeFileSync(VIDEOS_DB_PATH, JSON.stringify(videos, null, 2), 'utf-8');
    return true;
  });
}

// ----------------------------------------------------
// COMMENTS CRUD HELPERS
// ----------------------------------------------------

async function getComments() {
  if (isConnected && CommentModel) {
    return await CommentModel.find({}).lean();
  }
  return await runInQueue(async () => {
    const data = fs.readFileSync(COMMENTS_DB_PATH, 'utf-8');
    return JSON.parse(data || '[]');
  });
}

async function saveComment(commentData) {
  if (isConnected && CommentModel) {
    if (commentData.id) {
      return await CommentModel.findOneAndUpdate({ id: commentData.id }, commentData, { new: true, upsert: true }).lean();
    } else {
      commentData.id = "com_" + Date.now();
      commentData.date = new Date().toISOString().split('T')[0];
      commentData.status = commentData.status || 'pending';
      const doc = new CommentModel(commentData);
      const saved = await doc.save();
      return saved.toObject();
    }
  }

  return await runInQueue(async () => {
    const data = fs.readFileSync(COMMENTS_DB_PATH, 'utf-8');
    let comments = JSON.parse(data || '[]');
    if (commentData.id) {
      const idx = comments.findIndex(c => c.id === commentData.id);
      if (idx !== -1) {
        comments[idx] = { ...comments[idx], ...commentData };
      } else {
        comments.push(commentData);
      }
    } else {
      commentData.id = "com_" + Date.now();
      commentData.date = new Date().toISOString().split('T')[0];
      commentData.status = commentData.status || 'pending';
      comments.push(commentData);
    }
    fs.writeFileSync(COMMENTS_DB_PATH, JSON.stringify(comments, null, 2), 'utf-8');
    return commentData;
  });
}

async function deleteComment(id) {
  if (isConnected && CommentModel) {
    return await CommentModel.findOneAndDelete({ id });
  }
  return await runInQueue(async () => {
    const data = fs.readFileSync(COMMENTS_DB_PATH, 'utf-8');
    let comments = JSON.parse(data || '[]');
    comments = comments.filter(c => c.id !== id);
    fs.writeFileSync(COMMENTS_DB_PATH, JSON.stringify(comments, null, 2), 'utf-8');
    return true;
  });
}

// ----------------------------------------------------
// AUTHENTICATION HELPER
// ----------------------------------------------------

function verifyAdmin(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.ep_session;
  const sessionSecret = process.env.SESSION_SECRET || "default_session_secret_2026";
  
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, sessionSecret);
    if (decoded && decoded.role === 'admin') {
      return decoded;
    }
  } catch (e) {
    // Session token expired/invalid
  }
  return null;
}

module.exports = {
  initDb,
  findUserByEmail,
  createUser,
  comparePassword,
  getCourses,
  saveCourse,
  deleteCourse,
  getVideos,
  saveVideo,
  deleteVideo,
  getComments,
  saveComment,
  deleteComment,
  verifyAdmin
};
