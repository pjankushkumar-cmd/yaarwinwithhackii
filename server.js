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
        console.log("[SYSTEM] Local database history logged.");
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

// Global states to manage 1-min period tracking and 3-min prediction gap
let lastProcessed1MinIndex = -1;
let currentLockedResult = "BIG"; 
let currentLockedPrediction = { 
    period: "0002", 
    color: "WAIT", 
    numberSmall: "WAIT",
    numberBig: "WAIT"
};

// =======================================================================
// HYBRID ENGINE: 1-MINUTE PERIOD COUNTER + 3-MINUTE PREDICTION GAP
// =======================================================================
function executeAutomatedTimeBlock() {
    const now = new Date();
    
    // Total minutes passed today inside system clock (IST sync)
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // 5:30 AM Shift Reset Rule (5 * 60 + 30 = 330 Minutes)
    const resetTimeMinutes = 330; 
    let diffMinutes = totalMinutesSinceMidnight - resetTimeMinutes;
    
    if (diffMinutes < 0) {
        diffMinutes = (24 * 60) + diffMinutes; 
    }

    // 1. GAME IS 1-MINUTE BASED (Period updates every 1 minute)
    const current1MinPeriodIndex = Math.floor(diffMinutes / 1) + 1;
    const upcomingPeriodSequence = current1MinPeriodIndex + 1;
    const formattedPeriodDisplay = upcomingPeriodSequence.toString().padStart(4, '0');

    // 2. PREDICTION HAS A 3-MINUTE GAP (Changes only every 3 minutes)
    const current3MinBlockId = Math.floor(diffMinutes / 3);

    // Check if a new 1-minute period has arrived
    if (current1MinPeriodIndex !== lastProcessed1MinIndex) {
        lastProcessed1MinIndex = current1MinPeriodIndex;

        // RNG triggers ONLY when the 3-minute block changes
        // Baki ke beech ke 2 minutes mein yeh automatic purana result hi hold rakhega (Freeze Rule)
        const rngTargetNumber = Math.floor(Math.random() * 10);
        let ruleDecisionResult = "SMALL";
        if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
            ruleDecisionResult = "BIG";
        }

        // Static variable updates only when a new 3-min window hits
        if (diffMinutes % 3 === 0) {
            currentLockedResult = ruleDecisionResult;

            // Log history entries safely
            const currentLogEntry = {
                issueNumber: formattedPeriodDisplay,
                number: rngTargetNumber,
                colour: currentLockedResult === "BIG" ? "GREEN" : "RED",
                size: currentLockedResult
            };
            strictHistoryLog.unshift(currentLogEntry);
            if (strictHistoryLog.length > 50) strictHistoryLog = strictHistoryLog.slice(0, 50);
            saveToPermanentDatabase();
        }

        // Broadcaster structure creation
        currentLockedPrediction = {
            period: formattedPeriodDisplay,    // Har 1 minute mein badlega (0002 -> 0003)
            color: currentLockedResult,        // Har 3 minute mein ek baar badlega (Freeze Gap)
            numberSmall: "WAIT",
            numberBig: "WAIT"
        };

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Keeps emitting the same state if within the same minute tick
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Background system clock core ticks every 1 second smoothly
setInterval(executeAutomatedTimeBlock, 1000);
executeAutomatedTimeBlock();

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
    if (!uid) return res.json({ status: 'invalid', message: 'Credentials parameter value missing.' });
    const match = uids[uid];
    if (!match) return res.json({ status: 'pending', message: 'Verification profile: PENDING!' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired', message: 'Active session timing elapsed!' });
    }
    res.json({ status: 'approved' });
});

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', currentLockedPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[HYBRID 1M-COUNTER 3M-GAP ENGINE ONLINE] Port: ${PORT}`));
