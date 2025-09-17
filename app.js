document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const apiTokenInput = document.getElementById('apiToken');
    const reviewTextElement = document.getElementById('reviewText');
    const sentimentResultElement = document.getElementById('sentimentResult');
    const resultContainer = document.getElementById('resultContainer');
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error');
    
    let reviews = [];
    
    // Load and parse the TSV file
    fetch('reviews_test.tsv')
        .then(response => response.text())
        .then(tsvData => {
            const parsedData = Papa.parse(tsvData, {
                header: true,
                delimiter: '\t',
                skipEmptyLines: true
            });
            
            reviews = parsedData.data.map(row => row.text).filter(text => text && text.trim() !== '');
            
            if (reviews.length > 0) {
                analyzeBtn.disabled = false;
            } else {
                showError('No reviews found in the TSV file.');
            }
        })
        .catch(error => {
            showError('Error loading reviews: ' + error.message);
        });
    
    analyzeBtn.addEventListener('click', function() {
        analyzeRandomReview();
    });
    
    function analyzeRandomReview() {
        // Hide previous results and errors
        resultContainer.classList.add('hidden');
        errorElement.classList.add('hidden');
        loadingElement.classList.remove('hidden');
        
        // Select a random review
        const randomIndex = Math.floor(Math.random() * reviews.length);
        const randomReview = reviews[randomIndex];
        
        // Display the review text
        reviewTextElement.textContent = randomReview;
        
        // Prepare the API request
        const apiToken = apiTokenInput.value.trim();
        const model = "siebert/sentiment-roberta-large-english";
        const apiUrl = `https://api-inference.huggingface.co/models/${model}`;
        
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (apiToken) {
            headers['Authorization'] = `Bearer ${apiToken}`;
        }
        
        // Make the API request
        fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ inputs: randomReview })
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 503) {
                    throw new Error('Model is loading, please try again in a few moments.');
                } else if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again later or add your API token.');
                } else {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }
            }
            return response.json();
        })
        .then(data => {
            loadingElement.classList.add('hidden');
            resultContainer.classList.remove('hidden');
            
            // Handle the response
            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]) && data[0].length > 0) {
                const result = data[0][0];
                displaySentiment(result);
            } else {
                throw new Error('Unexpected API response format');
            }
        })
        .catch(error => {
            loadingElement.classList.add('hidden');
            showError('Error analyzing sentiment: ' + error.message);
        });
    }
    
    function displaySentiment(result) {
        sentimentResultElement.innerHTML = '';
        
        let iconClass = '';
        let icon = '';
        let label = '';
        
        if (result.label === 'POSITIVE' && result.score > 0.5) {
            iconClass = 'positive';
            icon = '<i class="fas fa-thumbs-up sentiment-icon"></i>';
            label = 'Positive';
        } else if (result.label === 'NEGATIVE' && result.score > 0.5) {
            iconClass = 'negative';
            icon = '<i class="fas fa-thumbs-down sentiment-icon"></i>';
            label = 'Negative';
        } else {
            iconClass = 'neutral';
            icon = '<i class="fas fa-question-circle sentiment-icon"></i>';
            label = 'Neutral';
        }
        
        const sentimentElement = document.createElement('div');
        sentimentElement.className = iconClass;
        sentimentElement.innerHTML = `${icon} ${label} (confidence: ${(result.score * 100).toFixed(2)}%)`;
        
        sentimentResultElement.appendChild(sentimentElement);
    }
    
    function showError(message) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        loadingElement.classList.add('hidden');
    }
});
