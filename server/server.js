require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./config/db');

// Import des routes
const moneyRoutes = require('./routes/moneyRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Configuration CORS complète pour le Cloud
app.use(cors({
    origin: ["https://fap-fap-game.onrender.com", "http://localhost:5000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.options('*', cors());

app.use(express.json());

// --- Branchement des Routes API ---
app.use('/api/money', moneyRoutes);
app.use('/api/auth', authRoutes);

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

let tables = {}; 

io.on('connection', (socket) => {
    console.log('📱 Connecté :', socket.id);

    function logAction(tableId, message, type = 'info') {
        io.to(tableId).emit('history-update', { 
            message, 
            type, 
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        });
    }

    // --- 1. LOGIQUE DE CONNEXION & REJOINDRE ---
    socket.on('join-table', async (data) => {
        const tableId = `club_${data.club_id}`;
        
        try {
            const [clubStatus] = await db.query("SELECT is_active FROM clubs WHERE id = ?", [data.club_id]);
            if (clubStatus.length > 0 && clubStatus[0].is_active === 0) {
                return socket.emit('error-msg', { message: "Ce club est actuellement suspendu par l'administration." });
            }
        } catch (err) {
            console.error("Erreur check club status:", err);
        }

        socket.join(tableId);
        let userBalance = 0; 

        try {
            const [rows] = await db.query("SELECT id, wallet, role FROM users WHERE username = ?", [data.username]);
            if (rows.length > 0) {
                userBalance = rows[0].wallet;
                socket.userId = rows[0].id;
                socket.userRole = rows[0].role;
                socket.emit('wallet-update', { balance: userBalance });
            }
        } catch (err) {
            console.error("Erreur récupération wallet:", err);
        }

        if (!tables[tableId]) {
            tables[tableId] = { 
                players: [], 
                pot: 0, 
                stake: data.stake || 500, 
                status: 'WAITING',
                turnIndex: 0,
                dealerIndex: 0,
                cardsOnTable: [],
                cardsPlayedInRound: 0,
                clubId: data.club_id 
            };
        }

        const table = tables[tableId];

        if (table.players.length < 4 && !table.players.find(p => p.username === data.username)) {
            table.players.push({ 
                id: socket.id, 
                username: data.username, 
                wallet: userBalance,
                hand: [],
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`,
                isInHand: true,
                isPassing: false,
                passedCards: []
            });
            logAction(tableId, `${data.username} a rejoint la table.`);
        }
        
        io.to(tableId).emit('player-list-update', table.players);
        
        if(table.players.length > 0) {
            const dealer = table.players[table.dealerIndex];
            if(dealer) io.to(tableId).emit('update-dealer', { dealerId: dealer.id });
        }
    });

    socket.on('refresh-wallet', async (data) => {
        const tableId = `club_${data.club_id}`;
        try {
            const [rows] = await db.query("SELECT wallet FROM users WHERE username = ?", [data.username]);
            if (rows.length > 0) {
                const newBalance = rows[0].wallet;
                const table = tables[tableId];
                if (table) {
                    const player = table.players.find(p => p.username === data.username);
                    if (player) {
                        player.wallet = newBalance;
                        io.to(tableId).emit('player-list-update', table.players);
                        socket.emit('wallet-update', { balance: newBalance });
                    }
                }
            }
        } catch (err) {
            console.error("Erreur refresh wallet:", err);
        }
    });

    socket.on('send-chat', (data) => {
        const tableId = `club_${data.club_id}`;
        io.to(tableId).emit('receive-chat', {
            username: data.username,
            message: data.message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // --- 2. DÉBUT DE PARTIE ---
    socket.on('start-game', async (data) => {
        const tableId = `club_${data.club_id}`;
        const table = tables[tableId];
        
        if (!table || table.players.length < 2) return;
        const dealer = table.players[table.dealerIndex];
        if (socket.id !== dealer.id) return;

        try {
            for (let p of table.players) {
                const [userRows] = await db.query("SELECT wallet FROM users WHERE username = ?", [p.username]);
                if (!userRows[0] || userRows[0].wallet < table.stake) {
                    logAction(tableId, `Fonds insuffisants pour ${p.username}`, 'warning');
                    socket.emit('game-start-failed', { message: `Fonds insuffisants pour ${p.username}` });
                    return; 
                }
            }

            for (let p of table.players) {
                await db.query("UPDATE users SET wallet = wallet - ? WHERE username = ?", [table.stake, p.username]);
                const sqlTransaction = "INSERT INTO transactions (user_id, club_id, amount, type) VALUES ((SELECT id FROM users WHERE username = ?), ?, ?, 'mise')";
                await db.query(sqlTransaction, [p.username, data.club_id, -table.stake]);
                
                const [newBal] = await db.query("SELECT wallet FROM users WHERE username = ?", [p.username]);
                p.wallet = newBal[0].wallet; 
                io.to(p.id).emit('wallet-update', { balance: p.wallet });
            }
            io.to(tableId).emit('player-list-update', table.players);
            
        } catch (err) {
            console.error("Erreur SQL débit:", err);
            socket.emit('game-start-failed', { message: "Erreur technique lors du prélèvement." });
            return;
        }

        table.cardsOnTable = [];
        table.cardsPlayedInRound = 0;
        table.status = 'PLAYING';
        table.turnIndex = (table.dealerIndex - 1 + table.players.length) % table.players.length;

        table.players.forEach(p => {
            p.isInHand = true;
            p.isPassing = false;
            p.passedCards = [];
        });

        let deck = [];
        const suits = ['spade', 'heart', 'club', 'diamond'];
        for (let s of suits) {
            for (let v = 3; v <= 10; v++) deck.push({ suit: s, value: v });
        }
        deck = deck.sort(() => Math.random() - 0.5);

        table.players.forEach(p => {
            p.hand = deck.splice(0, 5);
            io.to(p.id).emit('receive-cards', { 
                hand: p.hand, 
                turn: table.players[table.turnIndex].id === p.id 
            });
        });

        table.pot = table.players.length * table.stake;
        logAction(tableId, `Mises collectées. Pot: ${table.pot} FCFA.`, 'system');

        io.to(tableId).emit('game-started', { 
            pot: table.pot,
            activePlayer: table.players[table.turnIndex].username,
            activePlayerId: table.players[table.turnIndex].id,
            dealerId: dealer.id
        });
    });

    // --- 3. ACTIONS DE JEU ---
    socket.on('fold-hand', (data) => {
        const tableId = `club_${data.club_id}`;
        const table = tables[tableId];
        if (!table || table.status !== 'PLAYING' || table.cardsPlayedInRound >= 2) return;

        const player = table.players.find(p => p.id === socket.id);
        if (player && player.isInHand && !player.isPassing) {
            player.isInHand = false;
            player.hand = [];
            logAction(tableId, `${player.username} a banqué.`, 'warning');
            io.to(tableId).emit('player-folded', { username: player.username, id: player.id });

            const activePlayers = table.players.filter(p => p.isInHand);
            if (activePlayers.length === 1) {
                handleGameOver(tableId, activePlayers[0], table.pot, "TOUS BANQUÉ", data.club_id);
            } else if (table.players[table.turnIndex].id === socket.id) {
                passTurn(tableId);
            }
        }
    });

    socket.on('player-pass', (data) => {
        const tableId = `club_${data.club_id}`;
        const table = tables[tableId];
        if (!table || table.status !== 'PLAYING') return;
        const player = table.players.find(p => p.id === socket.id);
        if (player && player.hand.length === 2 && table.players[table.turnIndex].id === socket.id) {
            player.isPassing = true;
            player.passedCards = [...player.hand]; 
            player.hand = []; 
            logAction(tableId, `${player.username} est à PASS.`, 'info');
            io.to(tableId).emit('player-status-pass', { playerId: player.id, username: player.username });
            passTurn(tableId);
        }
    });

    socket.on('card-played', (data) => {
        const tableId = `club_${data.club_id}`;
        const table = tables[tableId];
        if (!table || table.status !== 'PLAYING') return;
        const currentPlayer = table.players[table.turnIndex];
        if (socket.id !== currentPlayer.id) return;

        currentPlayer.hand = currentPlayer.hand.filter(c => !(c.suit === data.card.suit && c.value === data.card.value));
        const playEntry = { playerId: socket.id, username: currentPlayer.username, card: data.card };
        table.cardsOnTable.push(playEntry);
        io.to(tableId).emit('display-card', playEntry);

        const playersActiveInPli = table.players.filter(p => p.isInHand && !p.isPassing);
        if (table.cardsOnTable.length === playersActiveInPli.length) {
            determineTrickWinner(tableId, table, data.club_id);
        } else {
            passTurn(tableId);
        }
    });

    // --- 4. LOGIQUE INTERNE ---
    function passTurn(tableId) {
        const table = tables[tableId];
        const activePlayersStillPlaying = table.players.filter(p => p.isInHand && !p.isPassing && p.hand.length > 0);
        
        if (activePlayersStillPlaying.length === 0) {
            checkFinalReveal(tableId, null, null, false, table.clubId);
            return;
        }

        let nextIdx = (table.turnIndex - 1 + table.players.length) % table.players.length;
        while (!table.players[nextIdx].isInHand || table.players[nextIdx].isPassing || table.players[nextIdx].hand.length === 0) {
            nextIdx = (nextIdx - 1 + table.players.length) % table.players.length;
        }
        table.turnIndex = nextIdx;
        io.to(tableId).emit('next-turn', { activePlayerId: table.players[table.turnIndex].id, activeUsername: table.players[table.turnIndex].username });
    }

    function determineTrickWinner(tableId, table, club_id) {
        if (table.cardsOnTable.length === 0) return;
        const leadingCard = table.cardsOnTable[0].card; 
        let winnerEntry = table.cardsOnTable[0];
        for (let i = 1; i < table.cardsOnTable.length; i++) {
            const challenger = table.cardsOnTable[i];
            if (challenger.card.suit === leadingCard.suit && challenger.card.value > winnerEntry.card.value) {
                winnerEntry = challenger;
            }
        }
        table.turnIndex = table.players.findIndex(p => p.id === winnerEntry.playerId);
        const winnerObj = table.players[table.turnIndex];
        const playersWithCards = table.players.filter(p => p.isInHand && !p.isPassing && p.hand.length > 0);
        
        setTimeout(() => {
            if (playersWithCards.length === 0) {
                checkFinalReveal(tableId, winnerObj, winnerEntry.card, (winnerEntry.card.value === 3), club_id);
            } else {
                table.cardsOnTable = [];
                io.to(tableId).emit('next-turn', { 
                    activePlayerId: winnerObj.id, 
                    activeUsername: winnerObj.username 
                });
            }
        }, 800);
    }

    function checkFinalReveal(tableId, lastWinnerObj, lastCard, isFinalKoratte = false, club_id) {
        const table = tables[tableId];
        if (!table) return;

        const passers = table.players.filter(p => p.isPassing);
        let finalWinner = lastWinnerObj;
        let finalCardVal = lastCard;

        if (passers.length > 0) {
            passers.forEach(p => {
                const bestPassCard = p.passedCards.sort((a,b) => b.value - a.value)[0];
                io.to(tableId).emit('display-card', { 
                    playerId: p.id, 
                    username: p.username, 
                    card: bestPassCard 
                });

                if (finalCardVal && bestPassCard.suit === finalCardVal.suit && bestPassCard.value > finalCardVal.value) {
                    finalWinner = p;
                    finalCardVal = bestPassCard;
                } else if (!finalWinner) {
                    finalWinner = p;
                    finalCardVal = bestPassCard;
                }
            });
        }

        let currentPot = isFinalKoratte ? table.pot * 2 : table.pot;
        let reason = isFinalKoratte ? "KORATTE (3 final)" : "FIN DE MANCHE";

        setTimeout(() => {
            handleGameOver(tableId, finalWinner, currentPot, reason, club_id);
        }, 2500);
    }

    // --- 5. FIN DE PARTIE & CRÉDIT ---
    async function handleGameOver(tableId, winner, pot, reason, club_id) {
        const table = tables[tableId];
        if(!table || !winner) return;

        try {
            const commission = Math.floor(pot * 0.05);
            const netGain = pot - commission;

            await db.query("UPDATE users SET wallet = wallet + ? WHERE username = ?", [netGain, winner.username]);
            await db.query("UPDATE clubs SET balance = balance + ? WHERE id = ?", [commission, club_id]);

            const sqlTx = "INSERT INTO transactions (user_id, club_id, amount, type, description) VALUES ((SELECT id FROM users WHERE username = ?), ?, ?, 'gain', ?)";
            await db.query(sqlTx, [winner.username, club_id, netGain, `Gain ${reason} (Frais: ${commission}F)`]);
            
            const [newBal] = await db.query("SELECT wallet FROM users WHERE username = ?", [winner.username]);
            winner.wallet = newBal[0].wallet;
            io.to(winner.id).emit('wallet-update', { balance: winner.wallet });
            io.to(tableId).emit('player-list-update', table.players);

            logAction(tableId, `VICTOIRE de ${winner.username} (${netGain} FCFA). Club: ${commission} FCFA`, 'victory');

        } catch (err) {
            console.error("Erreur crédit victoire:", err);
        }

        table.status = 'WAITING';
        table.dealerIndex = table.players.findIndex(p => p.id === winner.id);
        
        io.to(tableId).emit('game-over', {
            winnerId: winner.id,
            winnerUsername: winner.username,
            winnerAvatar: winner.avatar,
            potAmount: pot, 
            reason: reason,
            newDealerId: winner.id
        });

        io.to(tableId).emit('update-dealer', { dealerId: winner.id });
    }

    socket.on('claim-special-victory', (data) => {
        const tableId = `club_${data.club_id}`;
        const table = tables[tableId];
        const winner = table?.players.find(p => p.id === socket.id);
        if (!winner || !winner.isInHand) return;
        let finalPot = data.type === 'KORATTE' ? table.pot * 2 : table.pot;
        handleGameOver(tableId, winner, finalPot, data.reason, data.club_id);
    });

    socket.on('stand-up', (data) => handleDeparture(socket, `club_${data.club_id}`));
    socket.on('disconnect', () => { for (let tId in tables) handleDeparture(socket, tId); });

    function handleDeparture(socket, tableId) {
        const table = tables[tableId];
        if (!table) return;
        const pIdx = table.players.findIndex(p => p.id === socket.id);
        if (pIdx !== -1) {
            const wasDealer = (table.dealerIndex === pIdx);
            table.players.splice(pIdx, 1);
            if (table.players.length === 0) {
                delete tables[tableId];
                return;
            }
            if (wasDealer) {
                table.dealerIndex = (pIdx) % table.players.length;
                const newDealer = table.players[table.dealerIndex];
                if(newDealer) io.to(tableId).emit('update-dealer', { dealerId: newDealer.id });
            }
            io.to(tableId).emit('player-list-update', table.players);
        }
    }
});

// --- Lignes ajoutées pour le déploiement sur Render/Cloud ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur Fap Fap 2026 en ligne sur le port ${PORT}`);
});