const S = {};

// Управление индикатором загрузки и блокировкой кнопок
function setSpin(v) {
  S.spin.style.display = v ? "inline-flex" : "none";
  S.btnRandom.disabled = v;
  S.btnSent.disabled = v;
  S.btnNouns.disabled = v;
}

// Отображение/скрытие сообщений об ошибках
function setErr(t) {
  if (!t) {
    S.err.style.display = "none";
    S.err.textContent = "";
    return;
  }
  S.err.style.display = "block";
  S.err.textContent = t;
}

// Маппинг результата тональности
function mapSentIcon(lbl) {
  if (lbl === "positive") return ["👍", "good", "fa-regular fa-face-smile"];
  if (lbl === "negative") return ["👎", "bad", "fa-regular fa-face-frown"];
  if (lbl === "neutral") return ["❓", "warn", "fa-regular fa-face-meh"];
  return ["❓", "warn", "fa-regular fa-face-meh"];
}

// Маппинг уровня существительных
function mapNounIcon(lbl) {
  if (lbl === "high" || lbl === "many") return ["🟢", "good"];
  if (lbl === "medium") return ["🟡", "warn"];
  if (lbl === "low" || lbl === "few") return ["🔴", "bad"];
  return ["—", "warn"];
}

// Извлечение первой строки и приведение к нижнему регистру
function firstLineLower(t) {
  return (t || "").split(/\r?\n/)[0].toLowerCase().trim();
}

// Нормализация ответа модели в positive/negative/neutral
function normalizeResp(raw) {
  let s = firstLineLower(raw).replace(/^[^a-zа-яё]+/i, "");
  if (/positive|positif|положит|хорош|good/.test(s)) return "positive";
  if (/negative|negatif|отрицат|плох|bad/.test(s)) return "negative";
  if (/neutral|нейтр/.test(s)) return "neutral";
  return s;
}

// Нормализация уровня существительных
function normalizeLevel(raw) {
  let s = firstLineLower(raw);
  if (/\b(high|many|>?\s*15|\bmore than 15\b|более\s*15|много)\b/.test(s)) return "high";
  if (/\b(medium|6-15|6 to 15|средн|от\s*6\s*до\s*15)\b/.test(s)) return "medium";
  if (/\b(low|few|<\s*6|мало|менее\s*6)\b/.test(s)) return "low";
  return s;
}

// Модели
const TEXTGEN_MODELS = [
  "HuggingFaceH4/smol-llama-3.2-1.7B-instruct",
  "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
];
const SENTIMENT_MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment";
const POS_MODELS = [
  "vblagoje/bert-english-uncased-finetuned-pos",
  "vblagoje/bert-english-cased-finetuned-pos"
];

let ACTIVE_TEXTGEN_MODEL = TEXTGEN_MODELS[0];
let ACTIVE_SENT_MODEL = SENTIMENT_MODEL;
let ACTIVE_POS_MODEL = POS_MODELS[0];

// Получение Bearer-токена
function getAuthHeader() {
  const el = S.token;
  const tok = el && el.value ? el.value.trim().replace(/[\s\r\n\t]+/g, "") : "";
  return tok ? ("Bearer " + tok) : null;
}

// Запрос к Hugging Face API
async function hfRequest(modelId, body) {
  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  const auth = getAuthHeader();
  if (auth) headers["Authorization"] = auth;

  const r = await fetch(url, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    headers,
    body: JSON.stringify(body)
  });

  if (r.status === 401) throw new Error("401 Unauthorized (укажите валидный HF токен hf_… с правом Read)");
  if (r.status === 402) throw new Error("402 Payment required");
  if (r.status === 429) throw new Error("429 Rate limited");
  if (r.status === 404 || r.status === 403) throw new Error(`Model ${modelId} unavailable (${r.status})`);
  if (!r.ok) {
    const e = await r.text();
    throw new Error(`API error ${r.status}: ${e.slice(0, 200)}`);
  }
  return r.json();
}

// Анализ тональности
async function callSentimentHF(text) {
  const data = await hfRequest(SENTIMENT_MODEL, {
    inputs: text,
    options: { wait_for_model: true, use_cache: false }
  });
  const arr = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : (Array.isArray(data) ? data : []);
  let best = arr.reduce((a, b) => (a && a.score > b.score) ? a : b, null) || arr[0];
  if (!best) throw new Error("Empty response from sentiment model");
  const lbl = best.label.toLowerCase();
  if (/pos/.test(lbl)) return "positive";
  if (/neu/.test(lbl)) return "neutral";
  if (/neg/.test(lbl)) return "negative";
  return await callTextGenHF(
    "Classify this review as positive, negative, or neutral. Return only one word.",
    text
  ).then(normalizeResp);
}

