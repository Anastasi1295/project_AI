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
  if (lbl === "positive") return ["👍", "good"];
  if (lbl === "negative") return ["👎", "bad"];
  if (lbl === "neutral") return ["❓", "warn"];
  return ["❓", "warn"];
}

function mapNounIcon(lbl) {
  if (lbl === "high") return ["🟢", "good"];
  if (lbl === "medium") return ["🟡", "warn"];
  if (lbl === "low") return ["🔴", "bad"];
  return ["—", "warn"];
}

// Извлекает первую строку, приводит к нижнему регистру
function firstLineLower(text) {
  return (text || "").split(/\r?\n/)[0].trim().toLowerCase();
}

// Основная модель (вместо нерабочего falcon-7b-instruct)
const MODEL_ID = "HuggingFaceH4/zephyr-7b-beta";

// Получение Bearer-токена, если указан
function getAuthHeader() {
  const tokenEl = S.token;
  const token = tokenEl?.value.trim();
  return token ? `Bearer ${token.replace(/\s+/g, "")}` : null;
}

// Универсальная функция вызова модели
async function callApi(prompt, text) {
  const fullPrompt = `${prompt}
  
Review:
\`\`\`
${text}
\`\`\``;

  const body = {
    inputs: fullPrompt,
    parameters: {
      max_new_tokens: 32,
      temperature: 0,
      return_full_text: false
    },
    options: {
      wait_for_model: true,
      use_cache: false
    }
  };

  const headers = {
    "Content-Type": "application/json"
  };
  const auth = getAuthHeader();
  if (auth) headers["Authorization"] = auth;

  try {
    const r = await fetch(`https://api-inference.huggingface.co/models/${MODEL_ID}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (r.status === 401) throw new Error("401 Unauthorized – проверьте токен");
    if (r.status === 402) throw new Error("402 Payment required – требуется платная подписка");
    if (r.status === 429) throw new Error("429 Rate limited – слишком много запросов");
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Ошибка ${r.status}: ${errText.slice(0, 100)}`);
    }

    const data = await r.json();
    return Array.isArray(data) && data[0]?.generated_text
      ? data[0].generated_text
      : (data?.generated_text || "");
  } catch (error) {
    // Проброс ошибки для обработки в UI
    throw error;
  }
}

// Анализ тональности по правилам из промта
async function onSent() {
  const text = S.textEl.textContent.trim();
  if (!text) {
    setErr("Select a review first.");
    return;
  }
  setSpin(true);
  setErr("");
  try {
    const prompt = `Read the customer review between triple quotes and decide the overall sentiment. Rules:
- Judge overall tone and intent, not isolated words.
- Ignore sarcasm unless clearly signaled.
- Ignore star/emoji counts and metadata.
- If uncertain, choose "neutral".
Return only one word: positive, negative, or neutral.`;
    const raw = await callApi(prompt, text);
    const resp = firstLineLower(raw);

    let label = "neutral"; // default
    if (resp.includes("positive")) label = "positive";
    else if (resp.includes("negative")) label = "negative";
    else if (resp.includes("neutral")) label = "neutral";

    const [ico, cls] = mapSentIcon(label);
    S.sent.querySelector("span").textContent = `Sentiment: ${ico}`;
    S.sent.className = `pill ${cls}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Подсчёт существительных по строгим правилам
async function onNouns() {
  const text = S.textEl.textContent.trim();
  if (!text) {
    setErr("Select a review first.");
    return;
  }
  setSpin(true);
  setErr("");
  try {
    const prompt = `From the review between triple quotes, count how many tokens are NOUNS, then map the count to a level. Rules:
- Tokenize the text (treat hyphenated terms as one token).
- Select ONLY nouns: common and proper, singular or plural (e.g., “product”, “bottles”, “Amazon”, “Dr. Oz”).
- DO NOT count: pronouns, verbs, adjectives, adverbs, numbers, dates, interjections, symbols, or emojis.
- Count all noun tokens (repeated nouns count each time they appear).
- Ignore HTML, URLs, and IDs.
LEVEL RULES:
- high → noun count > 15
- medium → noun count 6–15
- low → noun count < 6
Return exactly one word in lowercase — high, medium, or low — on the FIRST line. No punctuation or extra text.`;
    const raw = await callApi(prompt, text);
    const resp = firstLineLower(raw);

    let level = "medium"; // fallback
    if (resp.startsWith("high") || /\bhigh\b/.test(resp)) level = "high";
    else if (resp.startsWith("medium") || /\bmedium\b/.test(resp)) level = "medium";
    else if (resp.startsWith("low") || /\blow\b/.test(resp)) level = "low";

    const [ico, cls] = mapNounIcon(level);
    S.nouns.querySelector("span").textContent = `Noun level: ${ico}`;
    S.nouns.className = `pill ${cls}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Выбор случайного отзыва
function rand() {
  if (!S.reviews?.length) {
    setErr("No reviews loaded.");
    return;
  }
  const idx = Math.floor(Math.random() * S.reviews.length);
  S.textEl.textContent = S.reviews[idx].text || "(no text)";
  S.sent.querySelector("span").textContent = "Sentiment: —";
  S.sent.className = "pill";
  S.nouns.querySelector("span").textContent = "Noun level: —";
  S.nouns.className = "pill";
  setErr("");
}

// Загрузка TSV через Papa Parse
function loadTSV() {
  return new Promise((resolve, reject) => {
    Papa.parse("./reviews_test.tsv", {
      download: true,
      delimiter: "\t",
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data || []).filter(r => r.text);
        if (rows.length === 0) return reject(new Error("No reviews found in TSV"));
        resolve(rows);
      },
      error: (err) => reject(new Error(`TSV load failed: ${err}`))
    });
  });
}

// Инициализация при загрузке DOM
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

  loadTSV()
    .then(reviews => {
      S.reviews = reviews;
      rand();
    })
    .catch(err => {
      setErr("Failed to load reviews: " + err.message);
    });
}

// Запуск
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init)
  : init();
