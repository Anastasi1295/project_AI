let reviews = [];
let currentReview = '';

document.addEventListener('DOMContentLoaded', () => {
  const randomBtn = document.getElementById('randomBtn');
  const sentimentBtn = document.getElementById('sentimentBtn');
  const nounBtn = document.getElementById('nounBtn');
  const reviewTextEl = document.getElementById('reviewText');
  const resultEl = document.getElementById('result');
  const sentimentEl = document.getElementById('sentiment');
  const nounsEl = document.getElementById('nouns');
  const spinner = document.getElementById('spinner');
  const errorEl = document.getElementById('error');
  const hfTokenInput = document.getElementById('hfToken');

  // Fetch and parse TSV
  fetch('reviews_test.tsv')
    .then(r => r.text())
    .then(data => {
      const parsed = Papa.parse(data, { header: true, skipEmptyLines: true });
      reviews = parsed.data.filter(row => row.text);
      randomBtn.disabled = false;
    })
    .catch(() => showError('Failed to load reviews.'));

  randomBtn.addEventListener('click', () => {
    if (reviews.length === 0) return;
    currentReview = reviews[Math.floor(Math.random() * reviews.length)].text;
    reviewTextEl.textContent = currentReview;
    resultEl.style.display = 'none';
    sentimentBtn.disabled = false;
    nounBtn.disabled = false;
    hideError();
  });

  sentimentBtn.addEventListener('click', async () => {
    if (!currentReview) return;
    showSpinner();
    hideError();
    try {
      const prompt = `You are a precise sentiment classifier.

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
"""${currentReview.trim()}"""`;
      const response = await callApi(prompt);
      const label = response.split('\n')[0].trim().toLowerCase();
      let icon = '❓';
      if (label === 'positive') icon = '👍';
      else if (label === 'negative') icon = '👎';
      sentimentEl.textContent = `${icon} ${label}`;
      resultEl.style.display = 'block';
    } catch (err) {
      showError(err.message);
    } finally {
      hideSpinner();
    }
  });

  nounBtn.addEventListener('click', async () => {
    if (!currentReview) return;
    showSpinner();
    hideError();
    try {
      const prompt = `You are a part-of-speech analyzer and counter.

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
"""${currentReview.trim()}"""`;
      const response = await callApi(prompt);
      const level = response.split('\n')[0].trim().toLowerCase();
      let color = '🔴';
      if (level === 'high') color = '🟢';
      else if (level === 'medium') color = '🟡';
      nounsEl.textContent = `${color} ${level}`;
      resultEl.style.display = 'block';
    } catch (err) {
      showError(err.message);
    } finally {
      hideSpinner();
    }
  });

  async function callApi(prompt) {
    const url = 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct';
    const headers = { 'Content-Type': 'application/json' };
    const token = hfTokenInput.value.trim();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const body = { inputs: prompt };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      if (resp.status === 429) throw new Error('Too many requests. Try again later.');
      if (resp.status === 402) throw new Error('API rate limit exceeded. Use your token.');
      throw new Error(`Error ${resp.status}: ${errData.error || 'Unknown error'}`);
    }

    const data = await resp.json();
    if (data && Array.isArray(data) && data[0] && data[0].generated_text) {
      return data[0].generated_text;
    }
    throw new Error('Invalid response from model.');
  }

  function showSpinner() {
    spinner.style.display = 'block';
  }

  function hideSpinner() {
    spinner.style.display = 'none';
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    hideSpinner();
  }

  function hideError() {
    errorEl.style.display = 'none';
  }
});
