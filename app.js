// Глобальный объект состояния для хранения DOM-элементов и данных
const S = {};

// Управление индикатором загрузки и блокировкой кнопок
// Показывает спиннер и отключает все кнопки, если v = true
function setSpin(v) {
  S.spin.style.display = v ? "inline-flex" : "none";
  S.btnRandom.disabled = v;
  S.btnSent.disabled = v;
  S.btnNouns.disabled = v;
}

// Отображение/скрытие сообщений об ошибках
// Если текст ошибки пустой — скрывает блок, иначе показывает
function setErr(t) {
  if (!t) {
    S.err.style.display = "none";
    S.err.textContent = "";
    return;
  }
  S.err.style.display = "block";
  S.err.textContent = t;
}

// Маппинг результата тональности в эмодзи, цветовой класс и иконку Font Awesome
// Возвращает массив: [эмодзи, CSS-класс, иконка]
function mapSentIcon(lbl) {
  if (lbl === "positive") return ["👍", "good", "fa-regular fa-face-smile"];
  if (lbl === "negative") return ["👎", "bad", "fa-regular fa-face-frown"];
  if (lbl === "neutral") return ["❓", "warn", "fa-regular fa-face-meh"];
  return ["❓", "warn", "fa-regular fa-face-meh"];
}

// Маппинг уровня количества существительных в эмодзи и цветовой класс
// Используется для визуального отображения плотности существительных
function mapNounIcon(lbl) {
  if (lbl === "high" || lbl === "many") return ["🟢", "good"];
  if (lbl === "medium") return ["🟡", "warn"];
  if (lbl === "low" || lbl === "few") return ["🔴", "bad"];
  return ["—", "warn"];
}

// Извлекает первую строку текста, приводит к нижнему регистру и удаляет пробелы по краям
// Используется для нормализации ответов моделей
function firstLineLower(t) {
  return (t || "").split(/\r?\n/)[0].toLowerCase().trim();
}

// Нормализует сырой ответ модели в одну из трёх категорий: positive / negative / neutral
// Поддерживает мультиязычные варианты и опечатки
function normalizeResp(raw) {
  let s = firstLineLower(raw).replace(/^[^a-zа-яё]+/i, "");
  if (/positive|positif|положит|хорош|good/.test(s)) return "positive";
  if (/negative|negatif|отрицат|плох|bad/.test(s)) return "negative";
  if (/neutral|нейтр/.test(s)) return "neutral";
  return s; // возвращаем как есть, если не удалось распознать
}

// Нормализует ответ модели в уровень количества существительных: high / medium / low
// Учитывает числовые диапазоны и синонимы на английском и русском
function normalizeLevel(raw) {
  let s = firstLineLower(raw);
  if (/\b(high|many|>?\s*15|\bmore than 15\b|более\s*15|много)\b/.test(s)) return "high";
  if (/\b(medium|6-15|6 to 15|средн|от\s*6\s*до\s*15)\b/.test(s)) return "medium";
  if (/\b(low|few|<\s*6|мало|менее\s*6)\b/.test(s)) return "low";
  return s;
}

// Список резервных генеративных моделей (если специализированные недоступны)
const TEXTGEN_MODELS = [
  "HuggingFaceH4/smol-llama-3.2-1.7B-instruct",
  "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
];

// Основная модель для анализа тональности отзывов (мультиязычная)
const SENTIMENT_MODEL = "cardiffnlp/twitter-xlm-roberta-base-sentiment";

// Модели для POS-теггинга (определение частей речи, включая существительные)
const POS_MODELS = [
  "vblagoje/bert-english-uncased-finetuned-pos",
  "vblagoje/bert-english-cased-finetuned-pos"
];

// Активные модели (отслеживаются для отображения в title элементов)
let ACTIVE_TEXTGEN_MODEL = TEXTGEN_MODELS[0];
let ACTIVE_SENT_MODEL = SENTIMENT_MODEL;
let ACTIVE_POS_MODEL = POS_MODELS[0];

// Получает заголовок авторизации, если токен указан в поле ввода
// Удаляет лишние пробелы и переносы
function getAuthHeader() {
  const el = S.token;
  const tok = el && el.value ? el.value.trim().replace(/[\s\r\n\t]+/g, "") : "";
  return tok ? ("Bearer " + tok) : null;
}

// Универсальный запрос к Hugging Face Inference API
// Обрабатывает ошибки: 401, 402, 429, 404 и прочие
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

