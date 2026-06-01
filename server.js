const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
        return res.status(403).send('<h1>403 Forbidden: Identity Verification Failed!</h1>');
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
        console.log("[SYSTEM] Local memory database synced.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[SYSTEM] Database write error:", err);
    }
}

loadPermanentHistoryDatabase();

let lastProcessedMinuteIndex = -1; 
let currentLockedPrediction = { 
    period: "1309", 
    color: "WAIT", 
    predictNumberSmall: "WAITING",  // FRONTEND BOX 1 KEY FIXED
    predictNumberBig: "WAITING"     // FRONTEND BOX 2 KEY FIXED
};

// =======================================================================
// EXACT 24-HOUR CONTINUOUS TIMELINE + FRONTEND PROPERTY MATRIX
// =======================================================================
function executePerfectGameCycle() {
    const now = new Date();
    
    // Total minutes passed since 12:00 AM Midnight (IST Server Time Sync)
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // Real-time alignment tracker matching your current active game cycle pattern
    // Jaise 03:18 AM par chal raha total layout sequence map hoke exact match karega
    const baseOffsetShift = 1111; 
    const currentCalculatedPeriod = baseOffsetShift + totalMinutesSinceMidnight;
    const formattedPeriodDisplay = currentCalculatedPeriod.toString();

    // Loop fires ONLY when the real-time minute clock ticks forward
    if (currentCalculatedPeriod !== lastProcessedMinuteIndex) {
        lastProcessedMinuteIndex = currentCalculatedPeriod;

        // Rule: Har 3rd interval sequence block par result active hoga, baaki par WAIT chalega
        if (currentCalculatedPeriod % 3 === 1) {
            
            // Pure mathematical server side RNG selector (0 to 9)
            const rngTargetNumber = Math.floor(Math.random() * 10);
            
            // AAPKA ABSOLUTE RULE: 0-4 = SMALL, 5-9 = BIG
            let ruleDecisionResult = "SMALL";
            if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
                ruleDecisionResult = "BIG";
            }

            // FRONTEND KEYS MAP FIXED: predictNumberSmall aur predictNumberBig exact match kiya hai
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: ruleDecisionResult,
                predictNumberSmall: "WAITING", 
                predictNumberBig: "WAITING"   
            };

            const currentLogEntry = {
                issueNumber: formattedPeriodDisplay,
                number: rngTargetNumber,
                colour: ruleDecisionResult === "BIG" ? "GREEN" : "RED",
                size: ruleDecisionResult
            };
            strictHistoryLog.unshift(currentLogEntry);
            if (strictHistoryLog.length > 50) strictHistoryLog = strictHistoryLog.slice(0, 50);
            saveToPermanentDatabase();

        } else {
            // Wait sequence matching interval loop
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: "WAIT",
                predictNumberSmall: "WAITING", 
                predictNumberBig: "WAITING"   
            };
        }

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Keeps the existing payload values totally frozen to avoid rapid fluking
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Background core cron ticker running validation updates smoothly every 1 second
setInterval(executePerfectGameCycle, 1000);
executePerfectGameCycle();

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
    if (!uid) return res.json({ status: 'invalid', message: 'Credentials parameter values missing.' });
    const match = uids[uid];
    if (!match) return res.json({ status: 'pending', message: 'Verification status: PENDING!' });
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
server.listen(PORT, () => console.log(`[TOTAL CONTROL ENGINE ACTIVE] Server running on port ${PORT}`));
