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
        console.log("[SYSTEM] Database initialized successfully.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[SYSTEM] Database saving issue:", err);
    }
}

loadPermanentHistoryDatabase();

let lastProcessed1MinIndex = -1; 
let currentLockedPrediction = { 
    period: "0001", 
    color: "WAIT", 
    numberSmall: "WAIT",
    numberBig: "WAIT"
};

// =======================================================================
// TIMELINE ENGINE: 5:30 AM RESET + 3-PERIOD SKIP SEQUENCE STEPPER
// =======================================================================
function executeStrictSkipTimeline() {
    const now = new Date();
    
    // Total minutes passed today in system time (IST Sync)
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // 5:30 AM Shift Reset Point (5 * 60 + 30 = 330 Minutes)
    const resetTimeMinutes = 330; 
    let diffMinutes = totalMinutesSinceMidnight - resetTimeMinutes;
    
    if (diffMinutes < 0) {
        diffMinutes = (24 * 60) + diffMinutes; 
    }

    // Current 1-minute sequence base index
    const current1MinIndex = Math.floor(diffMinutes / 1) + 1;

    // AAPKA EXCLUSIVE SKIP RULE:
    // Har 3rd block par ek fix calculation step banta hai, baaki 2 targets skip ho jaate hain.
    // Index base grouping sequence find karna
    const currentGroupSequence = Math.floor((current1MinIndex - 1) / 3);
    
    // Target active period tracking index calculate karna: (Group * 3) + 1
    const activeTargetPeriodId = (currentGroupSequence * 3) + 1;
    
    // Convert directly to standard last 4 digits text (e.g. 0001 -> 0004 -> 0007...)
    const formattedPeriodDisplay = activeTargetPeriodId.toString().padStart(4, '0');

    // Execute state push only when a true 1-minute tick rolls forward
    if (current1MinIndex !== lastProcessed1MinIndex) {
        lastProcessed1MinIndex = current1MinIndex;

        // RNG runs only once when a new group block sets up
        const rngTargetNumber = Math.floor(Math.random() * 10);
        
        // MAPPING RULE: 0-4 = SMALL, 5-9 = BIG
        let ruleDecisionResult = "SMALL";
        if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
            ruleDecisionResult = "BIG";
        }

        // Broadcaster packet structure updates seamlessly
        currentLockedPrediction = {
            period: formattedPeriodDisplay,   // Shows 0001, skips 0002 & 0003, then jumps straight to 0004
            color: ruleDecisionResult,        // Big or Small locked value
            numberSmall: "WAIT",             // Pattern A box displaying standard wait text
            numberBig: "WAIT"                // Pattern B box displaying standard wait text
        };

        // Maintain log database sync only for genuine active changes
        if ((current1MinIndex - 1) % 3 === 0) {
            const currentLogEntry = {
                issueNumber: formattedPeriodDisplay,
                number: rngTargetNumber,
                colour: ruleDecisionResult === "BIG" ? "GREEN" : "RED",
                size: ruleDecisionResult
            };
            strictHistoryLog.unshift(currentLogEntry);
            if (strictHistoryLog.length > 50) strictHistoryLog = strictHistoryLog.slice(0, 50);
            saveToPermanentDatabase();
        }

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Keeps state completely frozen during intermediate minute loops
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Background core heartbeat system running validation smoothly every 1 second
setInterval(executeStrictSkipTimeline, 1000);
executeStrictSkipTimeline();

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
    if (!match) return res.json({ status: 'pending', message: 'Verification status: PENDING!' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired', message: 'Active session timing window elapsed!' });
    }
    res.json({ status: 'approved' });
});

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', currentLockedPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[SKIP-INTERVAL ENGINE SYSTEM ONLINE] Deployed on port ${PORT}`));
