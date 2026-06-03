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

// Backup dynamic fallback proxy pool list to rotate if main datacenter IP is blocked
const PUBLIC_PROXY_POOL = [
    "http://51.79.50.31:80",
    "http://185.162.228.188:80",
    "http://43.134.33.150:3128",
    "http://20.219.180.149:80",
    "http://8.219.97.199:80"
];
let currentProxyIndex = 0;

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
// SUPREME REAL-TREND DETECTION ENGINE WITH MARKOV TRANSITION
// ==================================================================================
function executePatternAnalysis(upcomingPeriodStr) {
    let targetOneNum = 0;
    let targetTwoNum = 0;
    let targetThreeNum = 0;

    if (strictHistoryLog && strictHistoryLog.length > 0) {
        let numericalStream = strictHistoryLog.map(g => {
            if (g.number !== undefined && g.number !== null) return parseInt(g.number);
            if (g.winNumber !== undefined && g.winNumber !== null) return parseInt(g.winNumber);
            return 0;
        });
        
        let weightCounter = Array(10).fill(0);

        // LAYER 1: Exponential Recency Weight Matrix
        numericalStream.forEach((num, index) => {
            if (num >= 0 && num <= 9) {
                let recencyPremium = 150 * Math.exp(-0.05 * index);
                weightCounter[num] += recencyPremium;
            }
        });

        let lastNum = numericalStream[0]; 
        let secondLastNum = numericalStream[1] !== undefined ? numericalStream[1] : 5;
        let thirdLastNum = numericalStream[2] !== undefined ? numericalStream[2] : 0;
        let fourthLastNum = numericalStream[3] !== undefined ? numericalStream[3] : 7;

        // LAYER 2: Markov Transition Look-back Sequence
        for (let i = 0; i < numericalStream.length - 1; i++) {
            if (numericalStream[i + 1] === lastNum) {
                let nextTargetInHistory = numericalStream[i];
                weightCounter[nextTargetInHistory] += (55 * Math.exp(-0.03 * i));
            }
        }

        // LAYER 3: Streak Dragon Vector Matrix
        if (lastNum === secondLastNum) weightCounter[lastNum] += 85; 
        if (lastNum === secondLastNum && secondLastNum === thirdLastNum) weightCounter[lastNum] += 120; 

        // LAYER 4: Alternate Wave Mapping
        if (lastNum === thirdLastNum && lastNum !== secondLastNum) weightCounter[secondLastNum] += 65; 
        if (secondLastNum === fourthLastNum && lastNum !== secondLastNum) weightCounter[lastNum] += 55;

        // LAYER 5: Delta Difference Jump
        let primaryDeltaGap = Math.abs(lastNum - secondLastNum) || 1;
        let secondaryDeltaGap = Math.abs(secondLastNum - thirdLastNum) || 1;
        
        weightCounter[(lastNum + primaryDeltaGap) % 10] += 45;
        weightCounter[Math.abs(lastNum - secondaryDeltaGap) % 10] += 35;

        let clusterScores = weightCounter.map((w, idx) => ({ num: idx, weight: w }));
        clusterScores.sort((a, b) => b.weight - a.weight);

        targetOneNum = clusterScores[0].num;
        targetTwoNum = clusterScores[1].num;
        targetThreeNum = clusterScores[2].num;

    } else {
        let structuralFallbackSeed = parseInt(upcomingPeriodStr) || 9;
        targetOneNum = (structuralFallbackSeed * 7 + 3) % 10;
        targetTwoNum = (structuralFallbackSeed * 3 + 1) % 10;
        targetThreeNum = Math.abs(structuralFallbackSeed * 2 - 5) % 10;
    }

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

// ==================================================================================
// ANTI-IP-BLOCK ROTATING AGENT FETCHER
// ==================================================================================
async function updatePrediction() {
    let axiosConfig = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://ar-lottery01.com/',
            'Origin': 'https://ar-lottery01.com'
        },
        timeout: 5000
    };

    // Alternating try block using simple direct vs proxy-wrapped structures
    if (currentProxyIndex > 0) {
        let selectedProxy = PUBLIC_PROXY_POOL[currentProxyIndex % PUBLIC_PROXY_POOL.length];
        let urlParts = selectedProxy.replace("http://", "").split(":");
        axiosConfig.proxy = {
            host: urlParts[0],
            port: parseInt(urlParts[1])
        };
    }

    try {
        const response = await axios.get(GAME_API, axiosConfig);

        if (response.data && response.data.data && response.data.data.list && response.data.data.list.length > 0) {
            const incomingApiList = response.data.data.list;
            
            if (strictHistoryLog.length === 0) {
                strictHistoryLog = incomingApiList.slice(0, 50);
                saveToPermanentDatabase();
            } else {
                for (let i = incomingApiList.length - 1; i >= 0; i--) {
                    let incomingRound = incomingApiList[i];
                    let alreadyLogged = strictHistoryLog.some(item => item.issueNumber === incomingRound.issueNumber);
                    
                    if (!alreadyLogged) {
                        strictHistoryLog.unshift(incomingRound);
                        if (strictHistoryLog.length > 50) strictHistoryLog = strictHistoryLog.slice(0, 50);
                        console.log(`[REAL TREND REFRESH] Live Feed Secured: ${incomingRound.issueNumber} -> Num: ${incomingRound.number || incomingRound.winNumber}`);
                    }
                }
                saveToPermanentDatabase(); 
            }

            let rawApiPeriodStr = strictHistoryLog[0].issueNumber.toString();
            let safeUpcomingPeriod = calculateUpcomingPeriod(rawApiPeriodStr);
            executePatternAnalysis(safeUpcomingPeriod);
            
            // Reset index on success to try optimal route first next time
            currentProxyIndex = 0; 
        } else {
            throw new Error("Empty dataset parsing failure.");
        }
    } catch (networkError) {
        console.log(`[IP BLOCK/TIMEOUT BYPASS] Route node failed. Rotating proxy tunnel agent...`);
        // Move to next proxy index to drop blocked nodes immediately
        currentProxyIndex++; 

        if (strictHistoryLog.length > 0) {
            let lastKnownPeriod = strictHistoryLog[0].issueNumber.toString();
            executePatternAnalysis(calculateUpcomingPeriod(lastKnownPeriod));
        } else {
            executePatternAnalysis(calculateUpcomingPeriod(null));
        }
    }
}

// Keep a 3-second cycle interval to ensure proper data fetching sync
setInterval(updatePrediction, 3000);
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`[BYPASS TERMINAL ONLINE] Server active on port ${PORT}`));
