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
                console.log(`[MAIN NODE] Syncing database logs: ${strictHistoryLog.length}`);
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

// Aapki original WinGo Game API URL (Sirf Period Number dynamically sync karne ke liye)
const GAME_API_ENDPOINT = "https://91clubapi.onrender.com/api/wingo/1min";

let globalPrediction = { 
    period: "Loading...", 
    color: "GREEN", 
    numberSmall: 0,
    numberBig: "SMALL", 
    timestamp: "00:00:00" 
};

// =======================================================================
// SYSTEM CORE: API PERIOD SYNC + CUSTOM 3-MIN RNG ENGINE
// =======================================================================
async function updatePrediction() {
    try {
        // Step 1: API se current period number fetch karna
        const response = await axios.get(GAME_API_ENDPOINT);
        if (response.data && response.data.data && response.data.data.games) {
            const latestGameFromApi = response.data.data.games[0];
            const currentApiPeriodStr = latestGameFromApi.issueNumber; // e.g. "202606021001"
            
            if (currentApiPeriodStr) {
                // Step 2: 3-Minute ke baad aane wale upcoming target period ki calculation
                // Hum last digits (sequence) ko extract karke usmein 3 rounds plus kar rahe hain
                const basePeriodInt = BigInt(currentApiPeriodStr);
                const upcoming3MinPeriodStr = (basePeriodInt + 3n).toString();

                // Step 3: Pure Online Server RNG Engine Logic execution
                // Kisi external API result par depend nahi karega, pure random number generate hoga
                const rngTargetNumber = Math.floor(Math.random() * 10);
                
                // YOUR EXCLUSIVE RULE: 0-4 = SMALL, 5-9 = BIG
                let calculationResultString = "";
                if (rngTargetNumber >= 0 && rngTargetNumber <= 4) {
                    calculationResultString = "SMALL";
                } else {
                    calculationResultString = "BIG";
                }

                // UI Aesthetics aur UI breakdown se bachne ke liye dynamic colors allocation
                let colorBadgeState = "GREEN";
                if ([2, 4, 6, 8].includes(rngTargetNumber)) {
                    colorBadgeState = "RED";
                } else if ([1, 3, 7, 9].includes(rngTargetNumber)) {
                    colorBadgeState = "GREEN";
                } else if (rngTargetNumber === 0) {
                    colorBadgeState = "RED-VIOLET";
                } else if (rngTargetNumber === 5) {
                    colorBadgeState = "GREEN-VIOLET";
                }

                // Step 4: UI format map payload update
                globalPrediction = {
                    period: upcoming3MinPeriodStr, // Yeh dashboard par 3-minute baad wala target period dikhayega
                    color: colorBadgeState,
                    numberSmall: rngTargetNumber, // Box me random number show karega
                    numberBig: calculationResultString, // Box me exact BIG ya SMALL text string show karega
                    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
                };

                // Local logs database validation structure
                const currentLogEntry = {
                    issueNumber: upcoming3MinPeriodStr,
                    number: rngTargetNumber,
                    colour: colorBadgeState,
                    size: calculationResultString
                };

                if (strictHistoryLog.length === 0 || strictHistoryLog[0].issueNumber !== upcoming3MinPeriodStr) {
                    strictHistoryLog.unshift(currentLogEntry);
                    if (strictHistoryLog.length > 50) {
                        strictHistoryLog = strictHistoryLog.slice(0, 50);
                    }
                    saveToPermanentDatabase();
                }

                // Socket nodes data transfer broadcast
                io.emit('predictionUpdate', globalPrediction);
            }
        }
    } catch (error) {
        console.log("[DETECTION ERROR] API core sync fallback active. Retrying channel connection...");
    }
}

// Har 2-5 seconds me background check algorithm trigger karna taaki period automatic accurately sync rahe
setInterval(updatePrediction, 3000);
updatePrediction();

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
server.listen(PORT, () => console.log(`[CORE SYSTEM ONLINE] Running server smoothly on port ${PORT}`));
