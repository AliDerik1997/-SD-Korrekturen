/**
 * FDN ÖSD KI-Gateway für Cloudflare Workers.
 * Geheimnisse niemals in diese Datei schreiben. Als Worker-Secrets setzen:
 *   OPENAI_API_KEY, AI_GATEWAY_TOKEN
 * Optional: ALLOWED_ORIGIN, OPENAI_MODEL (Standard: gpt-5.6-luna)
 */

const allowedModes = new Set(["daily", "month", "email"]);

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
  const allowedOrigin = configured || origin || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env)
    }
  });
}

function number(value, minimum = 0, maximum = 100_000_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : minimum;
}

function sanitizeContext(value) {
  const context = value && typeof value === "object" ? value : {};
  return {
    dateKey: /^\d{4}-\d{2}-\d{2}$/.test(context.dateKey || "") ? context.dateKey : "",
    todayCount: Math.round(number(context.todayCount, 0, 10_000)),
    todayEarningsCents: Math.round(number(context.todayEarningsCents)),
    workedSeconds: Math.round(number(context.workedSeconds, 0, 86_400)),
    dailyTargetCount: Math.round(number(context.dailyTargetCount, 1, 10_000)),
    monthCount: Math.round(number(context.monthCount, 0, 100_000)),
    monthEarningsCents: Math.round(number(context.monthEarningsCents)),
    monthlyTargetCents: Math.round(number(context.monthlyTargetCents)),
    predictedMonthEarningsCents: Math.round(number(context.predictedMonthEarningsCents)),
    openOrderCount: Math.round(number(context.openOrderCount, 0, 10_000)),
    overdueOrderCount: Math.round(number(context.overdueOrderCount, 0, 10_000)),
    nextDueDates: Array.isArray(context.nextDueDates)
      ? context.nextDueDates.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).slice(0, 5)
      : [],
    openInvoiceCents: Math.round(number(context.openInvoiceCents)),
    averageMinutesPerCorrection: number(context.averageMinutesPerCorrection, 0, 1_440)
  };
}

function taskInstruction(mode) {
  const common = "Antworte auf Deutsch (Österreich), freundlich, präzise und in höchstens 130 Wörtern. Verwende nur die gelieferten aggregierten Werte. Erfinde keine Daten und gib keine Steuer- oder Rechtsberatung.";
  if (mode === "month") return `${common} Analysiere den Monatsfortschritt, nenne Zielabstand, realistische Priorität und offene Fristen.`;
  if (mode === "email") return `${common} Formuliere einen kurzen professionellen E-Mail-Entwurf mit Betreff, Anrede, Arbeitsstand und neutralem Gruß. Ergänze keine Namen oder Kontodaten.`;
  return `${common} Fasse den Arbeitstag zusammen und gib genau eine nützliche nächste Priorität.`;
}

function outputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  return (payload?.output || [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(part => part?.type === "output_text" && typeof part.text === "string")
    .map(part => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

const assistantSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    nextAction: { type: "string" },
    emailDraft: { type: "string" }
  },
  required: ["summary", "warnings", "nextAction", "emailDraft"],
  additionalProperties: false
};

function sanitizeAssistantContent(value) {
  if (!value || typeof value !== "object") return null;
  const summary = String(value.summary || "").trim().slice(0, 1_600);
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map(item => String(item || "").trim().slice(0, 300)).filter(Boolean).slice(0, 6)
    : [];
  const nextAction = String(value.nextAction || "").trim().slice(0, 500);
  const emailDraft = String(value.emailDraft || "").trim().slice(0, 2_400);
  return summary || warnings.length || nextAction || emailDraft ? { summary, warnings, nextAction, emailDraft } : null;
}

function displayText(value) {
  return [
    value.summary,
    value.warnings.length ? `Hinweise:\n${value.warnings.map(item => `• ${item}`).join("\n")}` : "",
    value.nextAction ? `Nächster Schritt: ${value.nextAction}` : "",
    value.emailDraft
  ].filter(Boolean).join("\n\n").slice(0, 4_000);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = String(env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
    if (origin && allowedOrigin && origin.replace(/\/$/, "") !== allowedOrigin) {
      return json(request, env, { error: "Origin nicht erlaubt." }, 403);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method !== "POST") return json(request, env, { error: "Nur POST ist erlaubt." }, 405);
    if (!env.OPENAI_API_KEY || !env.AI_GATEWAY_TOKEN) return json(request, env, { error: "Gateway ist noch nicht vollständig eingerichtet." }, 503);

    const authorization = request.headers.get("Authorization") || "";
    if (authorization !== `Bearer ${env.AI_GATEWAY_TOKEN}`) return json(request, env, { error: "Nicht autorisiert." }, 401);
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 20_000) return json(request, env, { error: "Anfrage ist zu groß." }, 413);

    let body;
    try {
      const rawBody = await request.text();
      if (rawBody.length > 20_000) return json(request, env, { error: "Anfrage ist zu groß." }, 413);
      body = JSON.parse(rawBody);
    }
    catch { return json(request, env, { error: "Ungültiges JSON." }, 400); }
    const mode = String(body?.mode || "");
    if (!allowedModes.has(mode)) return json(request, env, { error: "Unbekannter KI-Modus." }, 400);
    const context = sanitizeContext(body.context);

    try {
      const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.6-luna",
          instructions: taskInstruction(mode),
          input: JSON.stringify({ mode, locale: "de-AT", context }),
          max_output_tokens: 600,
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: "fdn_osd_assistant",
              strict: true,
              schema: assistantSchema
            }
          }
        })
      });
      const payload = await openAIResponse.json().catch(() => ({}));
      if (!openAIResponse.ok) return json(request, env, { error: "OpenAI-Anfrage fehlgeschlagen." }, 502);
      const raw = outputText(payload);
      if (!raw) return json(request, env, { error: "Keine strukturierte Antwort erhalten." }, 502);
      let data;
      try { data = sanitizeAssistantContent(JSON.parse(raw)); }
      catch { data = null; }
      if (!data) return json(request, env, { error: "KI-Antwort entspricht nicht dem erwarteten Schema." }, 502);
      return json(request, env, { text: displayText(data), data });
    } catch {
      return json(request, env, { error: "KI-Dienst ist vorübergehend nicht erreichbar." }, 502);
    }
  }
};
