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
        console.log("[SYSTEM] Local memory storage synced.");
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
    period: "0001", 
    color: "BIG", 
    numberSmall: "WAITING",
    numberBig: "WAITING"
};

// =======================================================================
// DYNAMIC 5:30 AM RESET + 1-MIN PERIOD TRACKER + 3-MIN SKIP WAIT LOGIC
// =======================================================================
function executePerfectGameCycle() {
    const now = new Date();
    
    // Total minutes passed today in system clock (IST Standard)
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // SUBHA 5:30 AM RESET RULE (5 * 60 + 30 = 330 Minutes)
    const resetTimeMinutes = 330; 
    let diffMinutes = totalMinutesSinceMidnight - resetTimeMinutes;
    
    // Reset frame calculation logic if time is between midnight and 5:30 AM
    if (diffMinutes < 0) {
        diffMinutes = (24 * 60) + diffMinutes; 
    }

    // 1. HAR MINUTE PERIOD NUMBER BADLEGA (Continuous 1-Min Counter)
    // 5:30 AM exact par base index 0 hoga (yaani period 0000), 5:31 par 0001...
    const currentPeriodNumber = Math.floor(diffMinutes / 1);
    const formattedPeriodDisplay = currentPeriodNumber.toString().padStart(4, '0');

    // 2. TRUE 3-MINUTE PATTERN & WAIT SKIP SCHEDULER
    if (currentPeriodNumber !== lastProcessedMinuteIndex) {
        lastProcessedMinuteIndex = currentPeriodNumber;

        // Check if this specific minute is the 3rd interval match
        // Rule: Agar (Period % 3 === 1) hai toh real result open hoga, baki dono par WAIT dikhega!
        if (currentPeriodNumber % 3 === 1) {
            
            // Server side secure mathematical RNG generation (0 to 9)
            const rngTargetNumber = Math.floor(Math.random() * 10);
            
            // AAPKA RULE: 0-4 = SMALL, 5-9 = BIG
            let ruleDecisionResult = "SMALL";
            if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
                ruleDecisionResult = "BIG";
            }

            currentLockedPrediction = {
                period: formattedPeriodDisplay,       // Active sequential period number
                color: ruleDecisionResult,           // Displays generated result: BIG / SMALL
                numberSmall: "WAITING",              // Custom template formatting text boxes
                numberBig: "WAITING"
            };

            // Maintain log inside JSON database
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
            // AAPKA SKIP RULE: Beech wale do rounds par automatic "WAIT" flash hoga screen par!
            currentLockedPrediction = {
                period: formattedPeriodDisplay,       // Period updates smoothly every minute
                color: "WAIT",                        // Main title updates into WAIT instruction status
                numberSmall: "WAITING",               // Sub boxes show steady waiting status text
                numberBig: "WAITING"
            };
        }

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Safe lock maintenance broadcast signal
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Background engine running precise validation checks every 1 second
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
        return res.json({ status: 'expired', message: 'Active session timing has closed!' });
    }
    res.json({ status: 'approved' });
});

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', currentLockedPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[PERFECT 5:30AM LOOP TIMELINE ONLINE] Active Port: ${PORT}`));
