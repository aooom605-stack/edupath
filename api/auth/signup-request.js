// api/auth/signup-request.js
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
require('dotenv').config();

// Define input validation schema
const signupSchema = z.object({
  name: z.string()
    .min(2, { message: 'الاسم يجب أن يكون حرفين على الأقل / Name must be at least 2 characters' })
    .max(50, { message: 'الاسم طويل جداً / Name is too long' }),
  email: z.string()
    .email({ message: 'صيغة البريد الإلكتروني غير صحيحة / Invalid email format' }),
  password: z.string()
    .min(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل / Password must be at least 6 characters' })
});

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

  // Validate inputs
  const validation = signupSchema.safeParse(body || {});
  if (!validation.success) {
    const errorMessages = validation.error.errors.map(err => err.message).join(' | ');
    res.status(400).json({ error: errorMessages });
    return;
  }

  const { name, email, password } = validation.data;

  // Initialize DB & check uniqueness
  await db.initDb();
  const existingUser = await db.findUserByEmail(email);
  const adminEmail = process.env.ADMIN_EMAIL;

  if (existingUser || (adminEmail && email.toLowerCase() === adminEmail.toLowerCase())) {
    res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل بالفعل / Email already registered' });
    return;
  }


  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Create JWT for signup state, valid for 5 minutes
  const sessionSecret = process.env.SESSION_SECRET || "default_session_secret_2026";
  const stateToken = jwt.sign(
    { name, email, password, otp },
    sessionSecret,
    { expiresIn: '5m' }
  );

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 5 * 60 // 5 minutes
  };

  res.setHeader('Set-Cookie', cookie.serialize('ep_signup_state', stateToken, cookieOptions));

  // Send email via Resend API
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.log(`\n==================================================`);
    console.log(`⚠️ RESEND_API_KEY is not set in environment variables!`);
    console.log(`🔑 Verification OTP code for ${email} is: ${otp}`);
    console.log(`==================================================\n`);
    
    res.status(200).json({
      success: true,
      testingMode: true,
      message: 'تم توليد الرمز في وضع الاختبار المحلي. تحقق من وحدة التحكم (Terminal) لرؤية الرمز / Local testing mode: Check terminal output for OTP.'
    });
    return;
  }

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EduPath <onboarding@resend.dev>',
        to: email,
        subject: 'EduPath Admin Verification Code / رمز التحقق لمنصة إديوباث',
        html: `
          <div style="direction: rtl; font-family: 'Plus Jakarta Sans', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #FF6B6B; text-align: center;">رمز التحقق لمنصة EduPath 🎓</h2>
            <p>مرحباً ${name}،</p>
            <p>أنت على وشك إنشاء حساب جديد في لوحة تحكم EduPath. يرجى استخدام رمز التحقق التالي لإتمام التسجيل:</p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 5px; color: #1e2028; background: #f8f6f2; padding: 10px 25px; border-radius: 6px; border: 1px dashed #FF6B6B;">
                ${otp}
              </span>
            </div>
            <p style="color: #718096; font-size: 14px;">ملاحظة: هذا الرمز صالح لمدة 5 دقائق فقط.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="text-align: center; font-size: 12px; color: #a0aec0;">إذا لم تقم بطلب هذا الرمز، يرجى تجاهل هذا البريد الإلكتروني.</p>
          </div>
        `
      })
    });

    if (resendResponse.ok) {
      res.status(200).json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني / OTP sent to your email.' });
    } else {
      const errorData = await resendResponse.json();
      res.status(500).json({ error: `فشل إرسال البريد الإلكتروني: ${errorData.message || 'Unknown error'}` });
    }
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ أثناء الاتصال بخدمة Resend. يرجى المحاولة لاحقاً.' });
  }
};
