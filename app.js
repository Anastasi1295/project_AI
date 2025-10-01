const S = {};

function setSpin(v) {
  S.spin.style.display = v ? "inline-flex" : "none";
  S.btnRandom.disabled = v;
  S.btnSent.disabled = v;
  S.btnNouns.disabled = v;
}

function setErr(t) {
  if (!t) {
    S.err.style.display = "none";
    S.err.textContent = "";
    return;
  }
  S.err.style.display = "block";
  S.err.textContent = t;
}

function mapSentIcon(lbl) {
  if (lbl === "positive") return ["👍", "good", "fa-regular fa-face-smile"];
  if (lbl === "negative") return ["👎", "bad", "fa-regular fa-face-frown"];
  if (lbl === "neutral") return ["❓", "warn", "fa-regular fa-face-meh"];
  return ["❓", "warn", "fa-regular fa-face-meh"];
}

function mapNounIcon(lbl) {
  if (lbl === "high") return ["🟢", "good"];
  if (lbl === "medium") return ["🟡", "warn"];
  if (lbl === "low") return ["🔴", "bad"];
  return ["—", "warn"];
}

// Единая модель для резерва (если нужно)
const FALLBACK_MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0";

function getAuthHeader() {
  const token = S.token?.value.trim();
  return token ? `Bearer ${token.replace(/\s+/g, "")}` : null;
}

// ЛОКАЛЬНЫЙ ПОДСЧЁТ СУЩЕСТВИТЕЛЬНЫХ — ТОЧНЫЙ И ПОЛНЫЙ
function countNounsLocally(text) {
  // Очистка текста
  const clean = text
    .replace(/https?:\/\/[^\s]+/g, '')                    // URL
    .replace(/<[^>]+>/g, '')                             // HTML
    .replace(/\b[A-Z]{2,}\d{4,}[A-Z\d]*\b/g, '')         // IDs: B001E5DZTS
    .replace(/[^\w\s.'’-]/g, ' ')                        // Только буквы, пробелы, дефисы
    .replace(/\.{2,}/g, ' ');

  // Извлечение слов
  const words = clean.match(/\b[a-zA-Z][a-zA-Z'\u2019-]*[a-zA-Z]|\b[a-zA-Z]\b/g) || [];

  // Список общих существительных
  const commonNouns = new Set([
    'product', 'bottle', '