// Улучшенная функция подсчёта существительных
function countNounsLocally(text) {
  // Очищаем текст от мусора
  const clean = text
    .replace(/https?:\/\/[^\s]+/g, '')                    // URL
    .replace(/<[^>]+>/g, '')                             // HTML
    .replace(/\b[A-Z]{2,}\d{4,}[A-Z\d]*\b/g, '')         // IDs: B001E5DZTS
    .replace(/[^\w\s.'’-]/g, ' ')                        // Символы, кроме апострофов и дефисов
    .replace(/\.{2,}/g, ' ');                            // Многоточие

  // Разбиваем на слова, сохраняя апострофы и дефисы
  const words = clean.match(/\b[a-zA-Z][a-zA-Z'\u2019-]*[a-zA-Z]|\b[a-zA-Z]\b/g) || [];

  const commonNouns = new Set([
    'product', 'bottle', 'bottles', 'review', 'water', 'taste', 'flavor', 'flavors',
    'daughter', 'child', 'baby', 'formula', 'goat', 'milk', 'coconut', 'drink',
    'package', 'shipping', 'price', 'value', 'amazon', 'customer', 'service',
    'company', 'brand', 'name', 'website', 'order', 'shipment', 'box', 'can',
    'container', 'label', 'recommendation', 'friend', 'doctor', 'dr', 'oz'
  ]);

  let count = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();

    // Пропускаем местоимения, глаголы, прилагательные
    if (['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'].includes(word)) continue;
    if (['this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their'].includes(word)) continue;
    if (['is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'].includes(word)) continue;
    if (['very', 'really', 'just', 'only', 'too', 'so', 'not', 'well'].includes(word)) continue;

    // Проверяем общие существительные
    if (commonNouns.has(word)) {
      count++;
      continue;
    }

    // Обработка собственных имён: Dr. Oz → Dr, Oz
    if (word === 'dr' && i + 1 < words.length && /^[A-Z]/.test(words[i+1])) {
      count++;
      continue;
    }

    // Слово с заглавной буквы не в начале предложения → вероятно, имя собственное
    if (/^[A-Z][a-z]+$/.test(words[i]) && i > 0) {
      const prev = words[i - 1];
      const sentenceStart = ['.', '!', '?'].includes(prev?.slice(-1)) || i === 0;
      if (!sentenceStart) {
        count++;
        continue;
      }
    }
  }

  return count;
}

// Подсчёт существительных через POS + улучшенный fallback
async function callNounsPOSHF(text) {
  let lastErr = null;
  for (const m of POS_MODELS) {
    try {
      const data = await hfRequest(m, {
        inputs: text,
        options: { wait_for_model: true, use_cache: false }
      });
      const flat = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : (Array.isArray(data) ? data : []);
      if (!flat.length) throw new Error("Empty POS response");

      let count = 0;
      for (const tok of flat) {
        const tag = (tok.entity_group || tok.entity || "").toUpperCase();
        if (tag.includes("NOUN") || tag.includes("PROPN") || ["NN", "NNS", "NNP", "NNPS"].includes(tag)) {
          count++;
        }
      }

      ACTIVE_POS_MODEL = m;
      const level = count > 15 ? "high" : count >= 6 ? "medium" : "low";

      // ВАЖНО: делаем дополнительную проверку локально, если уровень вызывает сомнения
      const localCount = countNounsLocally(text);
      const localLevel = localCount > 15 ? "high" : localCount >= 6 ? "medium" : "low";

      // Если разница больше 3 — доверяем локальному анализу больше
      if (Math.abs(count - localCount) > 3) {
        return localLevel;
      }

      return level;
    } catch (e) {
      lastErr = e;
    }
  }

  // Резерв: полагаемся только на локальный подсчёт
  const count = countNounsLocally(text);
  const level = count > 15 ? "high" : count >= 6 ? "medium" : "low";
  return level;
}

// Генеративная модель (резерв)
async function callTextGenHF(prompt, text) {
  let lastErr = null;
  for (const m of TEXTGEN_MODELS) {
    try {
      const data = await hfRequest(m, {
        inputs: `${prompt}\n\nTEXT:\n${text}\n\nANSWER:`,
        parameters: { max_new_tokens: 32, temperature: 0, return_full_text: false },
        options: { wait_for_model: true, use_cache: false }
      });
      const txt = Array.isArray(data) && data[0]?.generated_text
        ? data[0].generated_text
        : (data?.generated_text ?? (typeof data === "string" ? data : JSON.stringify(data)));
      ACTIVE_TEXTGEN_MODEL = m;
      return txt;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All text-generation models unavailable");
}

// === ОСНОВНОЕ ИЗМЕНЕНИЕ: Загрузка TSV происходит ТОЛЬКО при нажатии на кнопку ===
async function rand() {
  setSpin(true);
  setErr("");

  if (!S.reviews || S.reviews.length === 0) {
    try {
      S.reviews = await loadTSV();
    } catch (e) {
      setErr("Failed to load reviews: " + e.message);
      setSpin(false);
      return;
    }
  }

  const i = Math.floor(Math.random() * S.reviews.length);
  S.textEl.textContent = S.reviews[i].text || "";

  S.sent.querySelector("span").textContent = "Sentiment: —";
  S.sent.className = "pill";
  S.sent.querySelector("i").className = "fa-regular fa-face-meh";

  S.nouns.querySelector("span").textContent = "Noun level: —";
  S.nouns.className = "pill";

  setSpin(false);
}

// Обработчик анализа тональности
async function onSent() {
  const txt = S.textEl.textContent.trim();
  if (!txt) { setErr("No review selected. Click 'Select Random Review' first."); return; }
  setErr(""); setSpin(true);
  try {
    const lbl = await callSentimentHF(txt);
    const [ico, cls, face] = mapSentIcon(lbl);
    S.sent.querySelector("span").textContent = "Sentiment: " + ico;
    S.sent.className = "pill " + cls;
    S.sent.querySelector("i").className = face;
    S.sent.title = `model: ${ACTIVE_SENT_MODEL || ACTIVE_TEXTGEN_MODEL}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Обработчик подсчёта существительных
async function onNouns() {
  const txt = S.textEl.textContent.trim();
  if (!txt) { setErr("No review selected. Click 'Select Random Review' first."); return; }
  setErr(""); setSpin(true);
  try {
    const lvl = await callNounsPOSHF(txt);
    const [ico, cls] = mapNounIcon(lvl);
    S.nouns.querySelector("span").textContent = "Noun level: " + ico;
    S.nouns.className = "pill " + cls;
    S.nouns.title = `model: ${ACTIVE_POS_MODEL || ACTIVE_TEXTGEN_MODEL}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Загрузка TSV
function fetchTSV(url) {
  return new Promise((res, rej) => {
    if (typeof Papa === "undefined") return rej(new Error("Papa Parse not loaded"));
    Papa.parse(url, {
      download: true,
      delimiter: "\t",
      header: true,
      skipEmptyLines: true,
      complete: r => {
        const rows = (r.data || []).filter(x => x && x.text);
        res(rows);
      },
      error: e => rej(e)
    });
  });
}

// Поиск TSV по возможным путям
async function loadTSV() {
  const candidates = ["./reviews_test.tsv", "./reviews_test (1).tsv", "./reviews_test%20(1).tsv"];
  for (const c of candidates) {
    try {
      const rows = await fetchTSV(c);
      if (rows.length) return rows;
    } catch (_) {}
  }
  throw new Error("reviews_test.tsv not found at any location.");
}

// Инициализация DOM
function init() {
  S.textEl = document.getElementById("text");
  S.err = document.getElementById("err");
  S.spin = document.getElementById("spin");
  S.btnRandom = document.getElementById("btnRandom");
  S.btnSent = document.getElementById("btnSent");
  S.btnNouns = document.getElementById("btnNouns");
  S.token = document.getElementById("token") || document.getElementById("tokenInput");
  S.sent = document.getElementById("sent");
  S.nouns = document.getElementById("nouns");

  S.btnRandom.addEventListener("click", rand);
  S.btnSent.addEventListener("click", onSent);
  S.btnNouns.addEventListener("click", onNouns);

  S.reviews = null;
  S.textEl.textContent = "Click 'Select Random Review' to load and display a review.";
}

// Запуск после загрузки DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
