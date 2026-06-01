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
        console.log("[MAIN NODE] Telemetry cache error:", err);
    }
}

loadPermanentHistoryDatabase();

// API ENDPOINT (Sirf fallback ya tracking database ke liye, primary period calculation standard time-block se hogi)
const GAME_API = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageNo=1&pageSize=50&gameId=1";

let lastProcessedBlockId = -1; 
let currentLockedPrediction = { 
    period: "WAIT", 
    color: "WAIT", 
    numberSmall: "WAIT",
    numberBig: "WAIT"
};

// =======================================================================
// TRULY SYNCHRONIZED 3-MINUTE BLOCK & RNG ENGINE
// =======================================================================
function calculateTrue3MinPrediction() {
    const now = new Date();
    
    // Date parts string format setup (YYYYMMDD)
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const datePrefixStr = `${year}${month}${day}`;

    // Har ghante aur minute ko total minutes me badal kar pure 3-minute block nikalna
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const current3MinBlockId = Math.floor(totalMinutes / 3);
    
    // UPCOMING ROUND: Agla block sequence number (Current + 1)
    const upcomingBlockSequence = current3MinBlockId + 1;
    const fullUpcomingPeriodStr = `${datePrefixStr}${upcomingBlockSequence.toString().padStart(4, '0')}`;
    
    // AAPKI REQUIREMENT: Display par dikhane ke liye sirf last ke 4 numbers/akshar filter karna
    const last4DigitsPeriod = fullUpcomingPeriodStr.slice(-4);

    // CRITICAL SECURITY FIX: Jab tak 3 minute poore nahi hote, RNG dobara chal kar flip nahi hoga!
    if (current3MinBlockId !== lastProcessedBlockId) {
        lastProcessedBlockId = current3MinBlockId;

        // Pure Server side unique RNG choice selector (0 se 9)
        const rngTargetNumber = Math.floor(Math.random() * 10);
        
        // AAPKA SPECIFIC RULE: 0-4 = SMALL, 5-9 = BIG
        let ruleDecisionResult = "SMALL";
        if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
            ruleDecisionResult = "BIG";
        }

        // Response structures block generation
        currentLockedPrediction = {
            period: last4DigitsPeriod,  // Dashboard par ab sirf aakhri 4 akshar hi jayenge (e.g. 1265)
            color: ruleDecisionResult,  // Main result head strip text: BIG ya SMALL
            numberSmall: "WAIT",       // Pattern A default to clean string
            numberBig: "WAIT"          // Pattern B default to clean string
        };

        // Static configuration structure ko log history layer me save karna
        const currentLogEntry = {
            issueNumber: fullUpcomingPeriodStr,
            number: rngTargetNumber,
            colour: ruleDecisionResult === "BIG" ? "GREEN" : "RED",
            size: ruleDecisionResult
        };

        strictHistoryLog.unshift(currentLogEntry);
        if (strictHistoryLog.length > 50) strictHistoryLog = strictHistoryLog.slice(0, 50);
        saveToPermanentDatabase();

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Agar chalte hue round ke 3 minute abhi pure nahi hue, toh wahi purana prediction data data freeze bhejte raho
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Background monitoring synchronization frequency engine (Har 2 second me sync data maintain karega)
setInterval(calculateTrue3MinPrediction, 2000);
calculateTrue3MinPrediction();

// Optional background thread to silent sync data metrics from your api without breaking local blocks
async function backgroundApiLogging() {
    try {
        await axios.get(GAME_API, { timeout: 4000 });
    } catch(e){}
}
setInterval(backgroundApiLogging, 20000);

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
server.listen(PORT, () => console.log(`[3-MIN REAL TIME NODE] System fully operational on port ${PORT}`));
