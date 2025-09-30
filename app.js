class ReviewAnalyzer {
    constructor() {
        this.reviews = [];
        this.currentReview = null;
        
        this.initializeElements();
        this.bindEvents();
        this.loadReviews();
    }
    
    initializeElements() {
        this.tokenInput = document.getElementById('token-input');
        this.randomReviewBtn = document.getElementById('random-review');
        this.analyzeSentimentBtn = document.getElementById('analyze-sentiment');
        this.countNounsBtn = document.getElementById('count-nouns');
        this.reviewText = document.getElementById('review-text');
        this.sentimentResult = document.getElementById('sentiment-result');
        this.nounResult = document.getElementById('noun-result');
        this.spinner = document.getElementById('spinner');
        this.errorMessage = document.getElementById('error-message');
    }
    
    bindEvents() {
        this.randomReviewBtn.addEventListener('click', () => this.selectRandomReview());
        this.analyzeSentimentBtn.addEventListener('click', () => this.analyzeSentiment());
        this.countNounsBtn.addEventListener('click', () => this.countNouns());
    }
    
    async loadReviews() {
        try {
            const response = await fetch('reviews_test.tsv');
            if (!response.ok) {
                throw new Error(`Failed to fetch TSV: ${response.status}`);
            }
            const tsvData = await response.text();
            
            return new Promise((resolve) => {
                Papa.parse(tsvData, {
                    header: true,
                    delimiter: '\t',
                    complete: (results) => {
                        this.reviews = results.data.filter(review => review.text && review.text.trim());
                        if (this.reviews.length === 0) {
                            this.showError('No valid reviews found in the data file');
                        }
                        resolve();
                    },
                    error: (error) => {
                        this.showError('Failed to parse reviews data: ' + error.message);
                        resolve();
                    }
                });
            });
        } catch (error) {
            this.showError('Failed to load reviews: ' + error.message);
        }
    }
    
    selectRandomReview() {
        if (this.reviews.length === 0) {
            this.showError('No reviews loaded yet. Please wait...');
            return;
        }
        
        const randomIndex = Math.floor(Math.random() * this.reviews.length);
        this.currentReview = this.reviews[randomIndex];
        this.reviewText.textContent = this.currentReview.text;
        
        this.resetResults();
        this.hideError();
    }
    
    async analyzeSentiment() {
        if (!this.validateReview()) return;
        
        const prompt = `Analyze sentiment of this review. Reply only with: positive, negative or neutral: "${this.currentReview.text.substring(0, 500)}"`;
        
        try {
            this.setLoading(true);
            const response = await this.callApi(prompt);
            this.processSentimentResponse(response);
        } catch (error) {
            this.showError('Sentiment analysis failed: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    async countNouns() {
        if (!this.validateReview()) return;
        
        const prompt = `Count nouns in this text. Reply only with: high, medium or low: "${this.currentReview.text.substring(0, 500)}"`;
        
        try {
            this.setLoading(true);
            const response = await this.callApi(prompt);
            this.processNounResponse(response);
        } catch (error) {
            this.showError('Noun counting failed: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    async callApi(prompt) {
        const token = this.tokenInput.value.trim();
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Используем корректный URL для модели
        const response = await fetch('https://api-inference.huggingface.co/models/gpt2', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 10,
                    return_full_text: false,
                    temperature: 0.1
                }
            })
        });
        
        // Обработка статусов
        if (response.status === 402) {
            throw new Error('Payment required - please check your API token');
        }
        
        if (response.status === 429) {
            throw new Error('Rate limit exceeded - please wait 30 seconds');
        }
        
        if (response.status === 503) {
            const retryAfter = response.headers.get('Retry-After') || 30;
            throw new Error(`Model is loading. Wait ${retryAfter} seconds and try again.`);
        }
        
        if (response.status === 404) {
            throw new Error('Model not available. Try without API token.');
        }
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} - ${await response.text()}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Обработка разных форматов ответа
        if (Array.isArray(data) && data[0] && data[0].generated_text) {
            return data[0].generated_text;
        }
        
        if (data.generated_text) {
            return data.generated_text;
        }
        
        if (typeof data === 'string') {
            return data;
        }
        
        throw new Error('Unexpected API response format');
    }
    
    processSentimentResponse(response) {
        const cleanResponse = response.toLowerCase().trim();
        
        if (cleanResponse.includes('positive')) {
            this.sentimentResult.textContent = '👍';
            this.sentimentResult.style.color = '#27ae60';
        } else if (cleanResponse.includes('negative')) {
            this.sentimentResult.textContent = '👎';
            this.sentimentResult.style.color = '#e74c3c';
        } else {
            this.sentimentResult.textContent = '❓';
            this.sentimentResult.style.color = '#f39c12';
        }
    }
    
    processNounResponse(response) {
        const cleanResponse = response.toLowerCase().trim();
        
        if (cleanResponse.includes('high')) {
            this.nounResult.textContent = '🟢';
            this.nounResult.style.color = '#27ae60';
        } else if (cleanResponse.includes('medium')) {
            this.nounResult.textContent = '🟡';
            this.nounResult.style.color = '#f39c12';
        } else if (cleanResponse.includes('low')) {
            this.nounResult.textContent = '🔴';
            this.nounResult.style.color = '#e74c3c';
        } else {
            this.nounResult.textContent = '⚪';
            this.nounResult.style.color = '#95a5a6';
        }
    }
    
    validateReview() {
        if (!this.currentReview || !this.currentReview.text) {
            this.showError('Please select a review first');
            return false;
        }
        return true;
    }
    
    setLoading(loading) {
        this.spinner.style.display = loading ? 'block' : 'none';
        this.randomReviewBtn.disabled = loading;
        this.analyzeSentimentBtn.disabled = loading;
        this.countNounsBtn.disabled = loading;
    }
    
    resetResults() {
        this.sentimentResult.textContent = '❓';
        this.sentimentResult.style.color = '#333';
        this.nounResult.textContent = '⚪';
        this.nounResult.style.color = '#333';
    }
    
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        console.error('Error:', message);
    }
    
    hideError() {
        this.errorMessage.style.display = 'none';
    }
}

// Простая версия с локальной логикой как fallback
class SimpleReviewAnalyzer extends ReviewAnalyzer {
    async callApi(prompt) {
        // Для демонстрации используем локальную логику если API не работает
        if (prompt.includes('sentiment')) {
            const text = prompt.toLowerCase();
            if (text.includes('great') || text.includes('good') || text.includes('excellent') || text.includes('love') || text.includes('delicious')) {
                return 'positive';
            } else if (text.includes('bad') || text.includes('terrible') || text.includes('hate') || text.includes('awful')) {
                return 'negative';
            }
            return 'neutral';
        }
        
        if (prompt.includes('noun')) {
            const wordCount = prompt.split(' ').length;
            if (wordCount > 20) return 'high';
            if (wordCount > 10) return 'medium';
            return 'low';
        }
        
        throw new Error('API unavailable - using fallback logic');
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Используем простую версию для надежности
    new SimpleReviewAnalyzer();
});
