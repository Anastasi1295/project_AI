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

// РАБОТАЮЩАЯ модель вместо falcon-7b-instruct
const MODEL_ID = "HuggingFaceH4/zephyr-7b-beta";

function getAuthHeader() {
  const token = S.token?.value.trim();
  return token ? `Bearer ${token.replace(/\s+/g, "")}` : null;
}

// Единая функция callApi(prompt, text)
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
    if (r.status === 402) throw new Error("402 Payment required – нужна Pro-подписка");
    if (r.status === 429) throw new Error("429 Rate limited – слишком много запросов");
    if (r.status === 503) throw new Error("503 Model is loading – подождите");
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Ошибка ${r.status}: ${errText.slice(0, 100)}`);
    }

    const data = await r.json();
    return Array.isArray(data) && data[0]?.generated_text
      ? data[0].generated_text
      : (data?.generated_text || "");
  } catch (error) {
    throw error;
  }
}

// Анализ тональности
async function onSent() {
  const txt = S.textEl.textContent.trim();
  if (!txt) return setErr("No review selected.");
  setErr(""); setSpin(true);
  try {
    const raw = await callApi(
      "Read the customer review between triple quotes and decide the overall sentiment. Rules:\n" +
      "- Judge overall tone and intent, not isolated words.\n" +
      "- Ignore sarcasm unless clearly signaled.\n" +
      "- Ignore star/emoji counts and metadata.\n" +
      "- If uncertain, choose \"neutral\".\n" +
      "Return only one word: positive, negative, or neutral.",
      txt
    );
    const resp = (raw || "").split(/\r?\n/)[0].trim().toLowerCase();

    const label = /positive/.test(resp) ? "positive" :
                  /negative/.test(resp) ? "negative" :
                  /neutral/.test(resp) ? "neutral" : "neutral";

    const [ico, cls] = mapSentIcon(label);
    S.sent.querySelector("span").textContent = `Sentiment: ${ico}`;
    S.sent.className = `pill ${cls}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Подсчёт существительных через API
async function onNouns() {
  const txt = S.textEl.textContent.trim();
  if (!txt) return setErr("No review selected.");
  setErr(""); setSpin(true);
  try {
    const raw = await callApi(
      "From the review between triple quotes, count how many tokens are NOUNS, then map the count to a level. Rules:\n" +
      "- Tokenize the text (treat hyphenated terms as one token).\n" +
      "- Select ONLY nouns: common and proper, singular or plural (e.g., “product”, “bottles”, “Amazon”, “Dr. Oz”).\n" +
      "- DO NOT count: pronouns, verbs, adjectives, adverbs, numbers, dates, interjections, symbols, or emojis.\n" +
      "- Count all noun tokens (repeated nouns count each time they appear).\n" +
      "- Ignore HTML, URLs, and IDs.\n" +
      "LEVEL RULES:\n" +
      "- high → noun count > 15\n" +
      "- medium → noun count 6–15\n" +
      "- low → noun count < 6\n" +
      "Return exactly one word in lowercase — high, medium, or low — on the FIRST line. No punctuation or extra text.",
      txt
    );
    const resp = (raw || "").split(/\r?\n/)[0].trim().toLowerCase();

    const level = resp.startsWith("high") ? "high" :
                  resp.startsWith("medium") ? "medium" :
                  resp.startsWith("low") ? "low" : "medium";

    const [ico, cls] = mapNounIcon(level);
    S.nouns.querySelector("span").textContent = `Noun level: ${ico}`;
    S.nouns.className = `pill ${cls}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Загрузка TSV при первом нажатии
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
