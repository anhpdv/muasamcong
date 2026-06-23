const WORKFLOW_OPTIONS = [
  { value: "", label: "— Chọn —" },
  { value: "theo_doi", label: "Theo dõi" },
  { value: "luu", label: "Lưu" },
  { value: "khong_tham_gia", label: "Không tham gia" },
  { value: "da_nop_thau", label: "Đã nộp thầu" },
];

const WORKFLOW_LABELS = Object.fromEntries(
  WORKFLOW_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label]),
);

const state = {
  page: 1,
  limit: 15,
  q: "",
  field: "",
  provCode: "",
  workflowStatus: "",
  sort: "publicDate",
  order: "desc",
  viewMode: "saved",
  liveItems: new Map(),
};

const elements = {
  statSaved: document.getElementById("statSaved"),
  statTracked: document.getElementById("statTracked"),
  statSavedCard: document.getElementById("statSavedCard"),
  statTrackedCard: document.getElementById("statTrackedCard"),
  statLastCheck: document.getElementById("statLastCheck"),
  statLastPublic: document.getElementById("statLastPublic"),
  searchInput: document.getElementById("searchInput"),
  provinceFilter: document.getElementById("provinceFilter"),
  fieldFilter: document.getElementById("fieldFilter"),
  sortSelect: document.getElementById("sortSelect"),
  tenderTableBody: document.getElementById("tenderTableBody"),
  resultSummary: document.getElementById("resultSummary"),
  sourceBadge: document.getElementById("sourceBadge"),
  pagination: document.getElementById("pagination"),
  refreshBtn: document.getElementById("refreshBtn"),
  searchSubmitBtn: document.getElementById("searchSubmitBtn"),
  detailDialog: document.getElementById("detailDialog"),
  detailContent: document.getElementById("detailContent"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  toast: document.getElementById("toast"),
  logoutBtn: document.getElementById("logoutBtn"),
  userChip: document.getElementById("userChip"),
  adminLink: document.getElementById("adminLink"),
};

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function showToast(message) {
  elements.toast.hidden = false;
  elements.toast.textContent = message;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.hidden = true;
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
    throw new Error("Phiên đăng nhập đã hết hạn");
  }
  if (!response.ok) {
    throw new Error(data.error || "Yêu cầu thất bại");
  }
  return data;
}

async function ensureAuthenticated() {
  const me = await fetchJson("/api/auth/me");
  elements.userChip.textContent = `${me.user.username} (${me.user.role})`;
  elements.adminLink.hidden = me.user.role !== "admin";
  return me.user;
}

function setSourceBadge(mode) {
  if (mode === "live") {
    elements.sourceBadge.textContent = "Kết quả API trực tiếp";
    elements.sourceBadge.className = "source-badge source-badge--live";
    return;
  }

  elements.sourceBadge.textContent = "Danh sách gói thầu";
  elements.sourceBadge.className = "source-badge source-badge--saved";
}

function updateStatCards() {
  elements.statSavedCard.classList.toggle(
    "stat-card--active",
    state.workflowStatus === "luu",
  );
  elements.statTrackedCard.classList.toggle(
    "stat-card--active",
    state.workflowStatus === "theo_doi",
  );
}

function applyRouteFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");

  if (hash === "luu" || hash === "saved") {
    state.workflowStatus = "luu";
  } else if (hash === "theo-doi" || hash === "tracked" || hash === "theo_doi") {
    state.workflowStatus = "theo_doi";
  } else if (hash === "khong-tham-gia" || hash === "khong_tham_gia") {
    state.workflowStatus = "khong_tham_gia";
  } else if (hash === "da-nop-thau" || hash === "da_nop_thau") {
    state.workflowStatus = "da_nop_thau";
  } else {
    state.workflowStatus = "";
  }

  updateStatCards();
}

function navigateToWorkflow(workflowStatus) {
  state.workflowStatus = workflowStatus;
  state.page = 1;
  state.viewMode = "saved";
  updateStatCards();

  const hashMap = {
    luu: "#/luu",
    theo_doi: "#/theo-doi",
    khong_tham_gia: "#/khong-tham-gia",
    da_nop_thau: "#/da-nop-thau",
    "": "#/all",
  };
  const hash = hashMap[workflowStatus] || "#/all";
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }

  document.getElementById("tenderTableBody").scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });

  return loadSavedTenders();
}

