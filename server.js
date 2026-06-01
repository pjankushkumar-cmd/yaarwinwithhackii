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
        console.log("[MAIN NODE] Database initialized successfully.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[MAIN NODE] Database write error:", err);
    }
}

loadPermanentHistoryDatabase();

// API SE ONLY PERIOD NUMBER UTHEGA
const GAME_API = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageNo=1&pageSize=50&gameId=1";

let nextAllowedTargetPeriodNum = 0n; 
let currentLockedPrediction = { 
    period: "WAIT", 
    color: "WAIT", 
    numberSmall: "WAIT",
    numberBig: "WAIT"
};

// =======================================================================
// PURE API PERIOD DRIVEN + SERVER SIDE RNG ENGINE
// =======================================================================
function processLiveApiAndGenerateRNG(livePeriodStr) {
    try {
        const currentLivePeriodBigInt = BigInt(livePeriodStr);

        // Jab tak live API ka period hamare purane target tak nahi pahunchta, data freeze rakho
        if (currentLivePeriodBigInt >= nextAllowedTargetPeriodNum) {
            
            // 3-Minute Rule: Current live API period se exactly 3 rounds aage ka target (+3)
            nextAllowedTargetPeriodNum = currentLivePeriodBigInt + 3n;
            
            // Dashboard par dikhane ke liye aakhri ke 4 akshar (e.g. 1265)
            const filteredLast4Digits = nextAllowedTargetPeriodNum.toString().slice(-4);

            // API KA DATA IGNORE -> PURE SERVER SIDE RNG (0 se 9 random number choice)
            const rngTargetNumber = Math.floor(Math.random() * 10);
            
            // AAPKA RULE: 0-4 = SMALL, 5-9 = BIG
            let ruleDecisionResult = "SMALL";
            if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
                ruleDecisionResult = "BIG";
            }

            // Client Payload Setup
            currentLockedPrediction = {
                period: filteredLast4Digits, 
                color: ruleDecisionResult,        // Main title strip par BIG / SMALL dikhega
                numberSmall: "WAIT",             // Pattern A aur B ke andar automatic 'WAIT' text locked
                numberBig: "WAIT"
            };

            // Local database log maintainer
            const currentLogEntry = {
                issueNumber: nextAllowedTargetPeriodNum.toString(),
                number: rngTargetNumber,
                colour: ruleDecisionResult === "BIG" ? "GREEN" : "RED",
                size: ruleDecisionResult
            };

            strictHistoryLog.unshift(currentLogEntry);
            if (strictHistoryLog.length > 50) strictHistoryLog = strictHistoryLog.slice(0, 50);
            saveToPermanentDatabase();

            io.emit('predictionUpdate', currentLockedPrediction);
        } else {
            // Agar chalte hue round ke 3 rounds abhi pure nahi hue, toh data ko strictly freeze rakho
            io.emit('predictionUpdate', currentLockedPrediction);
        }
    } catch (e) {
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

async function fetchLiveGameDataFromApi() {
    try {
        const response = await axios.get(GAME_API, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Connection': 'keep-alive'
            },
            timeout: 5000
        });

        if (response.data && response.data.data && response.data.data.list && response.data.data.list.length > 0) {
            const latestIncomingRound = response.data.data.list[0];
            
            // Extract ONLY period string number from API
            let rawApiPeriodStr = latestIncomingRound.issueNumber.toString();
            
            // Run system execution rules
            processLiveApiAndGenerateRNG(rawApiPeriodStr);
        } else {
            io.emit('predictionUpdate', currentLockedPrediction);
        }
    } catch (networkError) {
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Har 3.5 second mein background sync chalega bina prediction flip kiye
setInterval(fetchLiveGameDataFromApi, 3500);
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
    socket.emit('predictionUpdate', currentLockedPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[RNG SYSTEM LIVE] Server active on port ${PORT}`));
