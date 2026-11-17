// Qualification: deterministic rules first (cheap, explainable), AI fit on the free-text use case on top.
// The site carries a mirror of the rule part as an offline fallback (site/assets/apply.js → localScore).

const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|yandex|zoho|hey)\./i;

export const ENUMS = {
  role: ["ai_lead", "cto", "platform", "founder", "ic", "other"],
  building: ["customer_product", "internal", "prototype", "personal"],
  stack: ["pinecone", "qdrant", "weaviate", "milvus", "pgvector", "elastic", "homegrown", "none"],
  volume: ["lt10", "10_250", "250_5000", "gt5000", "unsure"],
  needs: ["citations", "cost", "sovereignty", "media", "agent_memory", "consolidate"],
  timeline: ["month", "quarter", "half", "research"],
  budget: ["approved", "if_proven", "build_case", "no"]
};

export function cleanAnswers(a = {}) {
  const one = (k) => (ENUMS[k].includes(a[k]) ? a[k] : "");
  const many = (k) => (Array.isArray(a[k]) ? [...new Set(a[k].filter(v => ENUMS[k].includes(v)))] : []);
  return {
    role: one("role"), building: one("building"), stack: many("stack"), volume: one("volume"),
    needs: many("needs"), timeline: one("timeline"), budget: one("budget"),
    usecase: String(a.usecase || "").trim().slice(0, 1500)
  };
}

export function ruleScore(a, email) {
  const reasons = [];
  if (a.building === "personal") return { hardDQ: true, score: 0, reasons: ["personal project"] };
  if (a.budget === "no") return { hardDQ: true, score: 0, reasons: ["no budget at this stage"] };
  if (a.building === "prototype" && a.timeline === "research") return { hardDQ: true, score: 0, reasons: ["prototype + researching"] };

  let s = 0;
  const add = (n, why) => { if (n) { s += n; reasons.push((n > 0 ? "+" : "") + n + " " + why); } };
  add({ ai_lead: 2, cto: 2, platform: 2, founder: 2, ic: 1 }[a.role] || 0, "role " + a.role);
  add({ customer_product: 3, internal: 2 }[a.building] || 0, "building " + a.building);
  add({ "10_250": 1, "250_5000": 2, gt5000: 2 }[a.volume] || 0, "volume " + a.volume);
  add({ month: 2, quarter: 2, half: 1 }[a.timeline] || 0, "timeline " + a.timeline);
  add({ approved: 3, if_proven: 2, build_case: 1 }[a.budget] || 0, "budget " + a.budget);
  if (a.needs.length >= 2) add(1, "2+ needs");
  if (a.needs.includes("sovereignty")) add(1, "sovereignty");
  if (a.stack.some(x => x !== "none")) add(1, "existing retrieval stack");
  add(FREE_MAIL.test(email) ? -2 : 1, FREE_MAIL.test(email) ? "personal email domain" : "work email");
  return { hardDQ: false, score: s, reasons };
}

// aiFit: 0 (no fit / spam) .. 3 (strong fit). null when AI unavailable → neutral.
export function decide(rule, aiFit, threshold) {
  if (rule.hardDQ) return { route: "dq", total: 0 };
  if (aiFit === 0) return { route: "dq", total: rule.score }; // AI flagged spam or clearly unrelated use case
  const total = rule.score + (aiFit == null ? 0 : aiFit - 1); // fit 1 → 0, 2 → +1, 3 → +2
  return { route: total >= threshold ? "qualified" : "dq", total };
}
