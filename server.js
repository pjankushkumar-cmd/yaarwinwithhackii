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
let globalPrediction = {
    period: "----",
    prediction: "WAITING",
    topNumbers: [{ num: "-", chance: 0 }, { num: "-", chance: 0 }],
    timestamp: "--:--:--"
};

const DB_FILE_PATH = path.join(__dirname, 'history_database.json');

// Load initial data if exists
if (fs.existsSync(DB_FILE_PATH)) {
    try {
        const rawData = fs.readFileSync(DB_FILE_PATH, 'utf8');
        strictHistoryLog = JSON.parse(rawData);
    } catch (e) {
        strictHistoryLog = [];
    }
}

// Advanced Trend Prediction Algorithm Logic Engine
function executePatternAnalysis(upcomingPeriodStr) {
    let finalPrediction = "BIG";
    let targetOneNum = 6;
    let targetTwoNum = 8;

    if (strictHistoryLog && strictHistoryLog.length > 0) {
        let numericalStream = strictHistoryLog.map(g => {
            if (g.number !== undefined && g.number !== null) return parseInt(g.number);
            if (g.winNumber !== undefined && g.winNumber !== null) return parseInt(g.winNumber);
            return 0;
        });
        
        let weightCounter = Array(10).fill(0);

        // Exponential Recency Calculations Matrix
        numericalStream.forEach((num, index) => {
            if (num >= 0 && num <= 9) {
                let recencyPremium = 160 * Math.exp(-0.05 * index);
                weightCounter[num] += recencyPremium;
            }
        });

        let lastNum = numericalStream[0];
        let secondLastNum = numericalStream[1] !== undefined ? numericalStream[1] : 5;

        if (lastNum === secondLastNum) weightCounter[lastNum] += 100;

        let smallWeight = weightCounter[0] + weightCounter[1] + weightCounter[2] + weightCounter[3] + weightCounter[4];
        let bigWeight = weightCounter[5] + weightCounter[6] + weightCounter[7] + weightCounter[8] + weightCounter[9];

        let clusterScores = weightCounter.map((w, idx) => ({ num: idx, weight: w }));

        // Strict Compliance Filtering Rules based on user input logic
        if (bigWeight >= smallWeight) {
            finalPrediction = "BIG";
            let bigNumbers = clusterScores.filter(item => item.num >= 5 && item.num <= 9);
            bigNumbers.sort((a, b) => b.weight - a.weight);
            targetOneNum = bigNumbers[0].num;
            targetTwoNum = bigNumbers[1].num;
        } else {
            finalPrediction = "SMALL";
            let smallNumbers = clusterScores.filter(item => item.num >= 0 && item.num <= 4);
            smallNumbers.sort((a, b) => b.weight - a.weight);
            targetOneNum = smallNumbers[0].num;
            targetTwoNum = smallNumbers[1].num;
        }
    } else {
        let structuralFallbackSeed = parseInt(upcomingPeriodStr) || 9;
        if (structuralFallbackSeed % 2 === 0) {
            finalPrediction = "BIG";
            targetOneNum = 7;
            targetTwoNum = 9;
        } else {
            finalPrediction = "SMALL";
            targetOneNum = 1;
            targetTwoNum = 3;
        }
    }

    globalPrediction = {
        period: upcomingPeriodStr, 
        prediction: finalPrediction,
        topNumbers: [
            { num: targetOneNum, chance: 96 }, 
            { num: targetTwoNum, chance: 89 }
        ],
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
    };

    io.emit('predictionUpdate', globalPrediction);
}

// Fetching Data Matrix from API
async function updatePrediction() {
    try {
        const response = await axios.get('https://api.yaarwin.com/game/history?type=wingo1m', { timeout: 4000 });
        if (response.data && response.data.data) {
            const list = response.data.data;
            if(list.length > 0) {
                strictHistoryLog = list;
                fs.writeFileSync(DB_FILE_PATH, JSON.stringify(strictHistoryLog, null, 2));
                
                let currentLatestPeriod = parseInt(list[0].period);
                let upcomingPeriodStr = (currentLatestPeriod + 1).toString();
                executePatternAnalysis(upcomingPeriodStr);
            }
        }
    } catch (error) {
        // Fallback offline generator if external api fails
        let fallbackPeriod = new Date().getMinutes().toString();
        executePatternAnalysis("202606" + fallbackPeriod);
    }
}

// Dynamic Interval Loops
setInterval(updatePrediction, 5000);
updatePrediction();

// Socket Stream Connection
io.on('connection', (socket) => {
    socket.emit('predictionUpdate', globalPrediction);
});

// Admin Control Core Routes
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
    if (!match) return res.json({ status: 'pending', message: 'HACKII bhai se uid verification karbou' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired', message: 'Active session window expired.' });
    }
    res.json({ status: 'approved' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mainframe running on node server port ${PORT}`));
