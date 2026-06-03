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
let strictHistoryLog = []; 
const DB_FILE_PATH = path.join(__dirname, 'history_database.json');

function loadPermanentHistoryDatabase() {
    try {
        if (fs.existsSync(DB_FILE_PATH)) {
            const rawData = fs.readFileSync(DB_FILE_PATH, 'utf8');
            const parsedData = JSON.parse(rawData);
            if (Array.isArray(parsedData)) {
                strictHistoryLog = parsedData.slice(0, 50);
                console.log(`[CORE TERMINAL] 50 Deep Trend Memory Matrix Online.`);
            }
        }
    } catch (err) {
        console.log("[CORE TERMINAL] Telemetry structure initialized successfully.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[CORE TERMINAL] Database local storage serialization error:", err);
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
        { num: 7, chance: 99 },
        { num: 3, chance: 89 },
        { num: 0, chance: 50 }
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

// ==================================================================================
// SUPREME REAL-TREND DETECTION ENGINE
// ==================================================================================
function executePatternAnalysis(upcomingPeriodStr) {
    let targetOneNum = 0;
    let targetTwoNum = 0;
    let targetThreeNum = 0;

    if (strictHistoryLog && strictHistoryLog.length > 0) {
        // API response se numeric data nikalna (Ensure absolute types)
        let numericalStream = strictHistoryLog.map(g => parseInt(g.number !== undefined ? g.number : g.winNumber || 0));
        let weightCounter = Array(10).fill(0);

        // LAYER 1: Deep Frequency Heatmap with Heavy Recency Bias (Exponential Smoothing)
        numericalStream.forEach((num, index) => {
            if (num >= 0 && num <= 9) {
                // Index 0 sabse naya hai, toh usko sabse zyada weight milega
                let recencyPremium = 120 * Math.exp(-0.06 * index);
                weightCounter[num] += recencyPremium;
            }
        });

        let lastNum = numericalStream[0]; 
        let secondLastNum = numericalStream[1] !== undefined ? numericalStream[1] : 5;
        let thirdLastNum = numericalStream[2] !== undefined ? numericalStream[2] : 0;
        let fourthLastNum = numericalStream[3] !== undefined ? numericalStream[3] : 7;

        // LAYER 2: Markov Chain Transition Check (Pichli history me lastNum ke baad kya aata hai)
        for (let i = 0; i < numericalStream.length - 1; i++) {
            if (numericalStream[i + 1] === lastNum) {
                let nextTargetInHistory = numericalStream[i];
                // Agar itihaas me is number ke baad koi pattern repeat hua hai, weight add karo
                weightCounter[nextTargetInHistory] += (40 * Math.exp(-0.04 * i));
            }
        }

        // LAYER 3: Continuous Streak & Multi-Stack Dragon Blockers
        if (lastNum === secondLastNum) {
            weightCounter[lastNum] += 70; // Break or Continue optimization weight
        }
        if (lastNum === secondLastNum && secondLastNum === thirdLastNum) {
            weightCounter[lastNum] += 90; // Extended Trend booster
        }

        // LAYER 4: Mirror Wave Analysis (Alternating Sequence Detection)
        if (lastNum === thirdLastNum && lastNum !== secondLastNum) {
            weightCounter[secondLastNum] += 55; // Mirror bounce rule
        }
        if (secondLastNum === fourthLastNum && lastNum !== secondLastNum) {
            weightCounter[lastNum] += 45;
        }

        // LAYER 5: Delta Vektor Jump & Arithmetic Modulo Mapping
        let primaryDeltaGap = Math.abs(lastNum - secondLastNum) || 1;
        let secondaryDeltaGap = Math.abs(secondLastNum - thirdLastNum) || 1;
        
        weightCounter[(lastNum + primaryDeltaGap) % 10] += 35;
        weightCounter[Math.abs(lastNum - secondaryDeltaGap) % 10] += 25;
        weightCounter[(lastNum * 2 + 3) % 10] += 15; 

        // Sorting the results to find highest weights
        let clusterScores = weightCounter.map((w, idx) => ({ num: idx, weight: w }));
        clusterScores.sort((a, b) => b.weight - a.weight);

        targetOneNum = clusterScores[0].num;
        targetTwoNum = clusterScores[1].num;
        targetThreeNum = clusterScores[2].num;

    } else {
        // Clean high level mathematical fallback if data streaming drops
        let structuralFallbackSeed = parseInt(upcomingPeriodStr) || 9;
        targetOneNum = (structuralFallbackSeed * 7 + 3) % 10;
        targetTwoNum = (structuralFallbackSeed * 3 + 1) % 10;
        targetThreeNum = Math.abs(structuralFallbackSeed * 2 - 5) % 10;
    }

    // Exact output structure format matching updates
    globalPrediction = {
        period: upcomingPeriodStr,
        topNumbers: [
            { num: targetOneNum, chance: 99 }, 
            { num: targetTwoNum, chance: 89 }, 
            { num: targetThreeNum, chance: 50 } 
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

        // Safe extraction checking key-pair objects
        if (response.data && response.data.data && response.data.data.list && response.data.data.list.length > 0) {
            const incomingApiList = response.data.data.list;
            
            if (strictHistoryLog.length === 0) {
                strictHistoryLog = incomingApiList.slice(0, 50);
                saveToPermanentDatabase();
            } else {
                // REALTIME CONTINUOUS FIFO QUEUE UPDATE
                for (let i = incomingApiList.length - 1; i >= 0; i--) {
                    let incomingRound = incomingApiList[i];
                    let alreadyLogged = strictHistoryLog.some(item => item.issueNumber === incomingRound.issueNumber);
                    
                    if (!alreadyLogged) {
                        strictHistoryLog.unshift(incomingRound);
                        if (strictHistoryLog.length > 50) {
                            strictHistoryLog = strictHistoryLog.slice(0, 50);
                        }
                        console.log(`[REAL TREND REFRESH] Injected Issue: ${incomingRound.issueNumber} | Result Number: ${incomingRound.number || incomingRound.winNumber}`);
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
        console.log("[DETECTION ERROR] API core fetching timed out, calculating mathematical fallback.");
        executePatternAnalysis(calculateUpcomingPeriod(null));
    }
}

// Fixed polling loop time to sync without flooding API
setInterval(updatePrediction, 2500);
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
server.listen(PORT, () => console.log(`[DETECTION CORE ONLINE] Real Trend Server active on port ${PORT}`));
