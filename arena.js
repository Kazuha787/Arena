const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs').promises;
const readline = require('readline');
require('dotenv').config();

// Simple console colors without dependencies
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

class ArenaQuestBot {
    constructor() {
        this.baseUrl = 'https://quest-api.arenavs.com/api/v1';
        this.walletsFile = 'wallet-created.json';
        this.tokens = new Map();
        this.statistics = {
            successfulWallets: 0,
            failedWallets: 0,
            totalXPGained: 0,
            completedTasks: 0
        };
    }

    logSuccess(message) {
        console.log(`${colors.green}✓ ${message}${colors.reset}`);
    }

    logError(message) {
        console.log(`${colors.red}✗ ${message}${colors.reset}`);
    }

    logInfo(message) {
        console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
    }

    async readReferralCode() {
        try {
            const code = await fs.readFile('code.txt', 'utf8');
            return code.trim();
        } catch (error) {
            this.logError('Error reading referral code: ' + error.message);
            throw error;
        }
    }

    generateWallet() {
        const wallet = ethers.Wallet.createRandom();
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    }

    async saveWallets(wallets) {
        try {
            await fs.writeFile(this.walletsFile, JSON.stringify(wallets, null, 2));
            this.logSuccess(`Wallets saved successfully to ${this.walletsFile}`);
        } catch (error) {
            this.logError('Error saving wallets: ' + error.message);
            throw error;
        }
    }

    getHeaders(walletAddress) {
        const headers = {
            'accept': '*/*',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'en-US,en;q=0.8',
            'origin': 'https://quest.arenavs.com',
            'referer': 'https://quest.arenavs.com/',
            'sec-ch-ua': '"Not(A:Brand";v="99", "Brave";v="133", "Chromium";v="133"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'sec-gpc': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        };

        if (this.tokens.has(walletAddress)) {
            headers['Authorization'] = `Bearer ${this.tokens.get(walletAddress)}`;
        }

        return headers;
    }

    async checkUserExists(walletAddress) {
        try {
            const response = await axios.get(`${this.baseUrl}/users/exists/${walletAddress}`, {
                headers: this.getHeaders(walletAddress)
            });
            return response.data.exists;
        } catch (error) {
            this.logError('Error checking user existence: ' + error.message);
            throw error;
        }
    }

    async initialize(walletAddress, referralCode) {
        console.log(`${colors.yellow}Initializing user...${colors.reset}`);
        try {
            const exists = await this.checkUserExists(walletAddress);
            
            if (!exists) {
                const response = await axios.post(`${this.baseUrl}/users/initialize`, {
                    walletAddress,
                    referralCode
                }, {
                    headers: {
                        ...this.getHeaders(walletAddress),
                        'content-type': 'application/json'
                    }
                });

                const { user, token } = response.data;
                this.tokens.set(walletAddress, token);
                
                this.logSuccess(`User initialized: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`);
                this.logInfo(`Referral code received: ${user.referralCode}`);
                
                return user;
            }
            
            this.logInfo('User already exists');
            return await this.getUserInfo(walletAddress);
        } catch (error) {
            this.logError('Error initializing user: ' + error.message);
            throw error;
        }
    }

    async completeQuests(userId, walletAddress) {
        const tasks = [1, 2, 3, 4];
        console.log(`${colors.yellow}Starting quest completion...${colors.reset}`);
        
        for (const taskId of tasks) {
            try {
                await axios.post(`${this.baseUrl}/tasks/${taskId}/complete/${userId}`, {}, {
                    headers: this.getHeaders(walletAddress)
                });
                this.statistics.completedTasks++;
                this.logSuccess(`Completed task ${taskId}/4`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                if (error.response?.status === 401) {
                    this.logError(`Authentication error for task ${taskId}`);
                    break;
                }
                this.logError(`Failed task ${taskId}: ${error.message}`);
            }
        }
        console.log(`${colors.green}Quest completion finished${colors.reset}`);
    }

    async generateAndInitializeWallets(count) {
        const referralCode = await this.readReferralCode();
        const wallets = [];
        console.log(`\n${colors.yellow}${'='.repeat(50)}`);
        console.log(`Starting process for ${count} wallets`);
        console.log(`${'='.repeat(50)}${colors.reset}\n`);

        for (let i = 0; i < count; i++) {
            const wallet = this.generateWallet();
            console.log(`\n${colors.yellow}[Wallet ${i + 1}/${count}]`);
            console.log(`Address: ${wallet.address}${colors.reset}`);
            
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const userData = await this.initialize(wallet.address, referralCode);
                
                wallets.push({
                    ...wallet,
                    userId: userData.id,
                    userReferralCode: userData.referralCode,
                    usedReferralCode: referralCode,
                    xp: userData.xp,
                    token: this.tokens.get(wallet.address),
                    createdAt: userData.createdAt
                });
                
                await this.completeQuests(userData.id, wallet.address);
                
                this.statistics.successfulWallets++;
                this.statistics.totalXPGained += userData.xp;
                this.logSuccess(`Wallet ${i + 1} processed successfully`);
            } catch (error) {
                this.statistics.failedWallets++;
                this.logError(`Failed to process wallet: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        await this.saveWallets(wallets);
        this.displayStatistics();
        return wallets;
    }

    displayStatistics() {
        console.log(`\n${colors.yellow}${'='.repeat(50)}`);
        console.log('Final Statistics');
        console.log(`${'='.repeat(50)}`);
        console.log(`${colors.green}✓ Successful Wallets: ${this.statistics.successfulWallets}`);
        console.log(`${colors.red}✗ Failed Wallets: ${this.statistics.failedWallets}`);
        console.log(`${colors.cyan}ℹ Total XP Gained: ${this.statistics.totalXPGained}`);
        console.log(`ℹ Completed Tasks: ${this.statistics.completedTasks}${colors.reset}`);
        console.log(`${colors.yellow}${'='.repeat(50)}${colors.reset}\n`);
    }

    async getUserInfo(walletAddress) {
        try {
            const response = await axios.get(`${this.baseUrl}/users/${walletAddress}`, {
                headers: this.getHeaders(walletAddress)
            });
            return response.data;
        } catch (error) {
            this.logError('Error getting user info: ' + error.message);
            throw error;
        }
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.clear();
    console.log(`${colors.yellow}${colors.bright}\n=== ArenaQuest Bot | AirdropInsiders ===\n${colors.reset}`);
    
    try {
        const bot = new ArenaQuestBot();
        
        rl.question(`${colors.yellow}How many wallets do you want to generate? ${colors.reset}`, async (count) => {
            count = parseInt(count);
            if (isNaN(count) || count <= 0) {
                console.log(`${colors.red}Please enter a valid number greater than 0${colors.reset}`);
                rl.close();
                return;
            }

            try {
                const wallets = await bot.generateAndInitializeWallets(count);
                console.log(`${colors.green}${colors.bright}\nProcess completed successfully!${colors.reset}`);
                console.log(`${colors.cyan}Generated wallets saved to wallet-created.json${colors.reset}`);
            } catch (error) {
                console.log(`${colors.red}${colors.bright}\nProcess failed!${colors.reset}`);
                console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
            }
            rl.close();
        });
    } catch (error) {
        console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
        rl.close();
    }
}

main();