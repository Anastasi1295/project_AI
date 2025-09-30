class ReviewAnalyzer {
    constructor() {
        this.reviews = [];
        this.currentReview = null;
        this.initializeElements();
        this.loadData();
        this.attachEventListeners();
    }

    initializeElements() {
        this.tokenInput = document.getElementById('token-input');
        this.randomReviewBtn = document.getElementById('random-review');
        this.analyzeSentimentBtn = document.getElementById('analyze-sentiment');
        this.countNounsBtn = document.getElementById('count-nouns');
        this.reviewText = document.getElementById('review-text');
        this.analysisResult = document.getElementById('analysis-result');
        this.errorDiv = document.getElementById('error');
        this.spinner = document.getElementById('spinner');
    }

    async loadData() {
        try {
            const response = await fetch('reviews_test.tsv');
            const tsvData = await response.text();
            
            Papa.parse(tsvData, {
                header: true,
                delimiter: '\t',
                complete: (results) => {
                    this.reviews = results.data.filter(review => review.text && review.text.trim());
                },
                error: (error) => {
                    this.showError('Failed to load review data');
                }
            });
        } catch (error) {
            this.showError('Failed to fetch review data file');
        }
    }

    attachEventListeners() {
        this.randomReviewBtn.addEventListener('click', () => this.selectRandomReview());
        this.analyzeSentimentBtn.addEventListener('click', () => this.analyzeSentiment());
        this.countNounsBtn.addEventListener('click', () => this.countNouns());
    }

    selectRandomReview() {
        if (this.reviews.length === 0) {
            this.showError('No reviews loaded yet');
            return;
        }
        
        this.clearResults();
        const randomIndex = Math.floor(Math.random() * this.reviews.length);
        this.currentReview = this.reviews[randomIndex];
        this.reviewText.textContent = this.currentReview.text;
    }

    async analyzeSentiment() {
        if (!this.validateReview()) return;
        
        const prompt = `Classify this review as positive, negative, or neutral: \"\"\"${this.currentReview.text}\"\"\"`;
        await this.callApi(prompt, 'sentiment');
    }

    async countNouns() {
        if (!this.validateReview()) return;
        
        const prompt = `Count the nouns in this review and return only High (>15), Medium (6-15), or Low (<6). \"\"\"${this.currentReview.text}\"\"\"`;
        await this.callApi(prompt, 'nouns');
    }

    async callApi(prompt, analysisType) {
        this.setLoading(true);
        this.clearError();

        try {
            const token = this.tokenInput.value.trim();
            const headers = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ inputs: prompt })
            });

            if (response.status === 402 || response.status === 429) {
                this.showError('API rate limit exceeded. Please try again later or use your own API token.');
                return;
            }

            if (!response.ok) {
                this.showError(`API request failed: ${response.status} ${response.statusText}`);
                return;
            }

            const data = await response.json();
            this.processApiResponse(data, analysisType);

        } catch (error) {
            this.showError('Network error: Failed to connect to API');
        } finally {
            this.setLoading(false);
        }
    }

    processApiResponse(data, analysisType) {
        if (!data || !data[0] || !data[0].generated_text) {
            this.showError('Invalid response from API');
            return;
        }

        const responseText = data[0].generated_text.toLowerCase().trim();
        const firstLine = responseText.split('\n')[0].trim();

        if (analysisType === 'sentiment') {
            this.displaySentiment(firstLine);
        } else if (analysisType === 'nouns') {
            this.displayNounCount(firstLine);
        }
    }

    displaySentiment(sentimentText) {
        let emoji = '❓';
        let label = 'Neutral';

        if (sentimentText.includes('positive')) {
            emoji = '👍';
            label = 'Positive';
        } else if (sentimentText.includes('negative')) {
            emoji = '👎';
            label = 'Negative';
        }

        this.analysisResult.innerHTML = `
            <div class="result-item">
                <span>Sentiment:</span>
                <span>${emoji} ${label}</span>
            </div>
        `;
    }

    displayNounCount(nounText) {
        let emoji = '🔴';
        let level = 'Low';

        if (nounText.includes('high')) {
            emoji = '🟢';
            level = 'High';
        } else if (nounText.includes('medium')) {
            emoji = '🟡';
            level = 'Medium';
        }

        this.analysisResult.innerHTML = `
            <div class="result-item">
                <span>Noun Count:</span>
                <span>${emoji} ${level}</span>
            </div>
        `;
    }

    validateReview() {
        if (!this.currentReview) {
            this.showError('Please select a random review first');
            return false;
        }
        return true;
    }

    setLoading(loading) {
        this.spinner.classList.toggle('active', loading);
        this.randomReviewBtn.disabled = loading;
        this.analyzeSentimentBtn.disabled = loading;
        this.countNounsBtn.disabled = loading;
    }

    showError(message) {
        this.errorDiv.textContent = message;
        this.errorDiv.classList.add('active');
    }

    clearError() {
        this.errorDiv.classList.remove('active');
    }

    clearResults() {
        this.analysisResult.innerHTML = '';
        this.clearError();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ReviewAnalyzer();
});
