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

const scanState = {
  q: "",
  field: "",
  provCode: "",
  timePreset: "today",
  dateFrom: "",
  dateTo: "",
};

const elements = {
  statSaved: document.getElementById("statSaved"),
  statTracked: document.getElementById("statTracked"),
  statSavedCard: document.getElementById("statSavedCard"),
  statTrackedCard: document.getElementById("statTrackedCard"),
  statLastCheck: document.getElementById("statLastCheck"),
  statLastPublic: document.getElementById("statLastPublic"),
  scanProvince: document.getElementById("scanProvince"),
  scanField: document.getElementById("scanField"),
  scanKeyword: document.getElementById("scanKeyword"),
  scanTimePreset: document.getElementById("scanTimePreset"),
  scanDateRow: document.getElementById("scanDateRow"),
  scanDateFrom: document.getElementById("scanDateFrom"),
  scanDateTo: document.getElementById("scanDateTo"),
  listSearchInput: document.getElementById("listSearchInput"),
  listSortSelect: document.getElementById("listSortSelect"),
  tenderTableBody: document.getElementById("tenderTableBody"),
  resultSummary: document.getElementById("resultSummary"),
  sourceBadge: document.getElementById("sourceBadge"),
  pagination: document.getElementById("pagination"),
  refreshBtn: document.getElementById("refreshBtn"),
  filterScanBtn: document.getElementById("filterScanBtn"),
  detailDialog: document.getElementById("detailDialog"),
  detailContent: document.getElementById("detailContent"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  toast: document.getElementById("toast"),
  logoutBtn: document.getElementById("logoutBtn"),
  userChip: document.getElementById("userChip"),
  adminLink: document.getElementById("adminLink"),
  tabHainam: document.getElementById("tabHainam"),
  backToTendersBtn: document.getElementById("backToTendersBtn"),
  viewTenders: document.getElementById("viewTenders"),
  viewHainam: document.getElementById("viewHainam"),
  hainamSummary: document.getElementById("hainamSummary"),
  hainamAiBadge: document.getElementById("hainamAiBadge"),
  hainamCompanyName: document.getElementById("hainamCompanyName"),
  hainamNotes: document.getElementById("hainamNotes"),
  hainamRawText: document.getElementById("hainamRawText"),
  hainamFileInput: document.getElementById("hainamFileInput"),
  hainamImportMode: document.getElementById("hainamImportMode"),
  hainamImportBtn: document.getElementById("hainamImportBtn"),
  hainamAddTextBtn: document.getElementById("hainamAddTextBtn"),
  hainamSaveMetaBtn: document.getElementById("hainamSaveMetaBtn"),
  hainamSaveBtn: document.getElementById("hainamSaveBtn"),
  hainamDocTitle: document.getElementById("hainamDocTitle"),
  hainamDocsList: document.getElementById("hainamDocsList"),
  hainamMeta: document.getElementById("hainamMeta"),
};

function vietnamTodayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftVietnamDay(days) {
  const base = new Date(`${vietnamTodayKey()}T12:00:00+07:00`);
  base.setDate(base.getDate() + days);
  return vietnamTodayKey(base);
}

function toVietnamDayRange(fromKey, toKey) {
  return {
    publicDateFrom: new Date(`${fromKey}T00:00:00+07:00`).toISOString(),
    publicDateTo: new Date(`${toKey}T23:59:59.999+07:00`).toISOString(),
  };
}

function resolveScanDateFilters() {
  const preset = elements.scanTimePreset.value;
  const today = vietnamTodayKey();

  if (preset === "today") {
    return { publicDateToday: true, publicDateFrom: "", publicDateTo: "" };
  }

  if (preset === "7d") {
    return {
      publicDateToday: false,
      ...toVietnamDayRange(shiftVietnamDay(-6), today),
    };
  }

  if (preset === "30d") {
    return {
      publicDateToday: false,
      ...toVietnamDayRange(shiftVietnamDay(-29), today),
    };
  }

  if (preset === "custom") {
    const from = elements.scanDateFrom.value;
    const to = elements.scanDateTo.value;
    if (!from || !to) {
      throw new Error("Chọn đầy đủ Từ ngày và Đến ngày");
    }
    if (from > to) {
      throw new Error("Từ ngày không được lớn hơn Đến ngày");
    }
    return {
      publicDateToday: false,
      ...toVietnamDayRange(from, to),
    };
  }

  return { publicDateToday: false, publicDateFrom: "", publicDateTo: "" };
}

function syncScanDateRow() {
  const isCustom = elements.scanTimePreset.value === "custom";
  elements.scanDateRow.hidden = !isCustom;
  if (isCustom && !elements.scanDateFrom.value && !elements.scanDateTo.value) {
    elements.scanDateTo.value = vietnamTodayKey();
    elements.scanDateFrom.value = shiftVietnamDay(-6);
  }
}

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
    throw new Error(data.error || data.message || "Yêu cầu thất bại");
  }
  return data;
}

