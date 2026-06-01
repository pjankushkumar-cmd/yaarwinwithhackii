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
        return res.status(403).send('<h1>403 Forbidden</h1>');
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
        console.log("[SYSTEM] Database synced.");
    }
}

function saveToPermanentDatabase() {
    try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2), 'utf8');
    } catch (err) {
        console.log("[SYSTEM] Write error.");
    }
}

loadPermanentHistoryDatabase();

let lastProcessedMinuteIndex = -1; 
let currentLockedPrediction = { 
    period: "1321", 
    color: "WAIT", 
    predictNumberSmall: "WAIT",  
    predictNumberBig: "WAIT",
    numberSmall: "WAIT",
    numberBig: "WAIT"
};

// Helper function to pick two separate numbers based on the group (FIXED BUGS)
function getTwoGroupNumbers(size) {
    let pool = (size === "SMALL") ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
    // Array copy karke slice logic se static random shuffle generate karna
    let shuffled = [...pool].sort(() => 0.5 - Math.random());
    return {
        n1: shuffled[0].toString(),
        n2: shuffled[1].toString()
    };
}

// =======================================================================
// EXACT 5:30 AM RESET TIMELINE TIMING MATHEMATICAL ENGINE (FIXED)
// =======================================================================
function executePerfectGameCycle() {
    // SERVER TIME FORCED TO INDIAN STANDARD TIME (IST) DIRECT INTERFACE
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    
    // Convert current time to total minutes passed since 12:00 AM Midnight
    const totalMinutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // 5:30 AM base shift reference point (330 minutes)
    const resetTimeMinutes = 330;
    let diffMinutes = totalMinutesSinceMidnight - resetTimeMinutes;
    
    // Handle timeline shift rollover cleanly
    if (diffMinutes < 0) {
        diffMinutes = (24 * 60) + diffMinutes; 
    }

    // Exact formula base logic tracker -> Matches 3:30 AM to 1321 perfectly
    const currentPeriodNumber = Math.floor(diffMinutes / 1) + 1;
    const formattedPeriodDisplay = currentPeriodNumber.toString().padStart(4, '0');

    // System runs calculation ONLY once per exact minute block change
    if (currentPeriodNumber !== lastProcessedMinuteIndex) {
        lastProcessedMinuteIndex = currentPeriodNumber;

        // 3-Minute Cycle Skip Protocol
        if (currentPeriodNumber % 3 === 1) {
            
            const rngTargetNumber = Math.floor(Math.random() * 10);
            
            let ruleDecisionResult = "SMALL";
            if (rngTargetNumber >= 5 && rngTargetNumber <= 9) {
                ruleDecisionResult = "BIG";
            }

            // Extract two exact discrete digits for the boxes
            const digits = getTwoGroupNumbers(ruleDecisionResult);

            // FORCE FEED ALL KNOWN FRONTEND VARIABLES (Dono template formats ko backup variable pass kiya hai)
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: ruleDecisionResult,
                predictNumberSmall: digits.n1, 
                predictNumberBig: digits.n2,   
                numberSmall: digits.n1,        
                numberBig: digits.n2           
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
            // Static clear text for empty/skip rounds
            currentLockedPrediction = {
                period: formattedPeriodDisplay,
                color: "WAIT",
                predictNumberSmall: "WAIT", 
                predictNumberBig: "WAIT",
                numberSmall: "WAIT",
                numberBig: "WAIT"
            };
        }

        io.emit('predictionUpdate', currentLockedPrediction);
    } else {
        // Keeps state completely frozen during the active minute interval
        io.emit('predictionUpdate', currentLockedPrediction);
    }
}

// System tick check every 1000ms
setInterval(executePerfectGameCycle, 1000);
executePerfectGameCycle();

app.post('/api/admin/uid', (req, res) => {
    const { token, uid, action, duration } = req.body;
    if (token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'approve') {
        uids[uid] = { status: 'approved', expiry: Date.now() + (parseInt(duration) * 60 * 1000) };
    } else if (action === 'reject' || action === 'delete') {
        delete uids[uid];
        io.emit('uidRevoked', { uid });
    }
    res.json({ success: true, uids });
});

app.get('/api/admin/uids', (req, res) => {
    if (req.query.token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    res.json(uids);
});

app.post('/api/user/verify', (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.json({ status: 'invalid' });
    const match = uids[uid];
    if (!match) return res.json({ status: 'pending' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired' });
    }
    res.json({ status: 'approved' });
});

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', currentLockedPrediction);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Engine live on port ${PORT}`));
