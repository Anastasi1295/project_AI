let reviews = [];

document.addEventListener("DOMContentLoaded", () => {
  const randomBtn = document.getElementById("randomBtn");
  const sentimentBtn = document.getElementById("sentimentBtn");
  const nounBtn = document.getElementById("nounBtn");
  const tokenInput = document.getElementById("token");
  const reviewTextEl = document.getElementById("reviewText");
  const sentimentResultEl = document.getElementById("sentimentResult");
  const nounResultEl = document.getElementById("nounResult");
  const errorDiv = document.getElementById("error");
  const spinner = document.getElementById("spinner");

  const showSpinner = () => spinner.classList.remove("hidden");
  const hideSpinner = () => spinner.classList.add("hidden");
  const showError = (msg) => {
    errorDiv.textContent = msg;
    errorDiv.classList.remove("hidden");
  };
  const clearError = () => {
    errorDiv.classList.add("hidden");
    errorDiv.textContent = "";
  };
  const resetResults = () => {
    reviewTextEl.textContent = "";
    sentimentResultEl.textContent = "";
    nounResultEl.textContent = "";
    clearError();
  };

  fetch("reviews_test.tsv")
    .then((res) => res.ok ? res.text() : Promise.reject(`HTTP ${res.status}`))
    .then((tsvData) => {
      Papa.parse(tsvData, {
        header: true,
        delimiter: "\t",
        skipEmptyLines: true,
        complete: (results) => {
          reviews = results.data.filter(row => row.text);
        },
        error: () => showError("Failed to parse TSV"),
      });
    })
    .catch(() => showError("Failed to load reviews"));

  randomBtn.addEventListener("click", () => {
    resetResults();
    if (!reviews.length) return showError("No reviews loaded");
    const review = reviews[Math.floor(Math.random() * reviews.length)].text;
    reviewTextEl.textContent = review;
  });

  const callApi = async (prompt, text) => {
    const fullPrompt = `${prompt}\n\n"""${text}"`;
    const headers = { "Content-Type": "application/json" };
    const token = tokenInput?.value.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      showSpinner();
      clearError();
      const res = await fetch(
        "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ inputs: fullPrompt }),
        }
      );

      hideSpinner();

      if (res.status === 402 || res.status === 429) {
        const err = await res.json();
        showError(`Rate limited (${res.status}): ${err.error || "Try later"}`);
        return null;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const output = Array.isArray(data) && data[0]?.generated_text
        ? data[0].generated_text
        : String(data);
      return output.trim().split("\n")[0].toLowerCase();
    } catch (err) {
      hideSpinner();
      showError("Request failed: " + err.message);
      return null;
    }
  };

  sentimentBtn.addEventListener("click", async () => {
    const text = reviewTextEl.textContent;
    if (!text) return showError("Select a review first");

    const prompt =
      "Read the customer review between triple quotes and decide the overall sentiment. Rules: - Judge overall tone and intent, not isolated words. - Ignore sarcasm unless clearly signaled. - Ignore star/emoji counts and metadata. - If uncertain, choose \"neutral\". Classify this review as positive, negative, or neutral:";
    
    const result = await callApi(prompt, text);
    if (!result) return;

    const emoji = result.includes("positive") ? "👍" :
                  result.includes("negative") ? "👎" : "❓";
    
    sentimentResultEl.textContent = `Sentiment: ${emoji}`;
  });

  nounBtn.addEventListener("click", async () => {
    const text = reviewTextEl.textContent;
    if (!text) return showError("Select a review first");

    const prompt =
      "Count the nouns in this review and return only High (>15), Medium (6-15), or Low (<6). From the review between triple quotes, count how many tokens are NOUNS, then map the count to a level. - Tokenize the text (treat hyphenated terms as one token). - Select ONLY nouns: common and proper, singular or plural (e.g., “product”, “bottles”, “Amazon”, “Dr. Oz”). - DO NOT count: pronouns, verbs, adjectives, adverbs, numbers, dates, interjections, symbols, or emojis. - Count all noun tokens (repeated nouns count each time they appear). - Ignore HTML, URLs, and IDs. Return exactly one word in lowercase — high, medium, or low — on the FIRST line. No punctuation or extra text.";
    
    const result = await callApi(prompt, text);
    if (!result) return;

    const level = result.includes("high") ? "High" :
                  result.includes("medium") ? "Medium" : "Low";
    const emoji = level === "High" ? "🟢" : level === "Medium" ? "🟡" : "🔴";

    nounResultEl.textContent = `Noun count level: ${emoji}(${level})`;
  });
});
