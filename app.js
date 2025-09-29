const API_URL = "https://api-inference.huggingface.co/models/google/gemma-7b-it";
let reviews = [];
let currentReview = '';

document.addEventListener('DOMContentLoaded', function() {
    loadReviews();
    
    document.getElementById('randomReview').addEventListener('click', selectRandomReview);
    document.getElementById('analyzeSentiment').addEventListener('click', analyzeSentiment);
    document.getElementById('countNouns').addEventListener('click', countNouns);
});

async function loadReviews() {
    try {
        const response = await fetch('reviews_test.tsv');
        const tsvData = await response.text();
        
        Papa.parse(tsvData, {
            delimiter: '\t',
            header: true,
            complete: function(results) {
                reviews = results.data.filter(review => review.text && review.text.trim());
            },
            error: function(error) {
                showError('Failed to load reviews data');
            }
        });
    } catch (error) {
        showError('Failed to fetch reviews file');
    }
}

function selectRandomReview() {
    if (reviews.length === 0) {
        showError('No reviews loaded yet');
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * reviews.length);
    currentReview = reviews[randomIndex].text;
    document.getElementById('reviewDisplay').textContent = currentReview;
    document.getElementById('resultCard').textContent = 'Results will appear here';
    hideError();
}

async function analyzeSentiment() {
    if (!currentReview) {
        showError('Please select a review first');
        return;
    }
    
    const prompt = `Classify this review as positive, negative, or neutral: "${currentReview}"`;
    const result = await callApi(prompt, currentReview);
    
    if (result) {
        const sentiment = parseSentiment(result);
        document.getElementById('resultCard').innerHTML = `
            <strong>Sentiment:</strong> ${getSentimentEmoji(sentiment)} ${sentiment.toUpperCase()}
        `;
    }
}

async function countNouns() {
    if (!currentReview) {
        showError('Please select a review first');
        return;
    }
    
    const prompt = `Count the nouns in this review and return only High (>15), Medium (6-15), or Low (<6): "${currentReview}"`;
    const result = await callApi(prompt, currentReview);
    
    if (result) {
        const nounLevel = parseNounLevel(result);
        document.getElementById('resultCard').innerHTML = `
            <strong>Noun Count Level:</strong> ${getNounLevelEmoji(nounLevel)} ${nounLevel.toUpperCase()}
        `;
    }
}

async function callApi(prompt, text) {
    const token = document.getElementById('apiToken').value.trim();
    
    if (!token) {
        showError('Please enter a Hugging Face API token');
        return null;
    }
    
    showSpinner(true);
    hideError();
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": 50,
                    "temperature": 0.1
                }
            })
        });

        if (response.status === 402) {
            showError('Payment required - please check your API token');
            return null;
        }
        
        if (response.status === 429) {
            showError('Rate limit exceeded - please wait and try again');
            return null;
        }
        
        if (!response.ok) {
            showError(`API error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        
        if (data.error) {
            showError(`Model error: ${data.error}`);
            return null;
        }
        
        return data[0]?.generated_text || '';

    } catch (error) {
        showError(`Network error: ${error.message}`);
        return null;
    } finally {
        showSpinner(false);
    }
}

function parseSentiment(response) {
    const firstLine = response.split('\n')[0].toLowerCase();
    
    if (firstLine.includes('positive')) return 'positive';
    if (firstLine.includes('negative')) return 'negative';
    if (firstLine.includes('neutral')) return 'neutral';
    
    return 'neutral';
}

function parseNounLevel(response) {
    const firstLine = response.split('\n')[0].toLowerCase();
    
    if (firstLine.includes('high')) return 'high';
    if (firstLine.includes('medium')) return 'medium';
    if (firstLine.includes('low')) return 'low';
    
    if (firstLine.match(/>\s*15/)) return 'high';
    if (firstLine.match(/<\s*6/)) return 'low';
    
    return 'medium';
}

function getSentimentEmoji(sentiment) {
    switch (sentiment) {
        case 'positive': return '👍';
        case 'negative': return '👎';
        default: return '❓';
    }
}

function getNounLevelEmoji(level) {
    switch (level) {
        case 'high': return '🟢';
        case 'medium': return '🟡';
        default: return '🔴';
    }
}

function showSpinner(show) {
    document.getElementById('spinner').style.display = show ? 'block' : 'none';
    document.querySelectorAll('button').forEach(btn => {
        btn.disabled = show;
    });
}

function showError(message) {
    const errorDiv = document.getElementById('errorDiv');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('errorDiv').style.display = 'none';
}
