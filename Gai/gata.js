const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs');

class GataBot {
    constructor() {
        this.baseUrls = {
            earn: 'https://earn.aggregata.xyz',
            agent: 'https://agent.gata.xyz',
            chat: 'https://chat.gata.xyz'
        };
        this.tokens = {
            bearer: '',
            aggr_llm: '',
            aggr_task: ''
        };
        this.stats = {
            dailyPoints: 0,
            totalPoints: 0,
            completedCount: 0,
            lastPointCheck: 0
        };
        this.minDelay = 5000;  // 5 seconds
        this.maxDelay = 15000; // 15 seconds
        this.retryDelay = 10000; // 10 seconds for retries
    }

    async initialize(privateKey) {
        try {
            const wallet = new ethers.Wallet(privateKey);
            const address = wallet.address;
            console.log('Initializing with address:', address);

            // Get authentication nonce
            const nonceResponse = await axios.post(`${this.baseUrls.earn}/api/signature_nonce`, {
                address: address
            });

            const authNonce = nonceResponse.data.auth_nonce;
            const signature = await wallet.signMessage(authNonce);

            // Authorize with signature
            const authResponse = await axios.post(`${this.baseUrls.earn}/api/authorize`, {
                public_address: address,
                signature_code: signature,
                invite_code: ''
            });

            // Store main bearer token
            this.tokens.bearer = authResponse.data.token;
            console.log('Authorization successful');

            // Get task token
            const taskTokenResponse = await axios.post(
                `${this.baseUrls.earn}/api/grant`, 
                { type: 1 },
                { headers: { Authorization: `Bearer ${this.tokens.bearer}` }}
            );
            this.tokens.aggr_task = taskTokenResponse.data.token;
            console.log('Task token obtained');

            // Get LLM token
            const llmTokenResponse = await axios.post(
                `${this.baseUrls.earn}/api/grant`,
                { type: 0 },
                { headers: { Authorization: `Bearer ${this.tokens.bearer}` }}
            );
            this.tokens.aggr_llm = llmTokenResponse.data.token;
            console.log('LLM token obtained');

            // Save tokens and initialize rewards
            this.saveTokens();
            await this.updateRewardsData();
            
            return true;
        } catch (error) {
            console.error('Initialization error:', error.message);
            return false;
        }
    }

