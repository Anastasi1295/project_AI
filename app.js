const randomReviewBtn = document.getElementById('random-review-btn');
const sentimentBtn = document.getElementById('sentiment-btn');
const nounBtn = document.getElementById('noun-btn');
const resultDiv = document.getElementById('result');
const sentimentElem = document.getElementById('sentiment');
const nounLevelElem = document.getElementById('noun-level');
const errorDiv = document.getElementById('error');
const spinner = document.getElementById('spinner');
const tokenInput = document.getElementById('token-input');

let reviews = [];

async function fetchReviews() {
  const response = await fetch('reviews_test.tsv');
  const tsvText = await response.text();
  Papa.parse(tsvText, {
    header: true,
    dynamicTyping: true,
    complete: function(results) {
      reviews = results.data;
    }
  });
}

function showSpinner(show) {
  spinner.style.display = show ? 'block' : 'none';
}

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = message ? 'block' : 'none';
}

async function callApi(prompt, text) {
  const apiToken = tokenInput.value;
  const headers = { 
    'Content-Type': 'application/json',
    ...(apiToken && { 'Authorization': `Bearer ${apiToken}` })
  };

  try {
    const response = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ inputs: prompt + text })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data[0]?.generated_text.trim().toLowerCase() || 'Error';
  } catch (error) {
    showError(error.message);
    return null;
  }
}

function countNouns(text) {
  const nouns = text.match(/\b(?:[A-Za-z-]+(?:s|es|ies)?|[A-Za-z]+(?:\'s)?)\b/g) || [];
  return nouns.filter(word => !['I', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'].includes(word.toLowerCase())).length;
}

randomReviewBtn.addEventListener('click', () => {
  if (reviews.length === 0) {
    showError('Reviews not loaded yet!');
    return;
  }

  const randomReview = reviews[Math.floor(Math.random() * reviews.length)];
  showResult(randomReview.text);
});

sentimentBtn.addEventListener('click', async () => {
  if (reviews.length === 0) {
    showError('Reviews not loaded yet!');
    return;
  }

  const reviewText = reviews[Math.floor(Math.random() * reviews.length)].text;
  showSpinner(true);
  const response = await callApi('Classify this review as positive, negative, or neutral: ', reviewText);
  if (response) {
    sentimentElem.textContent = response === 'positive' ? '👍' : (response === 'negative' ? '👎' : '❓');
    showResult();
  }
});

nounBtn.addEventListener('click', async () => {
  if (reviews.length === 0) {
    showError('Reviews not loaded yet!');
    return;
  }

  const reviewText = reviews[Math.floor(Math.random() * reviews.length)].text;
  showSpinner(true);
  const nounCount = countNouns(reviewText);
  const response = await callApi('Count the nouns in this review and return only High (>15), Medium (6-15), or Low (<6): ', reviewText);
  if (response) {
    nounLevelElem.textContent = nounCount > 15 ? '🟢' : (nounCount >= 6 ? '🟡' : '🔴');
    showResult();
  }
});

function showResult() {
  showSpinner(false);
  resultDiv.style.display = 'block';
}

fetchReviews();