async function ensureAuthenticated() {
  const me = await fetchJson("/api/auth/me");
  elements.userChip.textContent = me.user.username;
  elements.userChip.title = me.user.role === "admin" ? "Quản trị viên" : "Người dùng";
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
  elements.scanProvince.innerHTML = `
    <option value="">Chọn tỉnh/thành</option>
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
  scanState.provCode = elements.scanProvince.value;
  scanState.field = elements.scanField.value;
  scanState.q = elements.scanKeyword.value.trim();
  scanState.timePreset = elements.scanTimePreset.value;

  if (!scanState.provCode && !scanState.field && !scanState.q) {
    throw new Error("Chọn tỉnh/thành hoặc lĩnh vực trước khi quét");
  }

  const dateFilters = resolveScanDateFilters();

  const data = await fetchJson("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: scanState.q,
      keyword: scanState.q,
      field: scanState.field,
      investField: scanState.field,
      provCode: scanState.provCode,
      fetchAll: true,
      maxPages: 50,
      saveNew: true,
      ...dateFilters,
    }),
  });

  state.page = 1;
  state.viewMode = "saved";
  setSourceBadge("saved");
  showToast(data.message);
  await Promise.all([loadStats(), loadSavedTenders()]);
}

async function scanDefaultSchedule() {
  const data = await fetchJson("/api/scan/default", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  state.page = 1;
  state.viewMode = "saved";
  setSourceBadge("saved");
  showToast(data.message);
  await Promise.all([loadStats(), loadSavedTenders()]);
}

function renderTable(items) {
  if (items.length === 0) {
    elements.tenderTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          Không có gói thầu phù hợp. Thử lọc danh sách hoặc quét thêm từ Mua sắm công.
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

function renderHsmtFiles(hsmt) {
  if (!hsmt) {
    return `<p class="doc-empty">Chưa lấy thông tin mời thầu. Bấm nút bên trên để tải Tiêu chuẩn đánh giá HSDT và Yêu cầu kỹ thuật.</p>`;
  }

  if (!hsmt.ok && !(hsmt.files || []).length) {
    return `<p class="doc-empty">${escapeHtml(hsmt.error || "Không tải được nội dung HSMT.")}</p>`;
  }

  const groups = [
    { key: "chuong-3", title: "Tiêu chuẩn đánh giá HSDT" },
    { key: "chuong-5", title: "Yêu cầu về kỹ thuật / TOR" },
    { key: "hsmt-full", title: "HSMT đầy đủ (offline)" },
  ];

  const sections = groups
    .map((group) => {
      const files = (hsmt.files || []).filter((file) => file.chapter === group.key);
      if (!files.length) {
        return "";
      }
      return `
        <div class="doc-subsection">
          <h4>${escapeHtml(group.title)}</h4>
          ${renderFileList(files, "Không có nội dung.")}
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!sections) {
    return `<p class="doc-empty">${escapeHtml(hsmt.error || "Không tìm thấy tiêu chuẩn đánh giá HSDT / yêu cầu kỹ thuật.")}</p>`;
  }
  return sections;
}

