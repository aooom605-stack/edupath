// api/db.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

const USERS_DB_PATH = path.join(__dirname, '..', 'users.json');

// Mongoose connection state
let isConnected = false;
let UserModel = null;

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

// User Schema for MongoDB
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

async function initDb() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      if (!isConnected) {
        await mongoose.connect(uri);
        isConnected = true;
        UserModel = mongoose.models.User || mongoose.model('User', userSchema);
        console.log('Successfully connected to MongoDB.');
        return true;
      }
    } catch (err) {
      console.error('Failed to connect to MongoDB, falling back to local users.json:', err);
    }
  }

  // Fallback to local users.json: check and auto-migrate plaintext passwords to bcrypt
  await runInQueue(async () => {
    try {
      if (!fs.existsSync(USERS_DB_PATH)) {
        fs.writeFileSync(USERS_DB_PATH, '[]', 'utf-8');
        return;
      }
      const data = fs.readFileSync(USERS_DB_PATH, 'utf-8');
      const users = JSON.parse(data || '[]');
      let mutated = false;

      for (const user of users) {
        // Simple check: bcrypt hashes are 60 characters long and typically start with $2a$ or $2b$
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
    } catch (err) {
      console.error('Error initializing/migrating local database:', err);
    }
  });

  return false;
}

async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Make sure db connection is checked/initialized
  const uri = process.env.MONGODB_URI;
  if (uri && isConnected && UserModel) {
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

  const uri = process.env.MONGODB_URI;
  if (uri && isConnected && UserModel) {
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

    // Check duplicate
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

module.exports = {
  initDb,
  findUserByEmail,
  createUser,
  comparePassword
};
