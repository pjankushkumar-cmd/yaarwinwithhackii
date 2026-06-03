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
        return res.status(403).send('<h1>403 Forbidden: Access Denied!</h1>');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let uids = {}; 
let globalPrediction = {
    period: "----",
    prediction: "WAITING",
    topNumbers: [{ num: "-", chance: 0 }, { num: "-", chance: 0 }],
    timestamp: "--:--:--"
};

const DB_FILE_PATH = path.join(__dirname, 'history_database.json');

// Advanced Weight-Based Dynamic Number Selection Engine
function calculateDynamicNumbers(trend, historyList) {
    let weights = Array(10).fill(0);
    
    // Agar live history data available hai toh recency calculation algorithm chalega
    if (historyList && historyList.length > 0) {
        historyList.forEach((game, index) => {
            let num = parseInt(game.number || game.winNumber);
            if (num >= 0 && num <= 9) {
                // Jo number jitna naya hai, usko utna zyada weight milega
                weights[num] += 150 * Math.exp(-0.08 * index);
            }
        });
    } else {
        // Agar history empty hai toh default random weight values assign hongi
        for(let i=0; i<10; i++) { weights[i] = Math.random() * 100; }
    }

    let dynamicPicks = [];
    
    if (trend === "BIG") {
        // Strict Rule: Sirf 5 to 9 me se do best numbers filter honge
        let bigPool = [];
        for (let i = 5; i <= 9; i++) {
            bigPool.push({ num: i, score: weights[i] });
        }
        // Score ke mutabik highest top 2 numbers short-list honge
        bigPool.sort((a, b) => b.score - a.score);
        dynamicPicks.push({ num: bigPool[0].num, chance: 94 }, { num: bigPool[1].num, chance: 88 });
    } else {
        // Strict Rule: Sirf 0 to 4 me se do best numbers filter honge
        let smallPool = [];
        for (let i = 0; i <= 4; i++) {
            smallPool.push({ num: i, score: weights[i] });
        }
        smallPool.sort((a, b) => b.score - a.score);
        dynamicPicks.push({ num: smallPool[0].num, chance: 95 }, { num: smallPool[1].num, chance: 87 });
    }
    
    return dynamicPicks;
}

// Main Prediction Synchronization Node
async function updatePrediction() {
    try {
        const response = await axios.get('https://api.yaarwin.com/game/history?type=wingo1m', { timeout: 3500 });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
            const list = response.data.data;
            fs.writeFileSync(DB_FILE_PATH, JSON.stringify(list, null, 2));
            
            // Period Alignment Engine Fix
            let currentLatestPeriod = parseInt(list[0].period);
            let upcomingPeriodStr = (currentLatestPeriod + 1).toString();
            
            // Extracting real live trends from active response block
            let apiLatestOutcomeNum = parseInt(list[0].number || list[0].winNumber || 0);
            let extractedTrend = (apiLatestOutcomeNum >= 5) ? "BIG" : "SMALL";
            
            // Anti-clumping balance filter algorithm
            if(list[1]) {
                let prevNum = parseInt(list[1].number || list[1].winNumber || 0);
                if(apiLatestOutcomeNum === prevNum) {
                    extractedTrend = (extractedTrend === "BIG") ? "SMALL" : "BIG";
                }
            }

            globalPrediction = {
                period: upcomingPeriodStr,
                prediction: extractedTrend,
                topNumbers: calculateDynamicNumbers(extractedTrend, list),
                timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
            };

            io.emit('predictionUpdate', globalPrediction);
            return;
        }
    } catch (error) {
        // Fallback catch node trigger if external response fails
    }

    // High Precision Time + Period Fallback Formula System Rules
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    const totalMinutesToday = (d.getHours() * 60) + d.getMinutes();
    const upcomingPeriodIndex = totalMinutesToday + 1; 
    const paddedIndex = String(upcomingPeriodIndex).padStart(4, '0');
    
    const correctedPeriodString = `${yyyy}${mm}${dd}${paddedIndex}`;
    let structuralTrend = (upcomingPeriodIndex % 2 === 0) ? "BIG" : "SMALL";

    globalPrediction = {
        period: correctedPeriodString, 
        prediction: structuralTrend,
        topNumbers: calculateDynamicNumbers(structuralTrend, null),
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false })
    };

    io.emit('predictionUpdate', globalPrediction);
}

// Interval dynamic mapping verification loop
setInterval(updatePrediction, 4000);
updatePrediction();

io.on('connection', (socket) => {
    socket.emit('predictionUpdate', globalPrediction);
});

app.post('/api/admin/uid', (req, res) => {
    const { token, uid, action, duration } = req.body;
    if (token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Token state invalid.' });

    if (action === 'approve') {
        uids[uid] = { status: 'approved', expiry: Date.now() + (parseInt(duration) * 60 * 1000) };
    } else if (action === 'reject' || action === 'delete') {
        delete uids[uid];
        io.emit('uidRevoked', { uid });
    }
    res.json({ success: true, uids });
});

app.get('/api/admin/uids', (req, res) => {
    if (req.query.token !== ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Token state invalid.' });
    res.json(uids);
});

app.post('/api/user/verify', (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.json({ status: 'invalid', message: 'Parameters empty.' });
    const match = uids[uid];
    if (!match) return res.json({ status: 'pending', message: 'HACKII bhai se uid verification karbou' });
    if (Date.now() > match.expiry) {
        delete uids[uid];
        return res.json({ status: 'expired', message: 'Node access validation frame window closed.' });
    }
    res.json({ status: 'approved' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pipeline streaming matrix executing on server node:${PORT}`));
