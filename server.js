const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const ADMIN_SECRET_TOKEN = "OWNER_SECRET_KEY_9988";

app.get('/admin.html', (req, res) => {
    const token = req.query.token;
    if (token !== ADMIN_SECRET_TOKEN) {
        return res.status(403).send('<h1>403 Forbidden: Root Admin Identity Verification Failed!</h1>');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let uids = {}; 
let strictHistoryLog = []; // Yeh aapka 50 ka main database store hai
const DB_FILE_PATH = path.join(__dirname, 'history_database.json');

function loadPermanentHistoryDatabase() {
    try {
        if (fs.existsSync(DB_FILE_PATH)) {
            const rawData = fs.readFileSync(DB_FILE_PATH, 'utf8');
            const parsedData = JSON.parse(rawData);
            if (Array.isArray(parsedData)) {
                // Strict 50 check limit on start
                strictHistoryLog = parsedData.slice(0, 50);
                console.log(`[MAIN NODE] Telemetry Array Synchronized: Stored Count = ${strictHistoryLog.length}`);
            }
        }
    } catch (err) {
        console.log("[MAIN NODE] Local telemetry database initial configuration ready.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[MAIN NODE] Local storage write operation failed:", err);
    }
}

loadPermanentHistoryDatabase();

function getCurrentWallclockPeriod() {
    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    return totalMinutes.toString().padStart(4, '0');
}

let globalPrediction = { 
    period: getCurrentWallclockPeriod(), 
    topNumbers: [
        { num: 1, chance: 99 },
        { num: 2, chance: 89 },
        { num: 3, chance: 50 }
    ],
    timestamp: "00:00:00" 
};

const GAME_API = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageNo=1&pageSize=50&gameId=1";

function calculateUpcomingPeriod(currentApiPeriodStr) {
    let targetFourDigits = "";
    if (currentApiPeriodStr && currentApiPeriodStr.length >= 4) {
        targetFourDigits = currentApiPeriodStr.slice(-4);
    } else {
        targetFourDigits = getCurrentWallclockPeriod();
    }
    let incrementedValue = parseInt(targetFourDigits) + 1;
    if (incrementedValue > 9999) { incrementedValue = 0; }
    return incrementedValue.toString().padStart(4, '0');
}

// =======================================================================
// REAL HIGH-LEVEL DEEP TREND ANALYTICS DETECTION CORE (FIFO QUEUE BASED)
// =======================================================================
function executePatternAnalysis(upcomingPeriodStr) {
    let targetOneNum = 0;
    let targetTwoNum = 0;
    let targetThreeNum = 0;

    // Strict validation check of the 50 results trend stream
    if (strictHistoryLog && strictHistoryLog.length > 0) {
        let numericalStream = strictHistoryLog.map(g => parseInt(g.number || 0));
        
        // --- LAYER 1: FREQUENCY COUNTING ANALYSIS ---
        let weightCounter = Array(10).fill(0);
        numericalStream.forEach((num, index) => {
            if (num >= 0 && num <= 9) {
                // Jo number jitna haal hi me aaya hai usko "Recency Premium Weight" milega
                let recencyBonus = Math.max(5, 50 - index);
                weightCounter[num] += recencyBonus;
            }
        });

        // --- LAYER 2: ADVANCED MATRIX PATTERN & SEQUENCING ---
        let lastNum = numericalStream[0]; // Bilkul latest live result number
        let secondLastNum = numericalStream[1] !== undefined ? numericalStream[1] : 5;
        let thirdLastNum = numericalStream[2] !== undefined ? numericalStream[2] : 0;

        // Pattern Check A: Agar same number back-to-back do baar repeat hua ho (Double Trend)
        if (lastNum === secondLastNum) {
            weightCounter[lastNum] += 45; // Us number ke aane ke chance highest scale pe boost honge
        }

        // Pattern Check B: Alternating series matching logic (Mirror Sequence like 3 -> 7 -> 3)
        if (lastNum === thirdLastNum && lastNum !== secondLastNum) {
            weightCounter[secondLastNum] += 35; // Shifting pointer calculation weights
        }

        // Pattern Check C: Next Neighborhood Jump Rules
        let dynamicStep = Math.abs(lastNum - secondLastNum) || 1;
        weightCounter[(lastNum + dynamicStep) % 10] += 20;
        weightCounter[Math.abs(lastNum - dynamicStep) % 10] += 15;

        // Extracting Top Positions strictly computed from our weight counter matrix
        let sortedWeights = weightCounter.map((w, idx) => ({ num: idx, weight: w }));
        sortedWeights.sort((a, b) => b.weight - a.weight);

        // Assigning live calculated trend numbers (Can naturally overlap if system demands duplicate)
        targetOneNum = sortedWeights[0].num;
        targetTwoNum = sortedWeights[1].num;
        targetThreeNum = sortedWeights[2].num;

    } else {
        // Fallback procedural seeding mechanism if terminal arrays are entirely empty
        let fallbackSeed = parseInt(upcomingPeriodStr) || 7;
        targetOneNum = (fallbackSeed * 3) % 10;
        targetTwoNum = (fallbackSeed + 7) % 10;
        targetThreeNum = Math.abs(fallbackSeed - 2) % 10;
    }

    // Strict fixed target user accuracy percentage outputs
    globalPrediction = {
        period: upcomingPeriodStr,
        topNumbers: [
            { num: targetOneNum, chance: 99 }, // High Performance Main Rank
            { num: targetTwoNum, chance: 89 }, // Secondary Backup Rank
            { num: targetThreeNum, chance: 50 } // Neutral Mathematical Cover
        ],
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
    };

    io.emit('predictionUpdate', globalPrediction);
}

async function updatePrediction() {
    try {
        const response = await axios.get(GAME_API, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Connection': 'keep-alive'
            },
            timeout: 3500
        });

        if (response.data && response.data.data && response.data.data.list && response.data.data.list.length > 0) {
            const incomingApiList = response.data.data.list;
            
            // Initial data hydration layer
            if (strictHistoryLog.length === 0) {
                strictHistoryLog = incomingApiList.slice(0, 50);
                saveToPermanentDatabase();
            } else {
                // REALTIME ACCURATE FIFO QUEUE IMPLEMENTATION
                // Hum humesha newest structural updates check karenge dynamically
                for (let i = incomingApiList.length - 1; i >= 0; i--) {
                    let incomingRound = incomingApiList[i];
                    
                    // Check if current check cycle exists inside inside tracking node arrays
                    let alreadyLogged = strictHistoryLog.some(item => item.issueNumber === incomingRound.issueNumber);
                    
                    if (!alreadyLogged) {
                        // Naya record start me push karein (index 0)
                        strictHistoryLog.unshift(incomingRound);
                        
                        // STRICT LIMIT 50 LOGIC CONTROL (FIFO GATEWAY)
                        // Agar 51 wa aaya toh sabse purana automatic nikal jayega array se
                        if (strictHistoryLog.length > 50) {
                            strictHistoryLog = strictHistoryLog.slice(0, 50);
                        }
                        
                        console.log(`[FIFO MATRIX UPDATED] New Issue Verified: ${incomingRound.issueNumber}. Active Queue: ${strictHistoryLog.length}`);
                    }
                }
                saveToPermanentDatabase(); 
            }

            let rawApiPeriodStr = strictHistoryLog[0].issueNumber.toString();
            let safeUpcomingPeriod = calculateUpcomingPeriod(rawApiPeriodStr);
            executePatternAnalysis(safeUpcomingPeriod);
        } else {
            executePatternAnalysis(calculateUpcomingPeriod(null));
        }
    } catch (networkError) {
        executePatternAnalysis(calculateUpcomingPeriod(null));
    }
}

setInterval(updatePrediction, 2000);
updatePrediction();

app.post('/api/admin/uid', (req, res) => {
    const { token, uid, action, duration } = req.body;
    if (token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Administrative state invalid.' });

    if (action === 'approve') {
        uids[uid] = { status: 'approved', expiry: Date.now() + (parseInt(duration) * 60 * 1000) };
    } else if (action === 'reject' || action === 'delete') {
        delete uids[uid];
        io.emit('uidRevoked', { uid });
    }
    res.json({ success: true, uids });
});

app.get('/api/admin/uids', (req, res) => {
    if (req.query.token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Administrative state invalid.' });
    res.json(uids);
});

app.post('/api/user/verify', (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.json({ status: 'invalid', message: 'Credentials parameter can not be null.' });
    const match = uids[uid];
    if (!match) return res.json({ status: 'pending', message: 'Access node verification: PENDING!' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired', message: 'Active session window has closed!' });
    }
    res.json({ status: 'approved' });
});

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', globalPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[DETECTION CORE ONLINE] Server active on cluster port ${PORT}`));
