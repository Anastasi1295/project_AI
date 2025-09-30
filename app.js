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
            const tsvData = await response.text();
            
            return new Promise((resolve) => {
                Papa.parse(tsvData, {
                    header: true,
                    delimiter: '\t',
                    complete: (results) => {
                        this.reviews = results.data.filter(review => review.text && review.text.trim());
                        resolve();
                    },
                    error: (error) => {
                        this.showError('Failed to load reviews data: ' + error.message);
                        resolve();
                    }
                });
            });
        } catch (error) {
            this.showError('Failed to fetch reviews file: ' + error.message);
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
        
        const prompt = `Classify this review as positive, negative, or neutral: "${this.currentReview.text}"`;
        
        try {
            this.setLoading(true);
            const response = await this.callApi(prompt, this.currentReview.text);
            this.processSentimentResponse(response);
        } catch (error) {
            this.showError('Sentiment analysis failed: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    async countNouns() {
        if (!this.validateReview()) return;
        
        const prompt = `Count nouns in this review. Reply only: high, medium or low: "${this.currentReview.text}"`;
        
        try {
            this.setLoading(true);
            const response = await this.callApi(prompt, this.currentReview.text);
            this.processNounResponse(response);
        } catch (error) {
            this.showError('Noun counting failed: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    async callApi(prompt, text) {
        const token = this.tokenInput.value.trim();
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Используем рабочую модель
        const response = await fetch('https://api-inference.huggingface.co/models/gpt2', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 20,
                    return_full_text: false
                }
            })
        });
        
        if (response.status === 402) {
            throw new Error('Payment required - please check your API token');
        }
        
        if (response.status === 429) {
            throw new Error('Rate limit exceeded - please wait and try again');
        }
        
        if (response.status === 404) {
            throw new Error('Model not found. Try again later.');
        }
        
        if (response.status === 503) {
            const retryAfter = response.headers.get('Retry-After') || 10;
            throw new Error(`Model is loading. Wait ${retryAfter} seconds and try again.`);
        }
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Обработка разных форматов ответа
        if (data[0] && data[0].generated_text) {
            return data[0].generated_text;
        }
        
        if (data.generated_text) {
            return data.generated_text;
        }
        
        throw new Error('Invalid response from API');
    }
    
    processSentimentResponse(response) {
        const firstLine = response.toLowerCase().trim();
        
        if (firstLine.includes('positive')) {
            this.sentimentResult.textContent = '👍';
            this.sentimentResult.style.color = '#27ae60';
        } else if (firstLine.includes('negative')) {
            this.sentimentResult.textContent = '👎';
            this.sentimentResult.style.color = '#e74c3c';
        } else {
            this.sentimentResult.textContent = '❓';
            this.sentimentResult.style.color = '#f39c12';
        }
    }
    
    processNounResponse(response) {
        const firstLine = response.toLowerCase().trim();
        
        if (firstLine.includes('high')) {
            this.nounResult.textContent = '🟢';
            this.nounResult.style.color = '#27ae60';
        } else if (firstLine.includes('medium')) {
            this.nounResult.textContent = '🟡';
            this.nounResult.style.color = '#f39c12';
        } else if (firstLine.includes('low')) {
            this.nounResult.textContent = '🔴';
            this.nounResult.style.color = '#e74c3c';
        } else {
            // Если ответ не распознан, показываем серый кружок
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
    }
    
    hideError() {
        this.errorMessage.style.display = 'none';
    }
}

// Альтернативная версия с fallback моделями
class ReviewAnalyzerWithFallback extends ReviewAnalyzer {
    constructor() {
        super();
        this.models = [
            'models/gpt2',
            'models/microsoft/DialoGPT-medium',
            'models/facebook/blenderbot-400M-distill'
        ];
        this.currentModelIndex = 0;
    }
    
    async callApi(prompt, text) {
        const token = this.tokenInput.value.trim();
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        let lastError = null;
        
        // Пробуем все модели по очереди
        for (let i = 0; i < this.models.length; i++) {
            const modelIndex = (this.currentModelIndex + i) % this.models.length;
            const model = this.models[modelIndex];
            
            try {
                const response = await fetch(`https://api-inference.huggingface.co/${model}`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        inputs: prompt,
                        parameters: {
                            max_new_tokens: 20,
                            return_full_text: false
                        }
                    })
                });
                
                if (response.status === 503) {
                    continue; // Пробуем следующую модель
                }
                
                if (response.status === 429) {
                    throw new Error('Rate limit exceeded - please wait and try again');
                }
                
                if (!response.ok) {
                    continue; // Пробуем следующую модель
                }
                
                const data = await response.json();
                
                if (data.error) {
                    continue; // Пробуем следующую модель
                }
                
                // Успешно - запоминаем эту модель
                this.currentModelIndex = modelIndex;
                
                if (data[0] && data[0].generated_text) {
                    return data[0].generated_text;
                }
                
                if (data.generated_text) {
                    return data.generated_text;
                }
                
            } catch (error) {
                lastError = error;
                continue; // Пробуем следующую модель
            }
        }
        
        throw new Error(lastError?.message || 'All models are unavailable. Try again later.');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new ReviewAnalyzerWithFallback();
});
