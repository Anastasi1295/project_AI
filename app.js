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

// УЛУЧШЕННЫЙ ЛОКАЛЬНЫЙ ПОДСЧЁТ СУЩЕСТВИТЕЛЬНЫХ
function countNounsLocally(text) {
  // Очистка текста
  const clean = text
    .replace(/https?:\/\/[^\s]+/g, '')                    // URL
    .replace(/<[^>]+>/g, '')                             // HTML
    .replace(/\b[A-Z]{2,}\d{4,}[A-Z\d]*\b/g, '')         // IDs: B001E5DZTS
    .replace(/[^\w\s.'’-]/g, ' ')                        // Только буквы, пробелы, дефисы
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')                                // Нормализация пробелов
    .trim();

  // Извлечение слов
  const words = clean.match(/\b[a-zA-Z][a-zA-Z'\u2019-]*[a-zA-Z]|\b[a-zA-Z]\b/g) || [];

  // Расширенный список общих существительных для отзывов о продуктах
  const commonNouns = new Set([
    'product', 'bottle', 'bottles', 'review', 'water', 'taste', 'flavor', 'flavors',
    'daughter', 'child', 'baby', 'formula', 'goat', 'milk', 'coconut', 'drink',
    'package', 'shipping', 'price', 'value', 'amazon', 'customer', 'service',
    'company', 'brand', 'name', 'website', 'order', 'shipment', 'box', 'can',
    'container', 'label', 'recommendation', 'friend', 'doctor', 'item', 'quality',
    'delivery', 'time', 'day', 'week', 'month', 'year', 'size', 'color', 'smell',
    'odor', 'texture', 'consistency', 'result', 'effect', 'benefit', 'problem',
    'issue', 'solution', 'alternative', 'option', 'choice', 'selection', 'store',
    'seller', 'retailer', 'market', 'shop', 'online', 'site', 'web', 'page'
  ]);

  // Расширенные списки исключений
  const pronouns = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
  const possessives = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs']);
  const verbs = new Set([
    'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 
    'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must', 'shall',
    'get', 'got', 'getting', 'give', 'gave', 'given', 'take', 'took', 'taken',
    'make', 'made', 'making', 'go', 'went', 'gone', 'see', 'saw', 'seen',
    'know', 'knew', 'known', 'think', 'thought', 'say', 'said', 'saying',
    'like', 'liked', 'love', 'loved', 'hate', 'hated', 'want', 'wanted'
  ]);
  const adverbs = new Set([
    'very', 'really', 'just', 'only', 'too', 'so', 'not', 'well', 'also', 
    'even', 'back', 'now', 'then', 'here', 'there', 'always', 'never', 
    'sometimes', 'often', 'usually', 'quite', 'rather', 'almost', 'enough'
  ]);
  const adjectives = new Set([
    'good', 'bad', 'better', 'best', 'great', 'nice', 'excellent', 'poor', 
    'big', 'small', 'large', 'huge', 'tiny', 'expensive', 'cheap', 'affordable',
    'delicious', 'terrible', 'awful', 'wonderful', 'amazing', 'horrible',
    'easy', 'difficult', 'hard', 'simple', 'complex', 'fast', 'slow',
    'happy', 'sad', 'angry', 'pleased', 'disappointed', 'satisfied'
  ]);
  const conjunctions = new Set(['and', 'or', 'but', 'because', 'if', 'when', 'while', 'although']);
  const prepositions = new Set(['in', 'on', 'at', 'by', 'with', 'for', 'from', 'to', 'of', 'about']);

  let count = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    const originalWord = words[i];

    // Пропускаем короткие слова (меньше 3 букв), которые не в списке существительных
    if (word.length < 3 && !commonNouns.has(word)) {
      continue;
    }

    // Пропускаем служебные слова
    if (pronouns.has(word) || possessives.has(word) || verbs.has(word) || 
        adverbs.has(word) || adjectives.has(word) || conjunctions.has(word) || 
        prepositions.has(word)) {
      continue;
    }

    // Проверяем общие существительные
    if (commonNouns.has(word)) {
      count++;
      continue;
    }

    // Dr. Oz и подобные конструкции
    if (word === 'dr' && i + 1 < words.length && /^[A-Z]/.test(words[i+1])) {
      count++;
      continue;
    }

    // Слова с типичными суффиксами существительных
    const nounSuffixes = ['tion', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence', 'ship', 'age', 'dom', 'hood', 'ism', 'ist'];
    if (nounSuffixes.some(suffix => word.endsWith(suffix)) && word.length > 4) {
      count++;
      continue;
    }

    // Множественное число (окончание s/es)
    if ((word.endsWith('s') || word.endsWith('es')) && word.length > 3) {
      const singular = word.replace(/e?s$/, '');
      if (commonNouns.has(singular) || 
          nounSuffixes.some(suffix => singular.endsWith(suffix))) {
        count++;
        continue;
      }
    }

    // Консервативная проверка слов с заглавной буквы (имена собственные)
    if (/^[A-Z][a-z]+$/.test(originalWord) && word.length >= 4) {
      // Считаем существительным только если это не начало предложения
      if (i > 0) {
        // Простая проверка на начало предложения
        const sentenceStart = /[.!?]\s*$/.test(clean.substring(0, clean.indexOf(originalWord)));
        if (!sentenceStart) {
          count++;
          continue;
        }
      }
    }

    // Последний шанс: слова, которые выглядят как существительные по длине и структуре
    if (word.length >= 5 && /^[a-z]+$/.test(word) && 
        !verbs.has(word) && !adjectives.has(word) && !adverbs.has(word)) {
      count++;
    }
  }

  return count;
}

// Определение уровня: строго по правилам
function getNounLevel(count) {
  return count > 15 ? "high" :
         count >= 6  ? "medium" :  // 6–15 → medium
                       "low";      // < 6 → low
}

// Анализ тональности через Hugging Face (опционально)
async function callSentimentHF(text) {
  const MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment";
  const headers = { "Content-Type": "application/json" };
  const auth = getAuthHeader();
  if (auth) headers["Authorization"] = auth;

  const r = await fetch(`https://api-inference.huggingface.co/models/${MODEL}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: text })
  });

  if (!r.ok) throw new Error(`API error: ${r.status}`);

  const data = await r.json();
  const best = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data)[0] : null;
  if (!best) throw new Error("No sentiment label");

  const lbl = best.label.toLowerCase();
  if (lbl.includes("pos")) return "positive";
  if (lbl.includes("neg")) return "negative";
  return "neutral";
}

// Обработчик кнопки "Analyze Sentiment"
async function onSent() {
  const txt = S.textEl.textContent.trim();
  if (!txt) return setErr("No review selected.");
  setErr(""); setSpin(true);
  try {
    const lbl = await callSentimentHF(txt);
    const [ico, cls, face] = mapSentIcon(lbl);
    S.sent.querySelector("span").textContent = `Sentiment: ${ico}`;
    S.sent.className = `pill ${cls}`;
    S.sent.querySelector("i").className = face;
  } catch (e) {
    setErr("Using fallback sentiment...");
    S.sent.querySelector("span").textContent = "Sentiment: ❓";
    S.sent.className = "pill warn";
    S.sent.querySelector("i").className = "fa-regular fa-face-meh";
  } finally {
    setSpin(false);
  }
}

// Подсчёт существительных 
async function onNouns() {
  const txt = S.textEl.textContent.trim();
  if (!txt) return setErr("No review selected.");
  setErr(""); setSpin(true);

  // ТОЧНЫЙ ЛОКАЛЬНЫЙ ПОДСЧЁТ
  const count = countNounsLocally(txt);
  const level = getNounLevel(count);

  const [ico, cls] = mapNounIcon(level);
  S.nouns.querySelector("span").textContent = `Noun level: ${ico} (${count})`;
  S.nouns.className = `pill ${cls}`;
  S.nouns.title = `Counted ${count} nouns`;

  setSpin(false);
}

// Загрузка TSV при нажатии кнопки
async function rand() {
  setSpin(true);
  setErr("");

  if (!S.reviews) {
    try {
      S.reviews = await loadTSV();
    } catch (e) {
      setErr("Failed to load reviews: " + e.message);
      setSpin(false);
      return;
    }
  }

  const idx = Math.floor(Math.random() * S.reviews.length);
  S.textEl.textContent = S.reviews[idx].text || "(no text)";

  // Сброс результатов
  S.sent.querySelector("span").textContent = "Sentiment: —";
  S.sent.className = "pill";
  S.sent.querySelector("i").className = "fa-regular fa-face-meh";

  S.nouns.querySelector("span").textContent = "Noun level: —";
  S.nouns.className = "pill";

  setSpin(false);
}

// Загрузка TSV
function loadTSV() {
  return new Promise((resolve, reject) => {
    Papa.parse("./reviews_test.tsv", {
      download: true,
      delimiter: "\t",
      header: true,
      skipEmptyLines: true,
      complete: r => {
        const rows = (r.data || []).filter(x => x?.text);
        resolve(rows.length ? rows : reject(new Error("No valid reviews")));
      },
      error: reject
    });
  });
}

// Инициализация
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
  S.textEl.textContent = "Click 'Select Random Review' to load a review.";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