function renderStatusSelect(item) {
  const current = item.workflowStatus || "";
  const statusClass = current ? `status-select--${current}` : "";

  return `
    <select
      class="status-select ${statusClass}"
      data-id="${escapeHtml(item.id)}"
      aria-label="Trạng thái gói thầu"
    >
      ${WORKFLOW_OPTIONS.map(
        (option) => `
          <option value="${option.value}" ${option.value === current ? "selected" : ""}>
            ${escapeHtml(option.label)}
          </option>
        `,
      ).join("")}
    </select>
  `;
}

async function loadProvinces() {
  const data = await fetchJson("/api/provinces");
  elements.provinceFilter.innerHTML = `
    <option value="">Tất cả tỉnh/thành</option>
    ${data.provinces
      .map(
        (province) =>
          `<option value="${escapeHtml(province.code)}">${escapeHtml(province.name)}</option>`,
      )
      .join("")}
  `;
}

async function loadStats() {
  const stats = await fetchJson("/api/stats");
  elements.statSaved.textContent = stats.totalSaved;
  elements.statTracked.textContent = stats.totalTracked;
  elements.statLastCheck.textContent = formatDate(stats.lastCheckAt);
  elements.statLastPublic.textContent = formatDate(stats.lastPublicDate);
}

async function loadSavedTenders() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
    q: state.q,
    field: state.field,
    provCode: state.provCode,
    workflowStatus: state.workflowStatus,
    sort: state.sort,
    order: state.order,
  });

  const data = await fetchJson(`/api/tenders?${params}`);
  state.viewMode = "saved";
  setSourceBadge("saved");
  updateStatCards();
  renderTable(data.items);
  renderPagination(data.pagination);

  const scope = WORKFLOW_LABELS[state.workflowStatus] || "tất cả gói";
  elements.resultSummary.textContent = `Hiển thị ${data.items.length} / ${data.pagination.total} gói · ${scope}`;
}

async function scanTendersFromApi() {
  const data = await fetchJson("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: state.q,
      keyword: state.q,
      field: state.field,
      investField: state.field,
      provCode: state.provCode,
      workflowStatus: state.workflowStatus,
      page: state.page,
      limit: state.limit,
    }),
  });

  state.viewMode = "live";
  state.liveItems = new Map(data.items.map((item) => [item.id, item]));
  setSourceBadge("live");
  renderTable(data.items);
  renderPagination(data.pagination);
  elements.resultSummary.textContent = `API trả về ${data.checked} gói · Tổng khớp bộ lọc: ${data.totalElements}`;
  showToast(data.message);
  await loadStats();
}

