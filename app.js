let reviews = [];
let currentReview = "";
const reviewDiv = document.getElementById("review");
const resultDiv = document.getElementById("result");
const errorDiv = document.getElementById("error");
const spinner = document.getElementById("spinner");

async function loadReviews() {
  const res = await fetch("reviews_test.tsv");
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, delimiter: "\t" });
  reviews = parsed.data.filter(r => r.text);
}
loadReviews();

document.getElementById("randomBtn").addEventListener("click", () => {
  errorDiv.textContent = "";
  if (!reviews.length) return;
  const random = reviews[Math.floor(Math.random() * reviews.length)];
  currentReview = random.text;
  reviewDiv.textContent = currentReview;
  resultDiv.innerHTML = `Sentiment: ❓ <br /> Noun Level: 🔴`;
});

document.getElementById("sentimentBtn").addEventListener("click", async () => {
  if (!currentReview) return;
  const prompt = `
You are a precise sentiment classifier.

TASK
Read the customer review between triple quotes and decide the overall sentiment.

LABELS
- positive
- negative
- neutral (use when mixed/unclear)

RULES
- Judge overall tone and intent, not isolated words.
- Ignore sarcasm unless clearly signaled.
- Ignore star/emoji counts and metadata.
- If uncertain, choose "neutral".

OUTPUT
Return exactly one word in lowercase — positive, negative, or neutral — on the FIRST line. No punctuation or extra text.

REVIEW
"""${currentReview}"""
`;
  const sentiment = await callApi(prompt);
  updateSentimentUI(sentiment);
});

document.getElementById("nounBtn").addEventListener("click", async () => {
  if (!currentReview) return;
  const prompt = `
You are a part-of-speech analyzer and counter.

TASK
From the review between triple quotes, count how many tokens are NOUNS, then map the count to a level.

COUNTING MECHANISM
- Tokenize the text (treat hyphenated terms as one token).
- Select ONLY nouns: common and proper, singular or plural (e.g., “product”, “bottles”, “Amazon”, “Dr. Oz”).
- DO NOT count: pronouns, verbs, adjectives, adverbs, numbers, dates, interjections, symbols, or emojis.
- Count all noun tokens (repeated nouns count each time they appear).
- Ignore HTML, URLs, and IDs.

LEVEL RULES
- high  → noun count > 15
- medium → noun count 6–15
- low   → noun count < 6

OUTPUT
Return exactly one word in lowercase — high, medium, or low — on the FIRST line. No punctuation or extra text.

REVIEW
"""${currentReview}"""
`;
  const level = await callApi(prompt);
  updateNounUI(level);
});

async function callApi(prompt) {
  errorDiv.textContent = "";
  spinner.style.display = "block";
  const token = document.getElementById("token").value.trim();
  try {
    const res = await fetch("https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: JSON.stringify({ inputs: prompt })
    });

    if (res.status === 402) throw new Error("Payment required (402). Provide a valid HF token.");
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again later.");

    const data = await res.json();
    spinner.style.display = "none";

    let text = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      text = data[0].generated_text.split("\n")[0].trim().toLowerCase();
    } else if (data?.generated_text) {
      text = data.generated_text.split("\n")[0].trim().toLowerCase();
    } else if (data?.[0]?.generated_text) {
      text = data[0].generated_text.trim().toLowerCase();
    }
    return text;
  } catch (e) {
    spinner.style.display = "none";
    errorDiv.textContent = e.message;
    return "";
  }
}

function updateSentimentUI(sentiment) {
  let emoji = "❓";
  if (sentiment.includes("positive")) emoji = "👍";
  if (sentiment.includes("negative")) emoji = "👎";
  if (sentiment.includes("neutral")) emoji = "❓";

  const existing = resultDiv.innerHTML.split("<br />")[1] || "Noun Level: 🔴";
  resultDiv.innerHTML = `Sentiment: ${emoji} <br /> ${existing}`;
}

function updateNounUI(level) {
  let emoji = "🔴";
  if (level.includes("high")) emoji = "🟢";
  if (level.includes("medium")) emoji = "🟡";
  if (level.includes("low")) emoji = "🔴";

  const existing = resultDiv.innerHTML.split("<br />")[0] || "Sentiment: ❓";
  resultDiv.innerHTML = `${existing} <br /> Noun Level: ${emoji}`;
}
