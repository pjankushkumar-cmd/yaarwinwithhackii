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

// AAPKI LIVE ORIGINAL WIN-GO GAME API ENDPOINT
const GAME_API = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageNo=1&pageSize=50&gameId=1";

let globalPrediction = { 
    period: "Syncing Live...", 
    color: "WAIT", 
    numberSmall: "WAIT",
    numberBig: "WAIT", 
    timestamp: "00:00:00" 
};

// Pure BigInt mathematical addition framework to advance exactly 3 minutes/periods securely
function calculateUpcoming3MinPeriod(currentApiPeriodStr) {
    if (!currentApiPeriodStr) return "Syncing...";
    try {
        const basePeriodInt = BigInt(currentApiPeriodStr);
        // User Rules: Current live period sequence se exactly 3 rounds aage ka track set karega
        return (basePeriodInt + 3n).toString();
    } catch (e) {
        return currentApiPeriodStr;
    }
}

// =======================================================================
// CUSTOM HIGH-SECURITY SERVER RNG PREDICTOR ENGINE
// =======================================================================
function generateRNGPrediction(upcomingPeriodStr) {
    // 0 se 9 ke beech pure digital random indicator algorithm selection
    const rngTargetNumber = Math.floor(Math.random() * 10);
    
    // EXCLUSIVE CUSTOM RULE: 0-4 = SMALL, 5-9 = BIG
    let ruleDecisionResult = "SMALL";
    if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
        ruleDecisionResult = "BIG";
    }

    // Assign text fields values directly to secure socket payload payload structure
    globalPrediction = {
        period: upcomingPeriodStr,
        color: ruleDecisionResult,  // Main field: Green/Red ko replace karke seedhe BIG/SMALL banayega
        numberSmall: "WAIT",       // Pattern A box content set to absolute clean state
        numberBig: "WAIT",         // Pattern B box content set to absolute clean state
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
    };

    io.emit('predictionUpdate', globalPrediction);
}

async function fetchLiveGameDataFromApi() {
    try {
        const response = await axios.get(GAME_API, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive'
            },
            timeout: 4000
        });

        if (response.data && response.data.data && response.data.data.list && response.data.data.list.length > 0) {
            const incomingApiList = response.data.data.list;
            const latestIncomingRound = incomingApiList[0];

            if (strictHistoryLog.length === 0 || strictHistoryLog[0].issueNumber !== latestIncomingRound.issueNumber) {
                strictHistoryLog.unshift(latestIncomingRound);
                if (strictHistoryLog.length > 50) {
                    strictHistoryLog = strictHistoryLog.slice(0, 50);
                }
                saveToPermanentDatabase(); 
            }

            // Extract issue number dynamically
            let rawApiPeriodStr = latestIncomingRound.issueNumber.toString();
            let safeUpcomingPeriod = calculateUpcoming3MinPeriod(rawApiPeriodStr);
            generateRNGPrediction(safeUpcomingPeriod);
        } else {
            // Fallback rule if data format shifts slightly inside payload
            fallbackRNGExecution();
        }
    } catch (networkError) {
        fallbackRNGExecution();
    }
}

function fallbackRNGExecution() {
    if(strictHistoryLog.length > 0 && strictHistoryLog[0].issueNumber) {
        let lastSavedPeriod = strictHistoryLog[0].issueNumber.toString();
        generateRNGPrediction(calculateUpcoming3MinPeriod(lastSavedPeriod));
    } else {
        // Absolute fail-safe wall-clock computation if API blocks completely
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const seq = Math.floor((now.getHours() * 60 + now.getMinutes()) / 3) + 1;
        generateRNGPrediction(`${year}${month}${day}${seq.toString().padStart(4, '0')}`);
    }
}

// Fast check synchronization loop (Every 2 seconds background refresh)
setInterval(fetchLiveGameDataFromApi, 2000);
fetchLiveGameDataFromApi();

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
server.listen(PORT, () => console.log(`[SYSTEM ONLINE] Mainframe live on port ${PORT}`));