function renderTable(items) {
  if (items.length === 0) {
    elements.tenderTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          Không có gói thầu phù hợp. Thử đổi bộ lọc hoặc bấm <strong>Quét ngay</strong>.
        </td>
      </tr>
    `;
    return;
  }

  elements.tenderTableBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>
            <span class="tender-code">${escapeHtml(item.notifyNo)}</span>
            <div class="tender-meta">${escapeHtml(item.planNo || "—")}</div>
          </td>
          <td>
            <div class="tender-name">${escapeHtml(item.bidName)}</div>
            <div class="tender-meta">${escapeHtml(item.locations || "—")}</div>
          </td>
          <td>${escapeHtml(item.investorName || "—")}</td>
          <td>${escapeHtml(item.provName || "—")}</td>
          <td><span class="badge">${escapeHtml(item.investFieldLabel || "—")}</span></td>
          <td>${escapeHtml(item.publicDateLabel)}</td>
          <td>${escapeHtml(item.bidCloseDateLabel)}</td>
          <td>${renderStatusSelect(item)}</td>
          <td>
            <button class="btn btn--ghost btn--sm" data-id="${escapeHtml(item.id)}" type="button">
              Chi tiết
            </button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderPagination(pagination) {
  const { page, totalPages, total } = pagination;
  elements.pagination.innerHTML = `
    <span>Trang ${page} / ${totalPages} · Tổng ${total} gói</span>
    <div class="pagination__controls">
      <button class="btn btn--ghost" type="button" data-page="${page - 1}" ${
        page <= 1 ? "disabled" : ""
      }>Trước</button>
      <button class="btn btn--ghost" type="button" data-page="${page + 1}" ${
        page >= totalPages ? "disabled" : ""
      }>Sau</button>
    </div>
  `;
}

function renderFileList(files, emptyText) {
  if (!files?.length) {
    return `<p class="doc-empty">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <ul class="file-list">
      ${files
        .map(
          (file) => `
            <li class="file-list__item">
              <div>
                <strong>${escapeHtml(file.name)}</strong>
                ${file.section ? `<div class="tender-meta">${escapeHtml(file.section)}</div>` : ""}
              </div>
              <a class="btn btn--ghost" href="${escapeAttr(file.url)}" target="_blank" rel="noopener noreferrer">
                Tải về
              </a>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderDocumentsSection(documents) {
  if (!documents) {
    return `
      <section class="doc-panel">
        <p class="doc-empty">Không tải được tài liệu từ muasamcong. Thử lại sau hoặc mở link bên dưới.</p>
      </section>
    `;
  }

  const khlcnt = documents.khlcnt || {};
  const hsmt = documents.hsmt || {};

  const chapterHtml = (hsmt.chapters || [])
    .map(
      (chapter) => `
        <div class="doc-subsection">
          <h4>${escapeHtml(chapter.title)}</h4>
          ${renderFileList(chapter.files, "Chưa có file trong mục này.")}
        </div>
      `,
    )
    .join("");

  return `
    <section class="doc-panel">
      <div class="doc-panel__head">
        <h3>KHLCNT · ${escapeHtml(khlcnt.planNo || documents.planNo || "—")}</h3>
        ${
          documents.planUrl
            ? `<a class="btn btn--ghost" href="${escapeAttr(documents.planUrl)}" target="_blank" rel="noopener noreferrer">Mở KHLCNT</a>`
            : ""
        }
      </div>
      ${
        khlcnt.planName
          ? `<p class="doc-summary">${escapeHtml(khlcnt.planName)}</p>`
          : ""
      }
      <div class="detail-grid detail-grid--compact">
        <div class="detail-item"><span>Chủ đầu tư</span><strong>${escapeHtml(khlcnt.investorName || "—")}</strong></div>
        <div class="detail-item"><span>Tổng mức đầu tư</span><strong>${escapeHtml(khlcnt.investTotalLabel || khlcnt.investTotal || "—")}</strong></div>
        <div class="detail-item"><span>Ngày quyết định</span><strong>${escapeHtml(khlcnt.decisionDate ? formatDate(khlcnt.decisionDate) : "—")}</strong></div>
      </div>
      ${renderFileList(khlcnt.files, "Chưa lấy được file KHLCNT tự động. Dùng nút Mở KHLCNT để tải trên muasamcong.")}
    </section>

    <section class="doc-panel">
      <div class="doc-panel__head">
        <h3>Hồ sơ mời thầu (HSMT)</h3>
        <div class="doc-panel__actions">
          ${
            hsmt.zipUrl
              ? `<a class="btn btn--ghost" href="${escapeAttr(hsmt.zipUrl)}" target="_blank" rel="noopener noreferrer">Tải tất cả file</a>`
              : ""
          }
        </div>
      </div>
      <div class="doc-subsection">
        <h4>File đính kèm</h4>
        ${renderFileList(hsmt.attachments, "Chưa lấy được file đính kèm tự động. Mở gói thầu trên muasamcong → tab Hồ sơ mời thầu.")}
      </div>
      <div class="doc-subsection">
        <h4>Biểu mẫu webform</h4>
        ${renderFileList(hsmt.webforms, "Chưa lấy được biểu mẫu webform tự động. Tải trên muasamcong → tab Hồ sơ mời thầu.")}
      </div>
      ${chapterHtml}
    </section>
  `;
}

function renderDetail(item, documents) {
  elements.detailContent.innerHTML = `
    <div class="dialog__header">
      <p class="section-tag">Chi tiết gói thầu</p>
      <h2>${escapeHtml(item.bidName)}</h2>
    </div>
    <div class="dialog__body">
    <div class="detail-grid">
      <div class="detail-item detail-item--full">
        <span>Trạng thái</span>
        ${renderStatusSelect(item)}
      </div>
      <div class="detail-item"><span>Mã TBMT</span><strong>${escapeHtml(item.notifyNo)}</strong></div>
      <div class="detail-item"><span>Phiên bản</span><strong>${escapeHtml(item.notifyVersion || "00")}</strong></div>
      <div class="detail-item"><span>Chủ đầu tư</span><strong>${escapeHtml(item.investorName || "—")}</strong></div>
      <div class="detail-item"><span>Bên mời thầu</span><strong>${escapeHtml(item.procuringEntityName || "—")}</strong></div>
      <div class="detail-item"><span>Tỉnh/Thành</span><strong>${escapeHtml(item.provName || "—")}</strong></div>
      <div class="detail-item"><span>Lĩnh vực</span><strong>${escapeHtml(item.investFieldLabel || "—")}</strong></div>
      <div class="detail-item"><span>Hình thức</span><strong>${escapeHtml(item.bidFormLabel || "—")}</strong></div>
      <div class="detail-item"><span>Giá gói thầu</span><strong>${escapeHtml(item.bidPrice || "—")}</strong></div>
      <div class="detail-item"><span>Đấu thầu qua mạng</span><strong>${escapeHtml(item.isInternet || "—")}</strong></div>
      <div class="detail-item"><span>Ngày đăng tải</span><strong>${escapeHtml(item.publicDateLabel)}</strong></div>
      <div class="detail-item"><span>Đóng thầu</span><strong>${escapeHtml(item.bidCloseDateLabel)}</strong></div>
      <div class="detail-item"><span>Mở thầu</span><strong>${escapeHtml(item.bidOpenDateLabel)}</strong></div>
      <div class="detail-item"><span>Thời điểm quét</span><strong>${escapeHtml(item.crawledAtLabel || "—")}</strong></div>
      <div class="detail-item detail-item--full"><span>Địa điểm</span><p>${escapeHtml(item.locations || "—")}</p></div>
      <div class="detail-item detail-item--full">
        <span>Mã KHLCNT</span>
        <p>
          ${escapeHtml(item.planNo || "—")}
          ${
            item.planUrl
              ? ` · <a href="${escapeAttr(item.planUrl)}" target="_blank" rel="noopener noreferrer">Tra cứu KHLCNT</a>`
              : ""
          }
        </p>
      </div>
    </div>

    <div id="documentsSection" class="documents-section">
      ${
        documents
          ? renderDocumentsSection(documents)
          : '<div class="doc-loading">Đang tải KHLCNT và HSMT từ muasamcong...</div>'
      }
    </div>

    <div class="detail-actions">
      <a class="btn btn--primary" href="${escapeAttr(item.detailUrl)}" target="_blank" rel="noopener noreferrer">
        Xem trên muasamcong
      </a>
      ${
        item.planUrl
          ? `<a class="btn btn--ghost" href="${escapeAttr(item.planUrl)}" target="_blank" rel="noopener noreferrer">Mở KHLCNT</a>`
          : ""
      }
    </div>
    <p class="detail-hint">Link mở đúng trang trên muasamcong (portlet detail-v2 / tra cứu KHLCNT).</p>
    </div>
  `;

  const select = elements.detailContent.querySelector(".status-select");
  if (select) {
    select.addEventListener("change", () => {
      updateWorkflowStatus(select.dataset.id, select.value, select).catch(handleError);
    });
  }

  elements.detailDialog.showModal();
}

async function loadTenderDocuments(id) {
  return fetchJson(`/api/tenders/${encodeURIComponent(id)}/documents`);
}

async function updateWorkflowStatus(id, workflowStatus, selectEl) {
  const result = await fetchJson(`/api/tenders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowStatus }),
  });

  if (state.liveItems.has(id)) {
    state.liveItems.set(id, result.item);
  }

  if (selectEl) {
    selectEl.className = `status-select${workflowStatus ? ` status-select--${workflowStatus}` : ""}`;
  }

  document.querySelectorAll(`.status-select[data-id="${CSS.escape(id)}"]`).forEach((el) => {
    el.value = workflowStatus;
    el.className = `status-select${workflowStatus ? ` status-select--${workflowStatus}` : ""}`;
  });

  showToast(
    workflowStatus
      ? `Đã cập nhật: ${WORKFLOW_LABELS[workflowStatus]}`
      : "Đã xóa trạng thái",
  );
  await loadStats();

  if (
    state.viewMode === "saved" &&
    state.workflowStatus &&
    state.workflowStatus !== workflowStatus
  ) {
    await loadSavedTenders();
  }
}

