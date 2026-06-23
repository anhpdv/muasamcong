import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SESSION_COOKIE = "msc_session";
const PASSWORD_KEYLEN = 64;

function nowIso() {
  return new Date().toISOString();
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function randomId() {
  return crypto.randomUUID();
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function createAuthStore(paths, config = {}) {
  const usersPath = paths.usersPath;
  const sessionsPath = paths.sessionsPath;
  const sessionTtlMs = (config.auth?.sessionTtlHours || 168) * 60 * 60 * 1000;

  async function loadUsersDoc() {
    return readJson(usersPath, { users: [] });
  }

  async function saveUsersDoc(doc) {
    await writeJson(usersPath, doc);
  }

  async function loadSessionsDoc() {
    return readJson(sessionsPath, { sessions: {} });
  }

  async function saveSessionsDoc(doc) {
    const sessions = {};
    const now = Date.now();

    for (const [token, session] of Object.entries(doc.sessions || {})) {
      if (new Date(session.expiresAt).getTime() > now) {
        sessions[token] = session;
      }
    }

    await writeJson(sessionsPath, { sessions });
  }

  async function ensureBootstrapAdmin() {
    const doc = await loadUsersDoc();
    if (doc.users.length > 0) {
      return null;
    }

    const username = config.auth?.bootstrap?.username || "admin";
    const password =
      process.env.MSC_ADMIN_PASSWORD ||
      config.auth?.bootstrap?.password ||
      crypto.randomBytes(9).toString("base64url");

    const user = {
      id: randomId(),
      username,
      passwordHash: hashPassword(password),
      role: "admin",
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    doc.users.push(user);
    await saveUsersDoc(doc);

    return { username, password };
  }

  async function findUserByUsername(username) {
    const doc = await loadUsersDoc();
    return doc.users.find(
      (user) => user.username.toLowerCase() === String(username || "").toLowerCase(),
    );
  }

  async function findUserById(id) {
    const doc = await loadUsersDoc();
    return doc.users.find((user) => user.id === id);
  }

  async function listUsers() {
    const doc = await loadUsersDoc();
    return doc.users.map(sanitizeUser);
  }

  async function authenticate(username, password) {
    const user = await findUserByUsername(username);
    if (!user || user.active === false) {
      return null;
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return null;
    }
    return sanitizeUser(user);
  }

  async function createSession(userId) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    const doc = await loadSessionsDoc();
    doc.sessions[token] = { userId, expiresAt, createdAt: nowIso() };
    await saveSessionsDoc(doc);
    return { token, expiresAt };
  }

  async function destroySession(token) {
    if (!token) {
      return;
    }
    const doc = await loadSessionsDoc();
    delete doc.sessions[token];
    await saveSessionsDoc(doc);
  }

  async function getSessionUser(token) {
    if (!token) {
      return null;
    }

    const doc = await loadSessionsDoc();
    const session = doc.sessions[token];
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      delete doc.sessions[token];
      await saveSessionsDoc(doc);
      return null;
    }

    const user = await findUserById(session.userId);
    if (!user || user.active === false) {
      return null;
    }

    return sanitizeUser(user);
  }

  async function createUser({ username, password, role = "user" }) {
    const normalized = String(username || "").trim();
    if (!normalized || normalized.length < 3) {
      throw new Error("Tên đăng nhập phải có ít nhất 3 ký tự");
    }
    if (!password || password.length < 6) {
      throw new Error("Mật khẩu phải có ít nhất 6 ký tự");
    }
    if (!["admin", "user"].includes(role)) {
      throw new Error("Vai trò không hợp lệ");
    }

    const doc = await loadUsersDoc();
    if (doc.users.some((user) => user.username.toLowerCase() === normalized.toLowerCase())) {
      throw new Error("Tên đăng nhập đã tồn tại");
    }

    const user = {
      id: randomId(),
      username: normalized,
      passwordHash: hashPassword(password),
      role,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    doc.users.push(user);
    await saveUsersDoc(doc);
    return sanitizeUser(user);
  }

  async function updateUser(id, patch = {}) {
    const doc = await loadUsersDoc();
    const index = doc.users.findIndex((user) => user.id === id);
    if (index < 0) {
      throw new Error("Không tìm thấy tài khoản");
    }

    const user = doc.users[index];

    if (patch.username != null) {
      const normalized = String(patch.username).trim();
      if (normalized.length < 3) {
        throw new Error("Tên đăng nhập phải có ít nhất 3 ký tự");
      }
      if (
        doc.users.some(
          (item, itemIndex) =>
            itemIndex !== index && item.username.toLowerCase() === normalized.toLowerCase(),
        )
      ) {
        throw new Error("Tên đăng nhập đã tồn tại");
      }
      user.username = normalized;
    }

    if (patch.role != null) {
      if (!["admin", "user"].includes(patch.role)) {
        throw new Error("Vai trò không hợp lệ");
      }
      user.role = patch.role;
    }

    if (patch.active != null) {
      user.active = Boolean(patch.active);
    }

    if (patch.password) {
      if (patch.password.length < 6) {
        throw new Error("Mật khẩu phải có ít nhất 6 ký tự");
      }
      user.passwordHash = hashPassword(patch.password);
    }

    user.updatedAt = nowIso();
    doc.users[index] = user;
    await saveUsersDoc(doc);
    return sanitizeUser(user);
  }

  async function deleteUser(id, currentUserId) {
    if (id === currentUserId) {
      throw new Error("Không thể xóa tài khoản đang đăng nhập");
    }

    const doc = await loadUsersDoc();
    const user = doc.users.find((item) => item.id === id);
    if (!user) {
      throw new Error("Không tìm thấy tài khoản");
    }

    if (user.role === "admin") {
      const adminCount = doc.users.filter(
        (item) => item.role === "admin" && item.active !== false,
      ).length;
      if (adminCount <= 1) {
        throw new Error("Không thể xóa admin cuối cùng");
      }
    }

    doc.users = doc.users.filter((item) => item.id !== id);
    await saveUsersDoc(doc);

    const sessionsDoc = await loadSessionsDoc();
    for (const [token, session] of Object.entries(sessionsDoc.sessions || {})) {
      if (session.userId === id) {
        delete sessionsDoc.sessions[token];
      }
    }
    await saveSessionsDoc(sessionsDoc);
  }

  return {
    SESSION_COOKIE,
    ensureBootstrapAdmin,
    authenticate,
    createSession,
    destroySession,
    getSessionUser,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
  };
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        if (idx < 0) {
          return [part, ""];
        }
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      }),
  );
}

export function buildSessionCookie(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
