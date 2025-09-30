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
        
        const prompt = `Classify this review as positive, negative, or neutral: \"\"\"${this.currentReview.text}\"\"\"`;
        
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
        
        const prompt = `Count the nouns in this review and return only High (>15), Medium (6-15), or Low (<6). \"\"\"${this.currentReview.text}\"\"\"`;
        
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
        
        const response = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 50,
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
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (!data || !data[0] || !data[0].generated_text) {
            throw new Error('Invalid response from API');
        }
        
        return data[0].generated_text;
    }
    
    processSentimentResponse(response) {
        const firstLine = response.split('\n')[0].toLowerCase().trim();
        
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
        const firstLine = response.split('\n')[0].toLowerCase().trim();
        
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

document.addEventListener('DOMContentLoaded', () => {
    new ReviewAnalyzer();
});
