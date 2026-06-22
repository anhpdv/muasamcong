export function getTodayRange(timezone = "Asia/Ho_Chi_Minh", date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(date);
  return {
    today,
    from: new Date(`${today}T00:00:00+07:00`).toISOString(),
    to: new Date(`${today}T23:59:59.999+07:00`).toISOString(),
  };
}

export function isPublicDateToday(
  publicDate,
  timezone = "Asia/Ho_Chi_Minh",
  date = new Date(),
) {
  if (!publicDate) {
    return false;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(publicDate)) === formatter.format(date);
}

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection",
};

const PORTAL_SERVICE_PREFIX = "/o/egp-portal-home/services";

export function buildSearchPayload({
  pageNumber = 0,
  pageSize = 10,
  keyword = "",
  investField = "",
  investFields = [],
  provCode = "",
  provCodes = [],
  sortBy = "publicDate",
  sortType = "DESC",
  publicDateToday = false,
  publicDateFrom = "",
  publicDateTo = "",
  timezone = "Asia/Ho_Chi_Minh",
} = {}) {
  const filters = [
    {
      fieldName: "type",
      searchType: "in",
      fieldValues: ["es-notify-contractor"],
    },
    {
      fieldName: "caseKHKQ",
      searchType: "not_in",
      fieldValues: ["1"],
    },
  ];

  const fieldValues = investFields.length
    ? investFields
    : investField
      ? [investField]
      : [];

  if (fieldValues.length > 0) {
    filters.push({
      fieldName: "investField",
      searchType: "in",
      fieldValues,
    });
  }

  const provinceValues = provCodes.length ? provCodes : provCode ? [provCode] : [];

  if (provinceValues.length > 0) {
    filters.push({
      fieldName: "locations.provCode",
      searchType: "in",
      fieldValues: provinceValues,
    });
  }

  let from = publicDateFrom;
  let to = publicDateTo;
  if (publicDateToday) {
    const range = getTodayRange(timezone);
    from = range.from;
    to = range.to;
  }

  if (from && to) {
    filters.push({
      fieldName: "publicDate",
      searchType: "range",
      from,
      to,
    });
  }

  const matchFields = keyword
    ? ["notifyNo", "bidName", "investorName", "procuringEntityName", "planNo"]
    : ["publicDate^10"];

  return [
    {
      pageSize,
      pageNumber,
      sortBy,
      sortType,
      query: [
        {
          index: "es-contractor-selection",
          keyWord: keyword,
          matchType: "all-1",
          matchFields,
          filters,
        },
      ],
    },
  ];
}

async function postJson(url, body, { allowHtml = false } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API lỗi ${response.status}: ${text.slice(0, 200)}`);
  }

  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    if (allowHtml) {
      return null;
    }
    throw new Error("Phản hồi HTML thay vì JSON");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Phản hồi không phải JSON: ${text.slice(0, 200)}`);
  }
}

export async function postPortalService(config, servicePath, body, options = {}) {
  const url = `${config.baseUrl}${PORTAL_SERVICE_PREFIX}/${servicePath}`;
  return postJson(url, body, options);
}

export async function searchByIndex(
  config,
  {
    index,
    keyword,
    matchFields = [],
    filters = [],
    pageNumber = 0,
    pageSize = 5,
    sortBy = "publicDate",
    sortType = "DESC",
  } = {},
) {
  const url = `${config.baseUrl}${config.searchEndpoint}`;
  const payload = [
    {
      pageSize,
      pageNumber,
      sortBy,
      sortType,
      query: [
        {
          index,
          keyWord: keyword,
          matchType: "all-1",
          matchFields: matchFields.length ? matchFields : [index.includes("plan") ? "planNo" : "notifyNo"],
          filters,
        },
      ],
    },
  ];

  const data = await postJson(url, payload);
  return data?.page?.content || [];
}

export async function searchTenders(config, options = {}) {
  const url = `${config.baseUrl}${config.searchEndpoint}`;
  const pageSize = options.pageSize || config.pageSize || 10;
  const payload = buildSearchPayload({
    pageNumber: options.pageNumber || 0,
    pageSize,
    keyword: options.keyword || "",
    investField: options.investField || "",
    investFields: options.investFields || [],
    provCode: options.provCode || "",
    provCodes: options.provCodes || [],
    sortBy: options.sortBy || "publicDate",
    sortType: options.sortType || "DESC",
    publicDateToday: options.publicDateToday || false,
    publicDateFrom: options.publicDateFrom || "",
    publicDateTo: options.publicDateTo || "",
    timezone: options.timezone || "Asia/Ho_Chi_Minh",
  });

  const data = await postJson(url, payload);
  if (!data?.page?.content) {
    throw new Error("Phản hồi API thiếu page.content");
  }

  return data.page;
}

export async function fetchLatestTenders(config, pageNumber = 0) {
  return searchTenders(config, { pageNumber });
}

let provinceCache = null;
let provinceCacheAt = 0;

export async function fetchProvinces(config, { maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (provinceCache && Date.now() - provinceCacheAt < maxAgeMs) {
    return provinceCache;
  }

  const url = `${config.baseUrl}/o/egp-portal-personal-page/services/get/area-api`;
  const data = await postJson(url, {
    areaType: 1,
    parentCode: "VN",
    isValid: true,
  });

  provinceCache = (data.areas || [])
    .filter((item) => item.status === 1)
    .sort((left, right) => left.name.localeCompare(right.name, "vi"))
    .map((item) => ({
      code: item.code,
      name: item.name,
    }));

  provinceCacheAt = Date.now();
  return provinceCache;
}
