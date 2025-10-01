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

function firstLineLower(text) {
  return (text || "").split(/\r?\n/)[0].trim().toLowerCase();
}

// Получаем Bearer-токен, если есть
function getAuthHeader() {
  const token = S.token?.value.trim();
  return token ? `Bearer ${token.replace(/\s+/g, "")}` : null;
}

// Универсальный запрос к HF API
async function hfRequest(modelId, body) {
  const headers = {
    "Content-Type": "application/json"
  };
  const auth = getAuthHeader();
  if (auth) headers["Authorization"] = auth;

  const r = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
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

  return r.json();
}

// Анализ тональности через cardiffnlp (работает стабильно)
async function onSent() {
  const text = S.textEl.textContent.trim();
  if (!text) {
    setErr("Select a review first.");
    return;
  }
  setSpin(true);
  setErr("");
  try {
    const data = await hfRequest("cardiffnlp/twitter-xlm-roberta-base-sentiment", {
      inputs: text,
      options: { wait_for_model: true }
    });
    const arr = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : (Array.isArray(data) ? data : []);
    const best = arr.reduce((a, b) => (a?.score ?? 0) > (b?.score ?? 0) ? a : b, null);
    let label = "neutral";
    if (best?.label?.toLowerCase().includes("pos")) label = "positive";
    else if (best?.label?.toLowerCase().includes("neg")) label = "negative";

    const [ico, cls] = mapSentIcon(label);
    S.sent.querySelector("span").textContent = `Sentiment: ${ico}`;
    S.sent.className = `pill ${cls}`;
  } catch (e) {
    setErr(e.message);
  } finally {
    setSpin(false);
  }
}

// Подсчёт существительных через POS-теггинг
async function onNouns() {
  const text = S.textEl.textContent.trim();
  if (!text) {
    setErr("Select a review first.");
    return;
  }
  setSpin(true);
  setErr("");
  try {
    const data = await hfRequest("vblagoje/bert-english-uncased-finetuned-pos", {
      inputs: text,
      options: { wait_for_model: true }
    });
    const tokens = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data) : [];
    const count = tokens.filter(t =>
      ["NOUN", "PROPN", "NN", "NNS", "NNP", "NNPS"].includes((t.entity_group || t.entity || "").toUpperCase())
    ).length;

    const level = count > 15 ? "high" : count >= 6 ? "medium" : "low";
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

// Загрузка TSV
function loadTSV() {
  return new Promise((resolve, reject) => {
    Papa.parse("./reviews_test.tsv", {
      download: true,
      delimiter: "\t",
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data || []).filter(r => r?.text);
        resolve(rows.length ? rows : reject(new Error("No valid reviews found")));
      },
      error: (err) => reject(new Error(`TSV load failed: ${err.message}`))
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

  loadTSV()
    .then(reviews => {
      S.reviews = reviews;
      rand();
    })
    .catch(err => setErr("Failed to load TSV: " + err.message));
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init)
  : init();