function renderBulletBlock(title, items) {
  if (!items?.length) {
    return "";
  }
  return `
    <div class="analysis-block">
      <h5>${escapeHtml(title)}</h5>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderAnalysisSection(analysis) {
  if (!analysis) {
    return `
      <div class="analysis-grid" id="analysisSection">
        <div class="analysis-card">
          <h4>Tóm tắt</h4>
          <p class="doc-empty">Chưa có. Bấm “Lấy thông tin mời thầu” để AI đọc tiêu chuẩn đánh giá HSDT & yêu cầu kỹ thuật.</p>
        </div>
        <div class="analysis-card">
          <h4>Đánh giá độ khả thi</h4>
          <p class="doc-empty">
            Chưa có. Vào mục
            <button type="button" class="linkish" id="gotoHainamFromAnalysis">Năng lực Hải Nam</button>
            để import hồ sơ, rồi lấy thông tin mời thầu.
          </p>
        </div>
      </div>
    `;
  }

  const summary =
    typeof analysis.summary === "object" && analysis.summary
      ? analysis.summary
      : {
          overview: analysis.summaryText || analysis.summary || "",
          products: [],
          technicalSpecs: [],
          keyConditions: [],
          chapter3: [],
          chapter5: [],
        };
  const f = analysis.feasibility || {};
  const productSpecs =
    summary.technicalSpecs?.length
      ? summary.technicalSpecs
      : summary.chapter5 || [];

  return `
    <div class="analysis-grid" id="analysisSection">
      <div class="analysis-card">
        <h4>Tóm tắt · Sản phẩm gói thầu</h4>
        ${
          summary.overview
            ? `<p class="analysis-overview">${escapeHtml(summary.overview)}</p>`
            : `<p class="doc-empty">Chưa có tóm tắt.</p>`
        }
        ${renderBulletBlock("Sản phẩm / hàng hóa", summary.products)}
        ${renderBulletBlock("Yêu cầu & thông số kỹ thuật", productSpecs)}
        ${renderBulletBlock("Điều kiện gắn sản phẩm", summary.keyConditions)}
      </div>
      <div class="analysis-card analysis-card--feasibility">
        <h4>Đánh giá độ khả thi</h4>
        <div class="feasibility-head">
          <span class="feasibility-badge feasibility-badge--${escapeAttr(f.verdict || "can_xem_xet")}">
            ${escapeHtml(f.verdictLabel || "Cần xem xét")}
          </span>
          <span class="feasibility-score">${f.score == null ? "—" : `${escapeHtml(f.score)}/10`}</span>
        </div>
        ${
          f.recommendation
            ? `<div class="analysis-block analysis-block--rec"><h5>Khuyến nghị</h5><p>${escapeHtml(f.recommendation)}</p></div>`
            : ""
        }
        ${renderBulletBlock("Lý do (đối chiếu năng lực Hải Nam)", f.reasons)}
        ${renderBulletBlock("Thiếu hụt / rủi ro", f.gaps)}
        ${renderBulletBlock("Cảnh báo", analysis.warnings)}
        <p class="analysis-foot">
          ${
            analysis.profileUsed
              ? "Đã dùng dữ liệu Năng lực Hải Nam đã lưu."
              : "Chưa có Năng lực Hải Nam — kết quả chỉ mang tính tham khảo."
          }
        </p>
      </div>
    </div>
  `;
}

function renderHsmtInvitePanel(tenderId, hsmt, analysis = null) {
  const hasFiles = Boolean(hsmt?.files?.length);
  return `
    <section class="doc-panel doc-panel--invite" id="hsmtInvitePanel" data-tender-id="${escapeAttr(tenderId)}">
      <div class="doc-panel__head">
        <div>
          <h3>Thông tin mời thầu</h3>
          <p class="doc-summary">Tải tiêu chuẩn đánh giá HSDT & yêu cầu kỹ thuật, AI tóm tắt và đánh giá khả thi theo dữ liệu Hải Nam.</p>
        </div>
        <div class="doc-panel__actions">
          <button class="btn btn--primary" type="button" id="fetchHsmtBtn" data-force="${hasFiles ? "1" : "0"}">
            ${hasFiles ? "Tải lại & phân tích" : "Lấy thông tin mời thầu"}
          </button>
        </div>
      </div>
      <div id="hsmtInviteBody">
        ${renderHsmtFiles(hsmt)}
      </div>
      ${renderAnalysisSection(analysis)}
    </section>
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

    <div id="hsmtSection" class="documents-section">
      ${renderHsmtInvitePanel(item.id || item.notifyNo, null, null)}
    </div>

    <div id="documentsSection" class="documents-section">
      ${
        documents
          ? renderDocumentsSection(documents)
          : '<div class="doc-loading">Đang tải KHLCNT từ muasamcong...</div>'
      }
    </div>

    <div class="detail-actions">
      <button class="btn btn--primary" type="button" id="fetchHsmtActionBtn">
        Lấy thông tin mời thầu
      </button>
      <a class="btn btn--ghost" href="${escapeAttr(item.detailUrl)}" target="_blank" rel="noopener noreferrer">
        Xem trên muasamcong
      </a>
      ${
        item.planUrl
          ? `<a class="btn btn--ghost" href="${escapeAttr(item.planUrl)}" target="_blank" rel="noopener noreferrer">Mở KHLCNT</a>`
          : ""
      }
    </div>
    <p class="detail-hint">Bấm “Lấy thông tin mời thầu” để tải tiêu chuẩn đánh giá HSDT & yêu cầu kỹ thuật, tạo tóm tắt và đánh giá khả thi. Quét thầu không tự tải file.</p>
    </div>
  `;

  const select = elements.detailContent.querySelector(".status-select");
  if (select) {
    select.addEventListener("change", () => {
      updateWorkflowStatus(select.dataset.id, select.value, select).catch(handleError);
    });
  }

  bindHsmtButtons(item.id || item.notifyNo);
  elements.detailDialog.showModal();
}

function bindHsmtButtons(tenderId) {
  const run = (force) => fetchHsmtInvite(tenderId, { force }).catch(handleError);
  const panelBtn = elements.detailContent.querySelector("#fetchHsmtBtn");
  const actionBtn = elements.detailContent.querySelector("#fetchHsmtActionBtn");
  const gotoHainam = elements.detailContent.querySelector("#gotoHainamFromAnalysis");
  if (panelBtn) {
    panelBtn.addEventListener("click", () => run(panelBtn.dataset.force === "1"));
  }
  if (actionBtn) {
    actionBtn.addEventListener("click", () => {
      const force = elements.detailContent.querySelector("#fetchHsmtBtn")?.dataset.force === "1";
      run(force);
    });
  }
  if (gotoHainam) {
    gotoHainam.addEventListener("click", () => {
      elements.detailDialog.close();
      switchAppTab("hainam");
    });
  }
}

function updateHsmtInviteUi(tenderId, hsmt, analysis = null) {
  const section = elements.detailContent.querySelector("#hsmtSection");
  if (section) {
    section.innerHTML = renderHsmtInvitePanel(tenderId, hsmt, analysis);
    bindHsmtButtons(tenderId);
  }
}

async function loadHsmtStatus(id) {
  return fetchJson(`/api/tenders/${encodeURIComponent(id)}/hsmt`);
}

async function fetchHsmtInvite(id, { force = false } = {}) {
  const panelBtn = elements.detailContent.querySelector("#fetchHsmtBtn");
  const actionBtn = elements.detailContent.querySelector("#fetchHsmtActionBtn");
  const body = elements.detailContent.querySelector("#hsmtInviteBody");
  const analysisSection = elements.detailContent.querySelector("#analysisSection");
  const buttons = [panelBtn, actionBtn].filter(Boolean);

  for (const btn of buttons) {
    btn.disabled = true;
    btn.textContent = "Đang tải & phân tích...";
  }
  if (body) {
    body.innerHTML = `<p class="doc-loading">Đang tải tiêu chuẩn đánh giá HSDT & yêu cầu kỹ thuật từ muasamcong...</p>`;
  }
  if (analysisSection) {
    analysisSection.innerHTML = `
      <div class="analysis-card"><h4>Tóm tắt</h4><p class="doc-loading">AI đang đọc tài liệu...</p></div>
      <div class="analysis-card"><h4>Đánh giá độ khả thi</h4><p class="doc-loading">Đang đối chiếu dữ liệu Hải Nam...</p></div>
    `;
  }

  try {
    const result = await fetchJson(`/api/tenders/${encodeURIComponent(id)}/hsmt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: Boolean(force) }),
    });
    updateHsmtInviteUi(id, result.hsmt, result.analysis);
    showToast(result.message || "Đã lấy thông tin mời thầu");
    if (result.analysisError) {
      showToast(result.analysisError);
    } else if (result.ai && result.ai.configured === false) {
      showToast("Server chưa cấu hình OPENAI_API_KEY — chưa tóm tắt được bằng AI.");
    } else if (result.analysis?.error === "missing_ai_key") {
      showToast("Thiếu OPENAI_API_KEY trên server — chưa gọi được AI.");
    }
    return result;
  } catch (error) {
    if (body) {
      body.innerHTML = `<p class="doc-empty">${escapeHtml(error.message || "Tải thất bại")}</p>`;
    }
    for (const btn of buttons) {
      btn.disabled = false;
      btn.textContent = "Lấy thông tin mời thầu";
    }
    throw error;
  }
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

  const tenderId = item.id || id;
  renderDetail(item, null);

  try {
    const status = await loadHsmtStatus(tenderId);
    if (status?.available || status?.analysis) {
      updateHsmtInviteUi(tenderId, status.hsmt, status.analysis);
    }
  } catch {
    // Chưa có file local — giữ nút lấy thủ công
  }

  try {
    const documents = await loadTenderDocuments(tenderId);
    const documentsSection = elements.detailContent.querySelector("#documentsSection");
    if (documentsSection) {
      documentsSection.innerHTML = renderDocumentsSection(documents);
    }

    const detailLink = elements.detailContent.querySelector(
      ".detail-actions a.btn--ghost[href]",
    );
    if (detailLink && documents.detailUrl) {
      detailLink.href = documents.detailUrl;
    }
  } catch (error) {
    const documentsSection = elements.detailContent.querySelector("#documentsSection");
    if (documentsSection) {
      documentsSection.innerHTML = `
        <section class="doc-panel">
          <p class="doc-empty">${escapeHtml(error.message || "Không tải được KHLCNT từ muasamcong.")}</p>
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

function runListSearch() {
  state.q = elements.listSearchInput.value.trim();
  state.page = 1;
  state.viewMode = "saved";
  loadSavedTenders().catch(handleError);
}

elements.listSearchInput.addEventListener(
  "input",
  debounce(() => {
    runListSearch();
  }, 300),
);

elements.listSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runListSearch();
  }
});

elements.listSortSelect.addEventListener("change", (event) => {
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
  elements.refreshBtn.textContent = "Đang quét...";

  try {
    await scanDefaultSchedule();
  } catch (error) {
    handleError(error);
  } finally {
    elements.refreshBtn.disabled = false;
    elements.refreshBtn.textContent = "Quét mặc định";
  }
});

elements.scanTimePreset.addEventListener("change", () => {
  syncScanDateRow();
});

elements.filterScanBtn.addEventListener("click", async () => {
  elements.filterScanBtn.disabled = true;
  elements.filterScanBtn.textContent = "Đang quét...";

  try {
    await scanTendersFromApi();
  } catch (error) {
    handleError(error);
  } finally {
    elements.filterScanBtn.disabled = false;
    elements.filterScanBtn.textContent = "Quét ngay";
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

function switchAppTab(tab) {
  const isHainam = tab === "hainam";
  elements.viewTenders.hidden = isHainam;
  elements.viewHainam.hidden = !isHainam;
  if (elements.tabHainam) {
    elements.tabHainam.classList.toggle("btn--primary", !isHainam);
    elements.tabHainam.classList.toggle("btn--ghost", isHainam);
    elements.tabHainam.textContent = isHainam ? "Đang xem năng lực" : "Năng lực Hải Nam";
  }
  if (isHainam) {
    loadHainamProfileUi().catch(handleError);
  }
}

function renderHainamDocs(documents = []) {
  if (!elements.hainamDocsList) {
    return;
  }
  if (!documents.length) {
    elements.hainamDocsList.innerHTML =
      `<p class="hainam-docs__empty">Kho đang trống — thêm text hoặc import nhiều file bên dưới.</p>`;
    return;
  }
  elements.hainamDocsList.innerHTML = documents
    .map(
      (doc) => `
        <article class="hainam-doc${doc.isDefault ? " hainam-doc--default" : ""}" data-id="${escapeAttr(doc.id)}">
          <div>
            <h4 class="hainam-doc__title">
              ${escapeHtml(doc.title)}
              ${doc.isDefault ? `<span class="hainam-doc__badge">Mặc định</span>` : ""}
            </h4>
            <p class="hainam-doc__meta">
              ${doc.isDefault ? "Luôn dùng khi đánh giá" : escapeHtml(doc.source || "manual")}
              · ${(doc.chars || 0).toLocaleString("vi-VN")} ký tự
              ${doc.updatedAt ? ` · ${escapeHtml(formatDate(doc.updatedAt))}` : ""}
            </p>
          </div>
          ${
            doc.isDefault
              ? `<span class="hainam-doc__locked">Không xóa</span>`
              : `<button class="btn btn--ghost btn--sm" type="button" data-delete-doc="${escapeAttr(doc.id)}">Xóa</button>`
          }
          <p class="hainam-doc__preview">${escapeHtml(doc.preview || "")}${(doc.chars || 0) > 160 ? "…" : ""}</p>
        </article>
      `,
    )
    .join("");
}

function fillHainamForm(profile, ai) {
  elements.hainamCompanyName.value = profile?.companyName || "Hải Nam";
  elements.hainamNotes.value = profile?.notes || "";
  const updated = profile?.updatedAt
    ? `Cập nhật ${formatDate(profile.updatedAt)}${profile.updatedBy ? ` · ${profile.updatedBy}` : ""}`
    : "Chưa lưu lần nào";
  const docCount = profile?.documentCount || profile?.documents?.length || 0;
  const extraCount = profile?.extraCount ?? Math.max(0, docCount - 1);
  elements.hainamSummary.textContent = `Năng lực mặc định luôn bật · đã thêm ${extraCount} mục · tổng ${profile.charCount.toLocaleString("vi-VN")} ký tự — AI đọc toàn bộ khi đánh giá.`;
  elements.hainamMeta.innerHTML = `<strong>${docCount} mục (1 mặc định + ${extraCount} bổ sung)</strong><br>${escapeHtml(updated)} · ${profile.charCount.toLocaleString("vi-VN")} ký tự · Đánh giá thầu quét hết kho.`;
  elements.hainamAiBadge.textContent = ai?.configured
    ? `AI: ${ai.model || "đã cấu hình"}`
    : "AI: chưa cấu hình (.env)";
  elements.hainamAiBadge.className = `source-badge ${
    ai?.configured ? "source-badge--live" : "source-badge--saved"
  }`;
  renderHainamDocs(profile?.documents || []);
}

async function loadHainamProfileUi() {
  const result = await fetchJson("/api/hainam-profile");
  fillHainamForm(result.profile, result.ai);
  return result;
}

async function saveHainamMetaUi() {
  const result = await fetchJson("/api/hainam-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: elements.hainamCompanyName.value.trim(),
      notes: elements.hainamNotes.value.trim(),
    }),
  });
  await loadHainamProfileUi();
  showToast(result.message || "Đã lưu");
}

async function addHainamTextEntry() {
  const text = elements.hainamRawText.value.trim();
  if (!text) {
    throw new Error("Nhập nội dung trước khi thêm vào kho");
  }
  const result = await fetchJson("/api/hainam-profile/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      title: elements.hainamDocTitle?.value.trim() || "",
      mode: "append",
      companyName: elements.hainamCompanyName.value.trim(),
      notes: elements.hainamNotes.value.trim(),
    }),
  });
  elements.hainamRawText.value = "";
  if (elements.hainamDocTitle) {
    elements.hainamDocTitle.value = "";
  }
  fillHainamForm(result.profile);
  await loadHainamProfileUi();
  showToast("Đã thêm 1 mục vào kho năng lực");
}

async function importHainamFile() {
  const files = [...(elements.hainamFileInput.files || [])];
  if (!files.length) {
    throw new Error("Chọn ít nhất 1 file để import");
  }
  const texts = [];
  for (const file of files) {
    texts.push({ text: await file.text(), fileName: file.name, title: file.name });
  }
  const result = await fetchJson("/api/hainam-profile/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts,
      mode: elements.hainamImportMode.value,
      companyName: elements.hainamCompanyName.value.trim(),
      notes: elements.hainamNotes.value.trim(),
    }),
  });
  elements.hainamFileInput.value = "";
  fillHainamForm(result.profile);
  await loadHainamProfileUi();
  showToast(`Đã import ${files.length} file vào kho`);
}

async function deleteHainamDoc(id) {
  const result = await fetchJson(`/api/hainam-profile/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  fillHainamForm(result.profile);
  await loadHainamProfileUi();
  showToast(result.message || "Đã xóa");
}

elements.tabHainam?.addEventListener("click", () => switchAppTab("hainam"));
elements.backToTendersBtn?.addEventListener("click", () => switchAppTab("tenders"));
elements.hainamSaveMetaBtn?.addEventListener("click", () => {
  saveHainamMetaUi().catch(handleError);
});
elements.hainamSaveBtn?.addEventListener("click", () => {
  addHainamTextEntry().catch(handleError);
});
elements.hainamAddTextBtn?.addEventListener("click", () => {
  addHainamTextEntry().catch(handleError);
});
elements.hainamImportBtn?.addEventListener("click", () => {
  importHainamFile().catch(handleError);
});
elements.hainamDocsList?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-delete-doc]");
  if (!btn) {
    return;
  }
  deleteHainamDoc(btn.dataset.deleteDoc).catch(handleError);
});

syncScanDateRow();
applyRouteFromHash();
ensureAuthenticated()
  .then(() => Promise.all([loadProvinces(), loadStats(), loadSavedTenders()]))
  .catch(handleError);
