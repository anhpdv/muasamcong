const form = document.getElementById("loginForm");
const errorEl = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

async function fetchMe() {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  loginBtn.disabled = true;
  loginBtn.textContent = "Đang đăng nhập...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Đăng nhập thất bại");
    }

    window.location.href = "/app";
  } catch (error) {
    showError(error.message || "Đăng nhập thất bại");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Đăng nhập";
  }
});

const me = await fetchMe();
if (me?.user) {
  window.location.replace("/app");
}