// Анализ тональности: сначала использует специализированную модель,
// при ошибке — резервно обращается к генеративной
async function callSentimentHF(text) {
  const data = await hfRequest(SENTIMENT_MODEL, {
    inputs: text,
    options: { wait_for_model: true, use_cache: false }
  });
  // Обработка формата ответа (возможны разные структуры)
  const arr = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : (Array.isArray(data) ? data : []);
  // Находим метку с максимальным score
  let best = arr.reduce((a, b) => (a && a.score > b.score) ? a : b, null) || arr[0];
  if (!best) throw new Error("Empty response from sentiment model");
  const lbl = best.label.toLowerCase();
  // Преобразуем метку в наш формат
  if (/pos/.test(lbl)) return "positive";
  if (/neu/.test(lbl)) return "neutral";
  if (/neg/.test(lbl)) return "negative";
  // Резерв: генеративная модель
  return await callTextGenHF(
    "Classify this review as positive, negative, or neutral. Return only one word.",
    text
  ).then(normalizeResp);
}

// Подсчёт существительных через POS-теггинг
// Перебирает доступные модели, при неудаче — использует генеративную
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
      // Считаем только NOUN и PROPN (существительные и собственные имена)
      for (const tok of flat) {
        const tag = (tok.entity_group || tok.entity || "").toUpperCase();
        if (tag.includes("NOUN") || tag.includes("PROPN") || ["NN", "NNS", "NNP", "NNPS"].includes(tag)) {
          count++;
        }
      }
      ACTIVE_POS_MODEL = m; // запоминаем активную модель
      return count > 15 ? "high" : count >= 6 ? "medium" : "low";
    } catch (e) {
      lastErr = e;
    }
  }
  // Резерв: генеративная модель
  const out = await callTextGenHF(
    "Count the nouns in this review and return only High (>15), Medium (6-15), or Low (<6). Return only one of: High, Medium, Low.",
    text
  );
  return normalizeLevel(out);
}

// Вызов генеративной модели (резервный путь)
// Перебирает модели, пока одна не ответит
async function callTextGenHF(prompt, text) {
  let lastErr = null;
  for (const m of TEXTGEN_MODELS) {
    try {
      const data = await hfRequest(m, {
        inputs: `${prompt}\n\nTEXT:\n${text}\n\nANSWER:`,
        parameters: { max_new_tokens: 32, temperature: 0, return_full_text: false },
        options: { wait_for_model: true, use_cache: false }
      });
      // Извлечение сгенерированного текста из разных возможных форматов ответа
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

// Выбор случайного отзыва из загруженного списка и его отображение
function rand() {
  if (!S.reviews.length) { setErr("No reviews loaded."); return; }
  const i = Math.floor(Math.random() * S.reviews.length);
  S.textEl.textContent = S.reviews[i].text || "";
  // Сброс результатов анализа
  S.sent.querySelector("span").textContent = "Sentiment: —";
  S.sent.className = "pill";
  S.sent.querySelector("i").className = "fa-regular fa-face-meh";
  S.nouns.querySelector("span").textContent = "Noun level: —";
  S.nouns.className = "pill";
  setErr("");
}

// Обработчик кнопки "Analyze Sentiment"
// Проверяет ввод, вызывает анализ, обновляет UI
async function onSent() {
  const txt = S.textEl.textContent.trim();
  if (!txt) { setErr("Select a review first."); return; }
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

// Обработчик кнопки "Count Nouns"
// Проверяет ввод, вызывает подсчёт, обновляет UI
async function onNouns() {
  const txt = S.textEl.textContent.trim();
  if (!txt) { setErr("Select a review first."); return; }
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

// Загрузка и парсинг TSV-файла с помощью Papa Parse
function fetchTSV(url) {
  return new Promise((res, rej) => {
    if (typeof Papa === "undefined") { rej(new Error("Papa Parse not loaded")); return; }
    Papa.parse(url, {
      download: true,
      delimiter: "\t",
      header: true,
      skipEmptyLines: true,
      complete: r => {
        const rows = (r.data || []).filter(x => x && x.text); // фильтр по наличию текста
        res(rows);
      },
      error: e => rej(e)
    });
  });
}

// Поиск TSV-файла по нескольким возможным путям
// Полезно при развёртывании на GitHub Pages с разными именами файлов
async function loadTSV() {
  const candidates = ["./reviews_test.tsv", "./reviews_test (1).tsv", "./reviews_test%20(1).tsv"];
  for (const c of candidates) {
    try {
      const rows = await fetchTSV(c);
      if (rows.length) return rows;
    } catch (_) { }
  }
  throw new Error("TSV not found");
}

// Инициализация приложения: привязка DOM, обработчиков, загрузка данных
function init() {
  S.reviews = [];
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

  // Загрузка TSV и выбор первого отзыва
  (async () => {
    try {
      S.reviews = await loadTSV();
      rand();
    } catch (e) {
      setErr("Failed to load TSV: " + e.message);
    }
  })();
}

// Запуск инициализации после полной загрузки DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