async function openDetail(id) {
  let item;
  if (state.viewMode === "live" && state.liveItems.has(id)) {
    item = state.liveItems.get(id);
  } else {
    item = await fetchJson(`/api/tenders/${encodeURIComponent(id)}`);
  }

  renderDetail(item, null);

  try {
    const documents = await loadTenderDocuments(item.id || id);
    const documentsSection = elements.detailContent.querySelector("#documentsSection");
    if (documentsSection) {
      documentsSection.innerHTML = renderDocumentsSection(documents);
    }

    const detailLink = elements.detailContent.querySelector(
      ".detail-actions a.btn--primary",
    );
    if (detailLink && documents.detailUrl) {
      detailLink.href = documents.detailUrl;
    }
  } catch (error) {
    const documentsSection = elements.detailContent.querySelector("#documentsSection");
    if (documentsSection) {
      documentsSection.innerHTML = `
        <section class="doc-panel">
          <p class="doc-empty">${escapeHtml(error.message || "Không tải được tài liệu từ muasamcong.")}</p>
        </section>
      `;
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return String(value ?? "").replace(/"/g, "%22");
}

function applySortValue(value) {
  const [sort, order] = value.split(":");
  state.sort = sort;
  state.order = order;
}

function reloadCurrentView() {
  if (state.viewMode === "live") {
    return scanTendersFromApi();
  }
  return loadSavedTenders();
}

elements.statSavedCard.addEventListener("click", (event) => {
  event.preventDefault();
  navigateToWorkflow("luu").catch(handleError);
});

elements.statTrackedCard.addEventListener("click", (event) => {
  event.preventDefault();
  navigateToWorkflow("theo_doi").catch(handleError);
});

function runSearch() {
  state.q = elements.searchInput.value.trim();
  state.page = 1;
  state.viewMode = "saved";
  loadSavedTenders().catch(handleError);
}

elements.searchInput.addEventListener(
  "input",
  debounce(() => {
    runSearch();
  }, 300),
);

elements.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
});

elements.searchSubmitBtn.addEventListener("click", () => {
  runSearch();
});

elements.provinceFilter.addEventListener("change", (event) => {
  state.provCode = event.target.value;
  state.page = 1;
  state.viewMode = "saved";
  loadSavedTenders().catch(handleError);
});

elements.fieldFilter.addEventListener("change", (event) => {
  state.field = event.target.value;
  state.page = 1;
  state.viewMode = "saved";
  loadSavedTenders().catch(handleError);
});

elements.sortSelect.addEventListener("change", (event) => {
  applySortValue(event.target.value);
  state.page = 1;
  reloadCurrentView().catch(handleError);
});

elements.pagination.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) {
    return;
  }
  state.page = Number(button.dataset.page);
  reloadCurrentView().catch(handleError);
});

