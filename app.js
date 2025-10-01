class ReviewAnalyzer {
    constructor() {
        this.reviews = [];
        this.currentReview = '';
        this.token = '';
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadReviews();
    }

    initializeElements() {
        this.reviewTextElement = document.getElementById('review-text');
        this.resultElement = document.getElementById('result');
        this.errorElement = document.getElementById('error');
        this.spinnerElement = document.getElementById('spinner');
        this.randomReviewButton = document.getElementById('random-review');
        this.analyzeSentimentButton = document.getElementById('analyze-sentiment');
        this.countNounsButton = document.getElementById('count-nouns');
        this.tokenInput = document.getElementById('token-input');
    }

    attachEventListeners() {
        this.randomReviewButton.addEventListener('click', () => this.selectRandomReview());
        this.analyzeSentimentButton.addEventListener('click', () => this.analyzeSentiment());
        this.countNounsButton.addEventListener('click', () => this.countNouns());
        this.tokenInput.addEventListener('input', (e) => {
            this.token = e.target.value.trim();
        });
    }

    async loadReviews() {
        try {
            const response = await fetch('reviews_test.tsv');
            if (!response.ok) throw new Error('Failed to load reviews file');
            
            const tsvData = await response.text();
            const parsed = Papa.parse(tsvData, {
                header: true,
                delimiter: '\t',
                skipEmptyLines: true
            });
            
            this.reviews = parsed.data.filter(row => row.text && row.text.trim());
            
            if (this.reviews.length === 0) {
                throw new Error('No reviews found in the file');
            }
            
        } catch (error) {
            this.showError(`Error loading reviews: ${error.message}`);
        }
    }

    selectRandomReview() {
        if (this.reviews.length === 0) {
            this.showError('No reviews available. Please check if reviews_test.tsv is loaded correctly.');
            return;
        }
        
        const randomIndex = Math.floor(Math.random() * this.reviews.length);
        this.currentReview = this.reviews[randomIndex].text;
        this.reviewTextElement.textContent = this.currentReview;
        this.clearResult();
        this.clearError();
    }

    async analyzeSentiment() {
        if (!this.validateReview()) return;
        
        this.setLoading(true);
        this.clearError();
        
        try {
            let result = await this.hfRequest(
                'cardiffnlp/twitter-xlm-roberta-base-sentiment',
                { inputs: this.currentReview }
            );

            if (!result || !Array.isArray(result) || !result[0]) {
                throw new Error('Invalid response from sentiment model');
            }

            const sentiment = this.normalizeSentiment(result[0]);
            this.displaySentiment(sentiment);

        } catch (error) {
            await this.fallbackAnalysis('sentiment', error);
        } finally {
            this.setLoading(false);
        }
    }

    async countNouns() {
        if (!this.validateReview()) return;
        
        this.setLoading(true);
        this.clearError();
        
        try {
            let result = await this.hfRequest(
                'vblagoje/bert-english-uncased-finetuned-pos',
                { inputs: this.currentReview }
            );

            if (!result || !Array.isArray(result) || !result[0]) {
                throw new Error('Invalid response from POS model');
            }

            const nounCount = this.countNounsFromPOS(result[0]);
            const level = this.getNounLevel(nounCount);
            this.displayNounCount(level, nounCount);

        } catch (error) {
            await this.fallbackAnalysis('nouns', error);
        } finally {
            this.setLoading(false);
        }
    }

    async hfRequest(modelId, body) {
        const response = await fetch(
            `https://api-inference.huggingface.co/models/${modelId}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.token && { 'Authorization': `Bearer ${this.token}` })
                },
                body: JSON.stringify(body)
            }
        );

        if (response.status === 401) {
            throw new Error('Invalid API token');
        } else if (response.status === 402) {
            throw new Error('Quota exceeded');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later');
        } else if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        return await response.json();
    }

    normalizeSentiment(sentimentResult) {
        if (!Array.isArray(sentimentResult)) {
            return 'neutral';
        }

        const best = sentimentResult.reduce((prev, current) => 
            prev.score > current.score ? prev : current
        );

        const label = best.label.toLowerCase();
        
        if (label.includes('positive') || label.includes('pos')) return 'positive';
        if (label.includes('negative') || label.includes('neg')) return 'negative';
        return 'neutral';
    }

    countNounsFromPOS(posResult) {
        if (!Array.isArray(posResult)) return 0;
        
        return posResult.filter(token => 
            token.entity && (token.entity.includes('NOUN') || token.entity.includes('PROPN'))
        ).length;
    }

    getNounLevel(count) {
        if (count > 15) return 'high';
        if (count >= 6) return 'medium';
        return 'low';
    }

    async fallbackAnalysis(type, originalError) {
        try {
            let prompt;
            if (type === 'sentiment') {
                prompt = `Analyze the sentiment of this review and respond with ONLY one word: positive, negative, or neutral. Review: "${this.currentReview}"`;
            } else {
                prompt = `Count how many nouns (including proper nouns) are in this text and respond with ONLY one word: high (if more than 15), medium (if 6-15), or low (if less than 6). Text: "${this.currentReview}"`;
            }

            const result = await this.hfRequest(
                'HuggingFaceH4/smol-llama-3.2-1.7B-instruct',
                { 
                    inputs: prompt,
                    parameters: { max_new_tokens: 10 }
                }
            );

            if (!result || !result[0] || !result[0].generated_text) {
                throw new Error('No response from fallback model');
            }

            const response = result[0].generated_text.toLowerCase().split('\n')[0].trim();
            
            if (type === 'sentiment') {
                const sentiment = this.parseSentimentFallback(response);
                this.displaySentiment(sentiment);
            } else {
                const level = this.parseNounLevelFallback(response);
                this.displayNounCount(level);
            }

        } catch (fallbackError) {
            this.showError(`Analysis failed: ${originalError.message}. Fallback also failed: ${fallbackError.message}`);
        }
    }

    parseSentimentFallback(response) {
        if (response.includes('positive')) return 'positive';
        if (response.includes('negative')) return 'negative';
        if (response.includes('neutral')) return 'neutral';
        
        return response.includes('pos') ? 'positive' : 
               response.includes('neg') ? 'negative' : 'neutral';
    }

    parseNounLevelFallback(response) {
        if (response.includes('high')) return 'high';
        if (response.includes('medium')) return 'medium';
        if (response.includes('low')) return 'low';
        
        return response.includes('h') ? 'high' :
               response.includes('m') ? 'medium' : 'low';
    }

    displaySentiment(sentiment) {
        const emoji = sentiment === 'positive' ? '👍' : 
                     sentiment === 'negative' ? '👎' : '❓';
        this.resultElement.innerHTML = `${emoji} ${sentiment.toUpperCase()}`;
    }

    displayNounCount(level, count = null) {
        const emoji = level === 'high' ? '🟢' :
                     level === 'medium' ? '🟡' : '🔴';
        const countText = count !== null ? ` (${count} nouns)` : '';
        this.resultElement.innerHTML = `${emoji} ${level.toUpperCase()}${countText}`;
    }

    validateReview() {
        if (!this.currentReview) {
            this.showError('Please select a random review first');
            return false;
        }
        return true;
    }

    setLoading(loading) {
        this.spinnerElement.style.display = loading ? 'block' : 'none';
        this.randomReviewButton.disabled = loading;
        this.analyzeSentimentButton.disabled = loading;
        this.countNounsButton.disabled = loading;
    }

    showError(message) {
        this.errorElement.textContent = message;
        this.errorElement.style.display = 'block';
    }

    clearError() {
        this.errorElement.style.display = 'none';
        this.errorElement.textContent = '';
    }

    clearResult() {
        this.resultElement.textContent = 'Results will appear here';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ReviewAnalyzer();
});
