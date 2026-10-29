import { loadEnv } from "./mtpSync.js";

export function getAiConfig() {
  loadEnv();
  const apiKey = (process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim();
  const baseUrl = (
    process.env.OPENAI_BASE_URL ||
    process.env.AI_BASE_URL ||
    "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini").trim();
  return {
    apiKey,
    baseUrl,
    model,
    configured: Boolean(apiKey),
  };
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("AI trả về nội dung trống");
  }

  try {
    return JSON.parse(raw);
  } catch {
    // bỏ qua, thử bóc từ markdown / thinking
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }

  throw new Error(`AI không trả JSON hợp lệ: ${raw.slice(0, 300)}`);
}

export async function chatJson({ system, user, temperature = 0.2 }) {
  const config = getAiConfig();
  if (!config.configured) {
    throw new Error(
      "Chưa cấu hình AI. Thêm OPENAI_API_KEY (và tùy chọn OPENAI_BASE_URL, OPENAI_MODEL) vào file .env",
    );
  }

  const messages = [
    { role: "system", content: system },
    {
      role: "user",
      content: `${user}\n\nChỉ trả về đúng 1 JSON object hợp lệ, không giải thích thêm.`,
    },
  ];

  const body = {
    model: config.model,
    temperature,
    messages,
  };

  // Một số gateway (Vilao) có thể không hỗ trợ response_format
  let response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ ...body, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(180000),
  });

  let raw = await response.text();
  if (!response.ok && /response_format|json_object|unsupported/i.test(raw)) {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    raw = await response.text();
  }

  if (!response.ok) {
    throw new Error(`AI lỗi ${response.status}: ${raw.slice(0, 300)}`);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`AI trả về không phải JSON: ${raw.slice(0, 200)}`);
  }

  const content = payload.choices?.[0]?.message?.content || "";
  return {
    data: extractJsonObject(content),
    model: payload.model || config.model,
    usage: payload.usage || null,
  };
}
