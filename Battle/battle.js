const fs = require('fs');
const axios = require('axios');
const readline = require('readline');
t
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class FireverseGameBot {
    constructor(voteCount) {
        this.baseUrl = 'https://api.fireverseai.com';
        this.token = fs.readFileSync('token.txt', 'utf8').trim();
        this.voteCount = voteCount;
        this.activityId = 1;
        this.lastPhaseId = null;
        this.currentRoom = null;
    }

    createAxiosInstance() {
        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                'token': this.token,
                'accept': '*/*',
                'origin': 'https://app.fireverseai.com',
                'referer': 'https://app.fireverseai.com/',
                'content-type': 'application/json'
            }
        });
    }

    async getGameInit() {
        const api = this.createAxiosInstance();
        try {
            const response = await api.get('/gameKillerActivity/loginGameInit');
            return response.data.data;
        } catch (error) {
            console.error('Error getting game init:', error.message);
            throw error;
        }
    }

    async chooseRandomRoom(phaseId, rooms) {
        const api = this.createAxiosInstance();
        try {
            // Filter out rooms that are not available (status !== 1)
            const availableRooms = rooms.filter(room => room.status === 1);
            
            if (availableRooms.length === 0) {
                throw new Error('No available rooms to join');
            }

            const randomIndex = Math.floor(Math.random() * availableRooms.length);
            const selectedRoom = availableRooms[randomIndex];

            const response = await api.post('/gameKillerRecord/chooseRoom', {
                activeId: this.activityId,
                phaseId: phaseId,
                phaseRoomId: selectedRoom.id,
                userId: this.getUserIdFromToken(),
                voteCount: 0
            });

            if (response.data.code !== 200) {
                throw new Error(`Failed to choose room: ${response.data.msg}`);
            }

            this.currentRoom = selectedRoom;
            return selectedRoom;
        } catch (error) {
            console.error('Error choosing room:', error.message);
            throw error;
        }
    }

    async voteInRoom(phaseId, roomId, selectedRoom) {
        const api = this.createAxiosInstance();
        try {
            const response = await api.post('/gameKillerRecord/voteRecord', {
                activeId: this.activityId,
                phaseId: phaseId,
                phaseRoomId: roomId,
                userId: this.getUserIdFromToken(),
                voteCount: this.voteCount
            });

            if (response.data.code !== 200) {
                throw new Error(`Failed to vote: ${response.data.msg}`);
            }
            
            console.log(`Successfully voted ${this.voteCount} in room ${selectedRoom.roomName}`);
            return response.data;
        } catch (error) {
            console.error('Error voting:', error.message);
            throw error;
        }
    }

    async checkGameStatus(phaseId) {
        const api = this.createAxiosInstance();
        try {
            const response = await api.get(`/gameKillerActivity/loopRoomAndPeople`, {
                params: {
                    activityId: this.activityId,
                    phaseId: phaseId
                }
            });
            
            if (!response.data || response.data.code !== 200) {
                console.log(`Invalid response received: ${JSON.stringify(response.data).substring(0, 200)}...`);
                return null;
            }
            
            return response.data;
        } catch (error) {
            console.error('Error checking game status:', error.message);
            return null;
        }
    }

    findKillerAndVictimRooms(roomAndPeopleList) {
        if (!roomAndPeopleList) return { killer: null, victims: [] };
        
        let killerRoom = null;
        let victimRooms = [];
        
        for (const room of roomAndPeopleList) {
            if (room.isKiller) {
                killerRoom = room;
            } else if (room.isKilled) {
                victimRooms.push(room);
            }
        }
        
        return { killer: killerRoom, victims: victimRooms };
    }

    async monitorGame(phaseId) {
        console.log('Monitoring game status...');
        
        let attempts = 0;
        const maxAttempts = 30; // Maximum 1 minute of monitoring (2s * 30)
        let lastKillerStatus = null;
        let ourRoomStatus = null;

        return new Promise((resolve) => {
            const interval = setInterval(async () => {
                attempts++;
                
                const status = await this.checkGameStatus(phaseId);
                
                if (!status) {
                    console.log(`Game status check #${attempts}: Failed to get status`);
                } else {
                    console.log(`Game status check #${attempts}: Phase ${phaseId}`);
                    
                    // Check for killer and victims
                    if (status.data && status.data.roomAndPeopleList) {
                        const { killer, victims } = this.findKillerAndVictimRooms(status.data.roomAndPeopleList);
                        
                        // Report when killer first appears
                        if (killer && (!lastKillerStatus || lastKillerStatus.id !== killer.id)) {
                            console.log(`\n🔪 KILLER DETECTED in room ${killer.roomName} (ID: ${killer.id})! 🔪\n`);
                            lastKillerStatus = killer;
                        }
                        
                        
                        for (const victim of victims) {
                            console.log(`💀 Room ${victim.roomName} (ID: ${victim.id}) was KILLED! 💀`);
                        }
                        
                        
                        if (this.currentRoom) {
                            const ourRoom = status.data.roomAndPeopleList.find(r => r.id === this.currentRoom.id);
                            if (ourRoom) {
                                if (ourRoom.isKiller) {
                                    console.log(`\n🎭 OUR ROOM IS THE KILLER! 🎭\n`);
                                }
                                
                                if (ourRoom.isKilled && (!ourRoomStatus || !ourRoomStatus.isKilled)) {
                                    console.log(`\n💔 OUR ROOM WAS KILLED! 💔\n`);
                                }
                                
                                ourRoomStatus = ourRoom;
                            }
                        }
                    }
                    
                    
                    if (status.data && status.data.phase && status.data.phase.status === 2) {
                        let weWon = false;
                        if (status.data.roomAndPeopleList && this.currentRoom) {
                            const ourRoom = status.data.roomAndPeopleList.find(r => r.id === this.currentRoom.id);
                            if (ourRoom && !ourRoom.isKilled) {
                                weWon = true;
                            }
                        }
                        
                        if (weWon) {
                            console.log('\n🏆 GAME ENDED - WE SURVIVED AND WON! 🏆\n');
                        } else {
                            console.log('\n❌ GAME ENDED - WE LOST! ❌\n');
                        }
                        
                        clearInterval(interval);
                        resolve(status);
                        return;
                    }
                    
                    if (status.data && status.data.roomAndPeopleList) {
                        let allRoomsFinished = true;
                        for (const room of status.data.roomAndPeopleList) {
                            if (room.status !== 2) {  
                                allRoomsFinished = false;
                                break;
                            }
                        }
                        
                        if (allRoomsFinished && status.data.roomAndPeopleList.length > 0) {
                            console.log('All rooms have finished. Game round completed!');
                            clearInterval(interval);
                            resolve(status);
                            return;
                        }
                    }
                }

                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    console.log('Game monitoring timed out, continuing to next cycle');
                    resolve({ timedOut: true });
                }
            }, 2000);
        });
    }

    getUserIdFromToken() {
        try {
            const tokenParts = this.token.split('.');
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            return parseInt(payload.jti);
        } catch (error) {
            console.error('Error parsing token:', error.message);
            throw error;
        }
    }

    async waitForNextPhase() {
        console.log('Waiting for next phase...');
        return new Promise((resolve) => {
            const interval = setInterval(async () => {
                try {
                    const gameInit = await this.getGameInit();
                    const currentPhaseId = gameInit.phase.id;
                    
                    if (this.lastPhaseId === null || currentPhaseId !== this.lastPhaseId) {
                        console.log(`New phase detected! Phase ID: ${currentPhaseId}`);
                        this.lastPhaseId = currentPhaseId;
                        clearInterval(interval);
                        resolve(gameInit);
                    } else {
                        console.log(`Still waiting for new phase... Current: ${currentPhaseId}`);
                    }
                } catch (error) {
                    console.error('Error checking phase:', error.message);
                }
            }, 5000); // Check every 5 seconds
        });
    }

    async play() {
        while (true) {
            try {
                console.log('\n=== Starting new game cycle ===');
                
                this.currentRoom = null;
                
                let gameInit = await this.getGameInit();
                const phaseId = gameInit.phase.id;
                
                if (this.lastPhaseId === phaseId) {
                    console.log('Current phase already in progress. Waiting for next phase...');
                    gameInit = await this.waitForNextPhase();
                    continue;
                }
                
                this.lastPhaseId = phaseId;
                console.log(`Starting game with phase ID: ${phaseId}`);

                const availableRooms = gameInit.phaseRoomVo.roomList;
                const selectedRoom = await this.chooseRandomRoom(phaseId, availableRooms);
                console.log(`Selected room: ${selectedRoom.roomName} (ID: ${selectedRoom.id})`);

                await this.voteInRoom(phaseId, selectedRoom.id, selectedRoom);

                await this.monitorGame(phaseId);
                console.log('Waiting for next game...\n');
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                
            } catch (error) {
                console.error('Error during gameplay:', error.message);
                console.log('Waiting before retry...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
}

// Main function
async function main() {
    try {
        rl.question('Enter the vote count you want to use: ', async (answer) => {
            const voteCount = parseInt(answer.trim());
            
            if (isNaN(voteCount) || voteCount <= 0) {
                console.error('Invalid vote count. Please enter a positive number.');
                rl.close();
                process.exit(1);
            }
            
            const bot = new FireverseGameBot(voteCount);
            
            console.log('=== Fireverse Game Bot Starting ===');
            console.log(`Vote Count: ${voteCount}`);
            
            await bot.play();
        });
    } catch (error) {
        console.error('Fatal error:', error);
        rl.close();
        process.exit(1);
    }
}

main();
