import axios from 'axios';
import fs from 'fs/promises';
import crypto from 'crypto';
import chalk from 'chalk';
import readline from 'readline';

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify readline question
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

class MailTMService {
    constructor() {
        this.baseURL = 'https://api.mail.tm';
        this.domain = 'bugfoo.com'; // Default domain
    }

    async getDomains() {
        try {
            const response = await axios.get(`${this.baseURL}/domains`);
            if (response.data['hydra:member'].length > 0) {
                this.domain = response.data['hydra:member'][0].domain;
            }
            return this.domain;
        } catch (error) {
            console.error(chalk.red('Error getting domains:', error.message));
            return this.domain;
        }
    }

    async createAccount() {
        const random = crypto.randomBytes(8).toString('hex');
        const email = `${random}@${this.domain}`;
        const password = crypto.randomBytes(10).toString('hex');

        try {
            await axios.post(`${this.baseURL}/accounts`, {
                address: email,
                password: password
            });

            const authResponse = await axios.post(`${this.baseURL}/token`, {
                address: email,
                password: password
            });

            return {
                email,
                password,
                token: authResponse.data.token
            };
        } catch (error) {
            console.error(chalk.red('Error creating email account:', error.message));
            throw error;
        }
    }

    async getMessages(token) {
        try {
            const response = await axios.get(`${this.baseURL}/messages`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.data['hydra:member'];
        } catch (error) {
            console.error(chalk.red('Error fetching messages:', error.message));
            return [];
        }
    }

    async getMessage(messageId, token) {
        try {
            const response = await axios.get(`${this.baseURL}/messages/${messageId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.data;
        } catch (error) {
            console.error(chalk.red('Error fetching message:', error.message));
            return null;
        }
    }

    async waitForVerificationToken(token, maxAttempts = 20) {
        console.log(chalk.cyan(`🔍 Waiting for verification email...`));
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const messages = await this.getMessages(token);
                
                for (const message of messages) {
                    const fullMessage = await this.getMessage(message.id, token);
                    if (fullMessage && fullMessage.text) {
                        // Look for the exact token format: SFMyNTY...
                        const tokenMatch = fullMessage.text.match(/SFMyNTY\.[^"\s\]]+/);
                        if (tokenMatch) {
                            return tokenMatch[0];
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(chalk.cyan(`⏳ Attempt ${i + 1}/${maxAttempts} - Waiting for verification token...`));
            } catch (error) {
                console.error(chalk.red(`Error in attempt ${i + 1}:`, error.message));
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer on error
            }
        }

        throw new Error('Verification token not received after maximum attempts');
    }
}

class LegendBot {
    constructor() {
        this.baseURL = 'https://api.legend.xyz';
        this.headers = {
            'host': 'api.legend.xyz',
            'accept': 'application/json',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'en-US,en;q=0.8',
            'content-type': 'application/json',
            'origin': 'https://legend.xyz',
            'referer': 'https://legend.xyz/',
            'sec-ch-ua': '"Not(A:Brand";v="99", "Brave";v="133", "Chromium";v="133"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'sec-gpc': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        };
        this.mailService = new MailTMService();
    }

    generateRandomName() {
        const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Sam', 'Riley', 'Quinn', 'Avery', 'Parker'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
        
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        
        return {
            firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase(),
            lastName: lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase()
        };
    }

    async register(firstName, lastName, email, country, referredBy) {
        try {
            const payload = {
                first_name: firstName,
                last_name: lastName,
                email: email,
                country: country,
                referred_by: referredBy
            };
            
            console.log('Registration payload:', payload);

            // Add delay before registration
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response = await axios.post(
                `${this.baseURL}/waitlist`,
                payload,
                { 
                    headers: this.headers
                }
            );

            console.log(chalk.green('Registration Response:', JSON.stringify(response.data)));
            return response.data;
        } catch (error) {
            if (error.response) {
                console.error(chalk.red('Registration Error:', JSON.stringify(error.response.data)));
                console.error(chalk.red('Status:', error.response.status));
                console.error(chalk.red('Headers:', JSON.stringify(error.response.headers)));
            }
            throw error;
        }
    }

    async confirmEmail(token) {
        try {
            // Remove any extra characters from token
            const cleanToken = token.replace(/[\[\]"]/g, '').trim();
            
            const payload = { token: cleanToken };
            
            console.log('Confirmation payload:', payload);

            // Add delay before confirmation
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response = await axios.post(
                `${this.baseURL}/waitlist/confirm`,
                payload,
                { 
                    headers: this.headers
                }
            );

            if (response.data) {
                console.log(chalk.green('Confirmation Response:', JSON.stringify(response.data)));
                return response.data;
            } else {
                throw new Error('Empty response from confirmation endpoint');
            }
        } catch (error) {
            if (error.response) {
                console.error(chalk.red('Confirmation Error:', JSON.stringify(error.response.data)));
                console.error(chalk.red('Status:', error.response.status));
                console.error(chalk.red('Headers:', JSON.stringify(error.response.headers)));
                throw new Error(`Confirmation failed: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
}

async function readReferralCodes() {
    try {
        const data = await fs.readFile('code.txt', 'utf8');
        return data.split('\n').map(code => code.trim()).filter(code => code);
    } catch (error) {
        console.error(chalk.red('Error reading referral codes:', error.message));
        return [];
    }
}

async function saveSuccessfulRegistration(userData) {
    const data = `${userData.firstName},${userData.lastName},${userData.email},${userData.referralCode},${userData.rank}\n`;
    try {
        await fs.appendFile('successful_registrations.txt', data);
        console.log(chalk.green('✅ Registration data saved successfully'));
    } catch (error) {
        console.error(chalk.red('Error saving registration data:', error.message));
    }
}

async function main() {
    try {
        // Display text-based banner
        console.log(chalk.cyan('==================================='));
        console.log(chalk.cyan('     Welcome to AirdropInsiders     '));
        console.log(chalk.cyan('===================================\n'));

        console.log(chalk.cyan('\n🚀 Starting Legend.xyz Auto Referral Bot...\n'));

        const numAccounts = parseInt(await question(chalk.yellow('Enter the number of accounts to create: ')));
        
        if (isNaN(numAccounts) || numAccounts <= 0) {
            console.error(chalk.red('❌ Please enter a valid number greater than 0'));
            rl.close();
            return;
        }

        const referralCodes = await readReferralCodes();
        if (referralCodes.length === 0) {
            console.error(chalk.red('❌ No referral codes found in code.txt'));
            rl.close();
            return;
        }

        console.log(chalk.green(`📝 Loaded ${referralCodes.length} referral codes`));
        console.log(chalk.cyan(`🎯 Will create ${numAccounts} accounts\n`));

        const bot = new LegendBot();
        
        console.log(chalk.cyan('🔄 Getting available email domain...'));
        const domain = await bot.mailService.getDomains();
        console.log(chalk.green(`✅ Using email domain: ${domain}\n`));

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < numAccounts; i++) {
            const referralCode = referralCodes[i % referralCodes.length];
            console.log(chalk.yellow(`\n📋 Creating account ${i + 1}/${numAccounts} using referral code: ${referralCode}`));

            try {
                const { firstName, lastName } = bot.generateRandomName();
                console.log(chalk.cyan(`👤 Generated name: ${firstName} ${lastName}`));
                
                console.log(chalk.cyan('📧 Creating temporary email account...'));
                const mailAccount = await bot.mailService.createAccount();
                console.log(chalk.green(`✅ Created email: ${mailAccount.email}`));
                
                console.log(chalk.cyan('🔄 Registering new account...'));
                await bot.register(firstName, lastName, mailAccount.email, "🇮🇩 Indonesia", referralCode);
                
                const verificationToken = await bot.mailService.waitForVerificationToken(mailAccount.token);
                console.log(chalk.green(`✅ Received verification token: ${verificationToken}`));
                
                console.log(chalk.cyan('🔄 Confirming email...'));
                const confirmationResult = await bot.confirmEmail(verificationToken);
                
                await saveSuccessfulRegistration({
                    firstName,
                    lastName,
                    email: mailAccount.email,
                    referralCode,
                    rank: confirmationResult.rank
                });

                console.log(chalk.green(`✅ Successfully registered and confirmed ${firstName} ${lastName}`));
                successCount++;
                
                // Add random delay between 5-10 seconds before next registration
                const waitTime = Math.floor(Math.random() * 6) + 5;
                console.log(chalk.cyan(`⏳ Waiting ${waitTime} seconds before next registration...`));
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                
            } catch (error) {
                console.error(chalk.red(`❌ Failed to create account:`, error.message));
                failureCount++;
                
                // Add longer delay on failure (15-20 seconds)
                const waitTime = Math.floor(Math.random() * 6) + 15;
                console.log(chalk.cyan(`⏳ Waiting ${waitTime} seconds before next attempt...`));
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                continue;
            }
        }

        console.log(chalk.cyan('\n📊 Registration Statistics:'));
        console.log(chalk.green(`✅ Successful registrations: ${successCount}`));
        console.log(chalk.red(`❌ Failed registrations: ${failureCount}`));
        console.log(chalk.yellow(`📈 Success rate: ${((successCount / numAccounts) * 100).toFixed(2)}%`));
        
        console.log(chalk.green('\n✨ Bot execution completed!\n'));
        
    } catch (error) {
        console.error(chalk.red('❌ Fatal error:', error.message));
    } finally {
        rl.close();
    }
}

main().catch(error => {
    console.error(chalk.red('❌ Fatal error:', error.message));
    rl.close();
    process.exit(1);
});