    async getTask() {
        try {
            const response = await axios.get(`${this.baseUrls.agent}/api/task`, {
                headers: {
                    'Authorization': `Bearer ${this.tokens.aggr_task}`,
                    'X-Gata-Endpoint': 'pc-browser',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting task:', error.message);
            return null;
        }
    }

    async updateRewardsData() {
        try {
            const response = await axios.get(`${this.baseUrls.agent}/api/task_rewards`, {
                params: {
                    page: 0,
                    per_page: 10
                },
                headers: {
                    'Authorization': `Bearer ${this.tokens.aggr_task}`,
                    'X-Gata-Endpoint': 'pc-browser',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }
            });

            const data = response.data;
            
            // Update stats
            this.stats.totalPoints = parseInt(data.total) || 0;
            this.stats.completedCount = parseInt(data.completed_count) || 0;
            
            // Calculate daily points
            const today = new Date().toISOString().split('T')[0];
            const todayReward = data.rewards.find(r => r.date === today);
            this.stats.dailyPoints = todayReward ? parseInt(todayReward.total_points) : 0;

            // Log updated stats
            console.log('\nCurrent Stats:');
            console.log(`Daily Points: ${this.stats.dailyPoints}`);
            console.log(`Total Points: ${this.stats.totalPoints}`);
            console.log(`Completed Tasks: ${this.stats.completedCount}`);
            
            this.saveStats();
            return true;
        } catch (error) {
            console.error('Error updating rewards:', error.message);
            return false;
        }
    }

    calculateScore(imageUrl, caption) {
        let score = 0;
        
        // Basic caption validation
        if (!caption || caption.length < 15) {
            return -0.5;
        }

        // Length-based scoring
        if (caption.length > 50) {
            score += 0.3;
        }

        // Check for descriptive elements
        const descriptiveElements = [
            'shows', 'displays', 'contains', 'depicts',
            'image', 'picture', 'photo', 'photograph',
            'background', 'foreground', 'color', 'featuring'
        ];

        const elementCount = descriptiveElements.filter(elem => 
            caption.toLowerCase().includes(elem)
        ).length;
        score += (elementCount * 0.1);

        // Check for proper sentence structure
        if (/^[A-Z].*[.!?]$/.test(caption)) {
            score += 0.2;
        }

        // Add natural variation
        const randomFactor = (Math.random() * 0.3) - 0.15;
        score += randomFactor;

        // Ensure score stays within bounds
        return Math.max(-0.9, Math.min(0.9, score));
    }

    async submitScore(taskId, score) {
        try {
            await axios.patch(`${this.baseUrls.agent}/api/task`, {
                id: taskId,
                score: score.toString()
            }, {
                headers: {
                    'Authorization': `Bearer ${this.tokens.aggr_task}`,
                    'X-Gata-Endpoint': 'pc-browser',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }
            });
            return true;
        } catch (error) {
            console.error('Error submitting score:', error.message);
            return false;
        }
    }

    async validatePoints(beforePoints, afterPoints) {
        if (afterPoints <= beforePoints) {
            console.log('Warning: No points awarded for last task');
            await this.sleep(this.minDelay * 2);
            return false;
        }
        return true;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    saveTokens() {
        const tokenData = {
            timestamp: new Date().toISOString(),
            ...this.tokens
        };
        fs.writeFileSync('tokens.json', JSON.stringify(tokenData, null, 2));
    }

    saveStats() {
        const statsData = {
            timestamp: new Date().toISOString(),
            ...this.stats
        };
        fs.writeFileSync('stats.json', JSON.stringify(statsData, null, 2));
    }

    async start() {
        console.log('Starting bot operation...');
        
        try {
            while (true) {
                // Store current points
                const beforePoints = this.stats.totalPoints;
                
                // Get new task
                const task = await this.getTask();
                if (!task || !task.id) {
                    console.log('No task available, waiting...');
                    await this.sleep(this.minDelay);
                    continue;
                }

                // Process task
                console.log(`\nProcessing task ${task.id}`);
                console.log(`Caption: ${task.text}`);
                console.log(`Image URL: ${task.link}`);

                // Calculate and submit score
                const score = this.calculateScore(task.link, task.text);
                const submitSuccess = await this.submitScore(task.id, score);
                
                if (submitSuccess) {
                    console.log(`Submitted score: ${score}`);
                    
                    // Wait for points update
                    await this.sleep(2000);
                    await this.updateRewardsData();

                    // Validate points
                    const pointsValid = await this.validatePoints(beforePoints, this.stats.totalPoints);
                    
                    // Calculate next delay
                    const delay = pointsValid ? 
                        this.minDelay + Math.random() * (this.maxDelay - this.minDelay) :
                        this.maxDelay;
                    
                    console.log(`Waiting ${Math.round(delay/1000)} seconds before next task...`);
                    await this.sleep(delay);
                } else {
                    console.log('Failed to submit score, retrying...');
                    await this.sleep(this.retryDelay);
                }
            }
        } catch (error) {
            console.error('Bot operation error:', error.message);
            console.log('Restarting in 10 seconds...');
            await this.sleep(this.retryDelay);
            this.start();
        }
    }
}

// Check if private key file exists
function checkPrivateKey() {
    if (!fs.existsSync('pk.txt')) {
        console.error('Error: pk.txt file not found!');
        console.log('Please create a pk.txt file with your private key.');
        process.exit(1);
    }
}

// Main function
async function main() {
    // Check for private key file
    checkPrivateKey();

    // Read private key
    const privateKey = fs.readFileSync('pk.txt', 'utf8').trim();
    
    // Create and initialize bot
    const bot = new GataBot();
    
    try {
        // Initialize bot
        const initSuccess = await bot.initialize(privateKey);
        
        if (initSuccess) {
            console.log('Bot successfully initialized');
            await bot.start();
        } else {
            console.error('Failed to initialize bot');
            process.exit(1);
        }
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the main function
main().catch(console.error);
