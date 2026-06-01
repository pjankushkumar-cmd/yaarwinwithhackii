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
        console.log("[SYSTEM] Local memory storage online.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[SYSTEM] Database updated successfully.");
    }
}

loadPermanentHistoryDatabase();

let lastProcessedMinuteIndex = -1; 
let currentLockedPrediction = { 
    period: "1321", 
    color: "WAIT", 
    predictNumberSmall: "WAITING",  
    predictNumberBig: "WAITING",
    numberSmall: "WAITING",
    numberBig: "WAITING"
};

// Helper function to generate two distinct random numbers based on BIG/SMALL rule
function generateTwoNumbers(size) {
    let pool = [];
    if (size === "SMALL") {
        pool = [0, 1, 2, 3, 4]; // Small Pool Numbers
    } else {
        pool = [5, 6, 7, 8, 9]; // Big Pool Numbers
    }
    let shuffled = pool.sort(() => 0.5 - Math.random());
    return {
        num1: shuffled[0].toString(),
        num2: shuffled[1].toString()
    };
}

// =======================================================================
// EXACT 5:30 AM RESET -> 24-HOUR CONTINUOUS MATHEMATICAL LOGIC
// =======================================================================
function executePerfectGameCycle() {
    const now = new Date();
    
    // Total minutes passed since midnight 12:00 AM (IST Sync)
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // AAPKA RULES MATRIX: 5:30 AM Shift point calculation (330 Minutes)
    const resetTimeMinutes = 330;
    let diffMinutes = totalMinutesSinceMidnight - resetTimeMinutes;
    
    // Midnight se 5:30 AM ke beech ki timeline ko roll-over handle karna
    if (diffMinutes < 0) {
        diffMinutes = (24 * 60) + diffMinutes; 
    }

    // Har ek minute par automatic sequence +1 badhegi
    // Example: Subah 5:30 AM = 0001, Agle din 3:30 AM = 1321 (Absolute Perfect Math!)
    const currentPeriodNumber = Math.floor(diffMinutes / 1) + 1;
    const formattedPeriodDisplay = currentPeriodNumber.toString().padStart(4, '0');

    // Server updates only when the real clock minute increments
    if (currentPeriodNumber !== lastProcessedMinuteIndex) {
        lastProcessedMinuteIndex = currentPeriodNumber;

        // SKIP LOOP RULE: Har 3rd period par naya result open hoga
        if (currentPeriodNumber % 3 === 1) {
            
            const rngTargetNumber = Math.floor(Math.random() * 10);
            
            let ruleDecisionResult = "SMALL";
            if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
                ruleDecisionResult = "BIG";
            }

            // Pool se do exact numbers nikalna
            const pair = generateTwoNumbers(ruleDecisionResult);

            // DOUBLE VARIABLE MAPPING: Dono type ke frontend template keys ko pass kiya hai
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: ruleDecisionResult,
                predictNumberSmall: pair.num1, // Target Output 1
                predictNumberBig: pair.num2,   // Target Output 2
                numberSmall: pair.num1,        // Backup map key
                numberBig: pair.num2           // Backup map key
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
            // Beech ke baaki do rounds par automatic "WAIT" aur "WAITING" set rahega
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: "WAIT",
                predictNumberSmall: "WAITING", 
                predictNumberBig: "WAITING",
                numberSmall: "WAITING",
                numberBig: "WAITING"
            };
        }

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Keeps values strictly frozen for 60 seconds to prevent rapid flashing
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Background precision scanner running every 1 second
setInterval(executePerfectGameCycle, 1000);
executePerfectGameCycle();

app.post('/api/admin/uid', (req, res) => {
    const { token, uid, action, duration } = req.body;
    if (token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Invalid admin token.' });

    if (action === 'approve') {
        uids[uid] = { status: 'approved', expiry: Date.now() + (parseInt(duration) * 60 * 1000) };
    } else if (action === 'reject' || action === 'delete') {
        delete uids[uid];
        io.emit('uidRevoked', { uid });
    }
    res.json({ success: true, uids });
});

app.get('/api/admin/uids', (req, res) => {
    if (req.query.token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Invalid admin token.' });
    res.json(uids);
});

app.post('/api/user/verify', (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.json({ status: 'invalid', message: 'Missing UID.' });
    const match = uids[uid];
    if (!match) return res.json({ status: 'pending', message: 'Verification status: PENDING!' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired', message: 'Session expired!' });
    }
    res.json({ status: 'approved' });
});

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', currentLockedPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[SYSTEM TIMELINE SYNCHRONIZED] App live on port ${PORT}`));
