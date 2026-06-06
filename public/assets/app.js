// public/assets/app.js

// Handle Logout via API
async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      showToast("🚪 تم تسجيل الخروج بنجاح. / Logged out successfully.", "info");
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
    } else {
      showToast("❌ حدث خطأ أثناء تسجيل الخروج. / Logout failed.", "error");
    }
  } catch (err) {
    showToast("❌ خطأ في الاتصال بالخادم. / Connection error.", "error");
  }
}
