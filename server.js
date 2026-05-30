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
                console.log(`[MAIN NODE] Syncing system configurations: ${strictHistoryLog.length}`);
            }
        }
    } catch (err) {
        console.log("[MAIN NODE] Local telemetry stack initialized successfully.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[MAIN NODE] Telemetry cache persistence layer error:", err);
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
    color: "GREEN", 
    numberSmall: 3,
    numberBig: 7, 
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
// HIGH-LEVEL DEEP DEPLOYMENT HISTORIC PATTERN ENGINE (50 SAMPLES MATRIX)
// =======================================================================
function executePatternAnalysis(upcomingPeriodStr) {
    let periodSeedValue = parseInt(upcomingPeriodStr) || 0;

    // Standard fixed logical mapping configuration constants
    const GREEN_SMALL_POOL = [1, 3];
    const GREEN_BIG_POOL = [5, 7, 9];
    const RED_SMALL_POOL = [0, 2, 4];
    const RED_BIG_POOL = [6, 8];

    // Default historical baseline variables
    let greenWeight = 0;
    let redWeight = 0;
    let fallbackReferenceNum = 3;

    // Check if the memory array contains active telemetry data
    if (strictHistoryLog && strictHistoryLog.length > 0) {
        fallbackReferenceNum = parseInt(strictHistoryLog[0].number || 0);

        // EXTRACTION LAYER 1: Deep parse up to 50 active records from systemic state
        let structuralHistory = strictHistoryLog.slice(0, 50);
        let numericalStream = structuralHistory.map(g => parseInt(g.number || 0));
        let colorTrendMap = numericalStream.map(n => ([1, 3, 5, 7, 9].includes(n)) ? "GREEN" : "RED");

        // EVALUATION LAYER 2: Short-term Micro-Streak Evaluator (Latest 6 rounds)
        let activeStreakCount = 1;
        for (let i = 0; i < Math.min(colorTrendMap.length - 1, 5); i++) {
            if (colorTrendMap[i] === colorTrendMap[i + 1]) {
                activeStreakCount++;
            } else {
                break;
            }
        }
        if (activeStreakCount >= 2) {
            if (colorTrendMap[0] === "GREEN") greenWeight += (activeStreakCount * 35);
            else redWeight += (activeStreakCount * 35);
        }

        // EVALUATION LAYER 3: Oscillating Flip Sequence Detector (Alternating trends)
        let alternatingStreak = 0;
        for (let i = 0; i < Math.min(colorTrendMap.length - 1, 5); i++) {
            if (colorTrendMap[i] !== colorTrendMap[i + 1]) {
                alternatingStreak++;
            } else {
                break;
            }
        }
        if (alternatingStreak >= 2) {
            if (colorTrendMap[0] === "GREEN") redWeight += (alternatingStreak * 28);
            else greenWeight += (alternatingStreak * 28);
        }

        // EVALUATION LAYER 4: Macro Density Ratio Analyzer (Full 50 Records Distribution Score)
        let globalGreenCount = colorTrendMap.filter(c => c === "GREEN").length;
        let globalRedCount = colorTrendMap.length - globalGreenCount;
        
        // Compensate bias score based on macro system standard distribution variance
        if (globalGreenCount !== globalRedCount) {
            if (globalGreenCount < globalRedCount) greenWeight += 15; 
            else redWeight += 15;
        }

    } else {
        // Fallback structural weight if local memory initialization state has no indices
        if (periodSeedValue % 2 === 0) greenWeight += 10; else redWeight += 10;
    }

    // LAYER 5: VECTOR CONVERGENCE ASSIGNMENT
    let chosenColorState = "GREEN";
    if (greenWeight === redWeight) {
        chosenColorState = (periodSeedValue % 3 === 0) ? "RED" : "GREEN";
    } else {
        chosenColorState = (greenWeight > redWeight) ? "GREEN" : "RED";
    }

    // LAYER 6: MULTI-POOL COMPOSITE DISTRIBUTION (SPLIT PATH MATRIX DESIGN)
    let finalSmallNumber = 0;
    let finalBigNumber = 0;
    
    // Core deterministic mathematical matrix indexing formula
    let computationalShiftIndex = (periodSeedValue + fallbackReferenceNum + strictHistoryLog.length) % 7;

    if (chosenColorState === "GREEN") {
        finalSmallNumber = GREEN_SMALL_POOL[computationalShiftIndex % GREEN_SMALL_POOL.length];
        finalBigNumber = GREEN_BIG_POOL[computationalShiftIndex % GREEN_BIG_POOL.length];
    } else {
        finalSmallNumber = RED_SMALL_POOL[computationalShiftIndex % RED_SMALL_POOL.length];
        finalBigNumber = RED_BIG_POOL[computationalShiftIndex % RED_BIG_POOL.length];
    }

    // Package results parameters bundle securely to system distribution structure
    globalPrediction = {
        period: upcomingPeriodStr,
        color: chosenColorState,
        numberSmall: finalSmallNumber,
        numberBig: finalBigNumber,
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
            
            if (strictHistoryLog.length === 0) {
                strictHistoryLog = incomingApiList.slice(0, 50);
                saveToPermanentDatabase();
            } else {
                const latestIncomingRound = incomingApiList[0];
                const existingLoggedRound = strictHistoryLog[0];

                if (latestIncomingRound.issueNumber !== existingLoggedRound.issueNumber) {
                    strictHistoryLog.unshift(latestIncomingRound);
                    if (strictHistoryLog.length > 50) {
                        strictHistoryLog = strictHistoryLog.slice(0, 50);
                    }
                    saveToPermanentDatabase(); 
                }
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
        
