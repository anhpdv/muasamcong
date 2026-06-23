const usersTableBody = document.getElementById("usersTableBody");
const userSummary = document.getElementById("userSummary");
const createUserForm = document.getElementById("createUserForm");
const adminUserChip = document.getElementById("adminUserChip");
const toast = document.getElementById("toast");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;

function showToast(message) {
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "/";
    throw new Error("Chưa đăng nhập");
  }
  if (response.status === 403) {
    window.location.href = "/app";
    throw new Error("Không có quyền truy cập");
  }
  if (!response.ok) {
    throw new Error(data.error || "Yêu cầu thất bại");
  }
  return data;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderUsers(users) {
  userSummary.textContent = `Tổng ${users.length} tài khoản`;

  if (!users.length) {
    usersTableBody.innerHTML = `<tr><td colspan="5" class="empty">Chưa có tài khoản</td></tr>`;
    return;
  }

  usersTableBody.innerHTML = users
    .map((user) => {
      const isSelf = user.id === currentUser?.id;
      const roleBadge =
        user.role === "admin"
          ? '<span class="badge badge--admin">Quản trị</span>'
          : '<span class="badge">Người dùng</span>';
      const statusBadge = user.active
        ? '<span class="badge badge--status">Hoạt động</span>'
        : '<span class="badge badge--inactive">Đã khóa</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(user.username)}</strong>${isSelf ? ' <span class="tender-meta">(bạn)</span>' : ""}</td>
          <td>${roleBadge}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(formatDate(user.createdAt))}</td>
          <td>
            <div class="admin-actions">
              <button class="btn btn--ghost btn--sm" type="button" data-action="reset" data-id="${escapeHtml(user.id)}">
                Đặt MK
              </button>
              <button class="btn btn--ghost btn--sm" type="button" data-action="toggle" data-id="${escapeHtml(user.id)}" data-active="${user.active}">
                ${user.active ? "Khóa" : "Mở khóa"}
              </button>
              ${
                !isSelf
                  ? `<button class="btn btn--ghost btn--sm" type="button" data-action="delete" data-id="${escapeHtml(user.id)}">Xóa</button>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadUsers() {
  const data = await fetchJson("/api/admin/users");
  renderUsers(data.users || []);
}

async function ensureAdmin() {
  const me = await fetchJson("/api/auth/me");
  currentUser = me.user;
  adminUserChip.textContent = `${me.user.username} (${me.user.role})`;

  if (me.user.role !== "admin") {
    window.location.href = "/app";
    return false;
  }
  return true;
}

createUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createUserForm);

  try {
    await fetchJson("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
        role: formData.get("role"),
      }),
    });
    createUserForm.reset();
    showToast("Đã tạo tài khoản");
    await loadUsers();
  } catch (error) {
    showToast(error.message);
  }
});

usersTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "reset") {
      const password = window.prompt("Nhập mật khẩu mới (tối thiểu 6 ký tự):");
      if (!password) return;
      await fetchJson(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      showToast("Đã đặt lại mật khẩu");
    }

    if (action === "toggle") {
      const active = button.dataset.active !== "true";
      await fetchJson(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      showToast(active ? "Đã mở khóa tài khoản" : "Đã khóa tài khoản");
    }

    if (action === "delete") {
      if (!window.confirm("Xóa tài khoản này?")) return;
      await fetchJson(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      showToast("Đã xóa tài khoản");
    }

    await loadUsers();
  } catch (error) {
    showToast(error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.href = "/";
});

if (await ensureAdmin()) {
  await loadUsers();
}
