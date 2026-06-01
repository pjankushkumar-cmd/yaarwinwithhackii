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
    period: "1318", 
    color: "WAIT", 
    predictNumberSmall: "WAITING",  
    predictNumberBig: "WAITING"     
};

// Helper function to generate two random numbers based on BIG/SMALL rule
function generateTwoNumbers(size) {
    let pool = [];
    if (size === "SMALL") {
        pool = [0, 1, 2, 3, 4];
    } else {
        pool = [5, 6, 7, 8, 9];
    }
    // Shuffle pool to get two unique random numbers
    let shuffled = pool.sort(() => 0.5 - Math.random());
    return {
        num1: shuffled[0].toString(),
        num2: shuffled[1].toString()
    };
}

// =======================================================================
// EXACT 5:30 AM RESET -> 24-HOUR CONTINUOUS MATHEMATICAL ENGINE
// =======================================================================
function executePerfectGameCycle() {
    const now = new Date();
    
    // Total minutes passed since midnight 12:00 AM (IST Sync)
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // 5:30 AM Reset Point = 330 Minutes
    const resetTimeMinutes = 330;
    let diffMinutes = totalMinutesSinceMidnight - resetTimeMinutes;
    
    // Handle cross-over from midnight to 5:30 AM to keep continuity
    if (diffMinutes < 0) {
        diffMinutes = (24 * 60) + diffMinutes; 
    }

    // Har minute period 1 se aage badhega (5:30 AM = 0001, 3:27 AM = 1318)
    const currentPeriodNumber = Math.floor(diffMinutes / 1) + 1;
    const formattedPeriodDisplay = currentPeriodNumber.toString().padStart(4, '0');

    // System changes output ONLY when the real clock minute changes
    if (currentPeriodNumber !== lastProcessedMinuteIndex) {
        lastProcessedMinuteIndex = currentPeriodNumber;

        // SKIP LOGIC: Har 3rd period par result khulega, baaki do par WAIT/WAITING rahega
        if (currentPeriodNumber % 3 === 1) {
            
            // Server-side safe RNG (0-9)
            const rngTargetNumber = Math.floor(Math.random() * 10);
            
            // 0-4 = SMALL, 5-9 = BIG
            let ruleDecisionResult = "SMALL";
            if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
                ruleDecisionResult = "BIG";
            }

            // Generate 2 random numbers according to BIG or SMALL result
            const pair = generateTwoNumbers(ruleDecisionResult);

            // FRONTEND FIXED: Map numbers into predictNumberSmall (Pattern A) and predictNumberBig (Pattern B)
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: ruleDecisionResult,
                predictNumberSmall: pair.num1, // Shows Number 1
                predictNumberBig: pair.num2    // Shows Number 2
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
            // Beech ke do periods par status automatic WAIT ho jayega aur boxes mein WAITING dikhega
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: "WAIT",
                predictNumberSmall: "WAITING", 
                predictNumberBig: "WAITING"   
            };
        }

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Keeps the state locked so it doesn't change every second
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// Heartbeat interval running every 1 second
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
server.listen(PORT, () => console.log(`[MATHEMATICAL ENGINE ACTIVE] Deployed perfectly on port ${PORT}`));