elements.tenderTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) {
    return;
  }
  openDetail(button.dataset.id).catch(handleError);
});

elements.tenderTableBody.addEventListener("change", (event) => {
  const select = event.target.closest(".status-select");
  if (!select) {
    return;
  }
  updateWorkflowStatus(select.dataset.id, select.value, select).catch(handleError);
});

elements.closeDialogBtn.addEventListener("click", () => {
  elements.detailDialog.close();
});

elements.logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.href = "/";
});

elements.refreshBtn.addEventListener("click", async () => {
  elements.refreshBtn.disabled = true;
  elements.refreshBtn.textContent = "Đang quét API...";

  try {
    state.page = 1;
    await scanTendersFromApi();
  } catch (error) {
    handleError(error);
  } finally {
    elements.refreshBtn.disabled = false;
    elements.refreshBtn.textContent = "Quét ngay";
  }
});

window.addEventListener("hashchange", () => {
  applyRouteFromHash();
  state.page = 1;
  state.viewMode = "saved";
  loadSavedTenders().catch(handleError);
});

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function handleError(error) {
  showToast(error.message || "Có lỗi xảy ra");
}

applyRouteFromHash();
ensureAuthenticated()
  .then(() => Promise.all([loadProvinces(), loadStats(), loadSavedTenders()]))
  .catch(handleError);
