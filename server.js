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

// Initial structure updated to support 3 numbers with chances
let globalPrediction = { 
    period: getCurrentWallclockPeriod(), 
    color: "GREEN", 
    topNumbers: [
        { num: 1, chance: 40 },
        { num: 3, chance: 35 },
        { num: 7, chance: 25 }
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
// DYNAMIC COMPREHENSIVE AI DETECT PATTERN ENGINE (UPDATED FOR 3 NUMBERS & CHANCES)
// =======================================================================
function executePatternAnalysis(upcomingPeriodStr) {
    let periodSeedValue = parseInt(upcomingPeriodStr) || 0;

    // Sabhi 10 numbers ke weights initialize karein (0 to 9)
    let numberWeights = Array(10).fill(10); // Base weight = 10 each

    if (strictHistoryLog && strictHistoryLog.length > 0) {
        let structuralHistory = strictHistoryLog.slice(0, 50);
        let numericalStream = structuralHistory.map(g => parseInt(g.number || 0));

        // 1. Frequency Counter (Jo number jyada baar aaya h uski frequency match karein)
        numericalStream.forEach((num, index) => {
            if(num >= 0 && num <= 9) {
                // Hal hi me aaye numbers ko jyada weight mile (Recency bias)
                let recencyBonus = Math.max(1, 15 - index);
                numberWeights[num] += recencyBonus;
            }
        });

        // 2. Odd / Even Balance Multiplier
        let oddCount = numericalStream.filter(n => n % 2 !== 0).length;
        let evenCount = numericalStream.length - oddCount;
        for (let i = 0; i < 10; i++) {
            if (oddCount > evenCount && i % 2 === 0) numberWeights[i] += 12; // Compensate Even
            if (evenCount > oddCount && i % 2 !== 0) numberWeights[i] += 12; // Compensate Odd
        }

        // 3. Last Number Dynamic Jump Check
        let lastNum = numericalStream[0];
        numberWeights[(lastNum + 1) % 10] += 15;
        numberWeights[(lastNum + 3) % 10] += 10;
        numberWeights[Math.abs(lastNum - 2) % 10] += 8;

    } else {
        // Fallback seed calculation agar log khaali ho
        for(let i=0; i<10; i++) {
            if((periodSeedValue + i) % 3 === 0) numberWeights[i] += 25;
        }
    }

    // Map numbers with their weights
    let mappedNumbers = numberWeights.map((weight, index) => ({ num: index, score: weight }));

    // Sort by score in descending order and select top 3
    mappedNumbers.sort((a, b) => b.score - a.score);
    let topThree = mappedNumbers.slice(0, 3);

    // Calculate dynamic percentage chances based on score ratio
    let totalScore = topThree.reduce((sum, item) => sum + item.score, 0);
    let finalNumbers = topThree.map(item => {
        let percentage = Math.round((item.score / totalScore) * 100);
        return { num: item.num, chance: percentage };
    });

    // Adjust total percentage to exactly 100% due to rounding
    let currentTotal = finalNumbers[0].chance + finalNumbers[1].chance + finalNumbers[2].chance;
    if (currentTotal !== 100) {
        finalNumbers[0].chance += (100 - currentTotal);
    }

    // Determine primary color code based on the #1 predicted number
    let primeNum = finalNumbers[0].num;
    let chosenColorState = [1, 3, 5, 7, 9].includes(primeNum) ? "GREEN" : "RED";
    if (primeNum === 0 || primeNum === 5) chosenColorState = (primeNum === 5) ? "GREEN" : "RED"; 

    globalPrediction = {
        period: upcomingPeriodStr,
        color: chosenColorState,
        topNumbers: finalNumbers, // Send array of 3 numbers with chances
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
                    
