const socket = io('http://localhost:5000');

// --- INITIALISATION UTILISATEUR ---
const user = JSON.parse(localStorage.getItem('user')) || { 
    username: "Joueur_" + Math.floor(Math.random()*100), 
    club_id: 1, 
    stake: 500 
};

// --- VARIABLES GLOBALES ---
let myHand = [];
let isMyTurn = false;
let playerMap = {}; 
let hasFolded = false; 
let cardsPlayedInRound = 0; 
let totalCardsOnTable = 0; 
let currentDealerId = null; 
let turnCountdown = null; 

// --- SYSTÈME AUDIO ---
const sounds = {
    deal: new Audio('assets/sounds/deal.mp3'),
    play: new Audio('assets/sounds/play.mp3'),
    turn: new Audio('assets/sounds/turn.mp3'),
    win: new Audio('assets/sounds/win.mp3')
};

function playSound(name) {
    if (sounds[name]) {
        sounds[name].currentTime = 0;
        sounds[name].play().catch(e => console.warn("Audio bloqué :", e));
    }
}

// --- 1. CONNEXION INITIALE ET RECONNEXION ---
function initConnection() {
    const savedClubId = localStorage.getItem('active_club');
    const clubToJoin = savedClubId ? parseInt(savedClubId) : user.club_id;
    
    console.log("Connexion au club ID:", clubToJoin);
    socket.emit('join-table', { 
        club_id: clubToJoin, 
        username: user.username, 
        stake: user.stake 
    });
}

initConnection();

// --- LOGIQUE DU TIMER CYCLIQUE (15 SECONDES) ---
function startTurnTimer(slotNum) {
    clearInterval(turnCountdown);
    
    const duration = 15;
    let timeLeft = duration;
    const fullCircle = 239; 
    
    document.querySelectorAll('.timer-bar').forEach(bar => {
        bar.style.transition = 'none';
        bar.style.strokeDashoffset = fullCircle;
    });
    
    const activeBar = document.getElementById(`timer-bar-${slotNum}`);
    if (!activeBar) return;

    void activeBar.offsetWidth; 
    activeBar.style.transition = 'stroke-dashoffset 1s linear';
    activeBar.style.strokeDashoffset = "0";

    turnCountdown = setInterval(() => {
        timeLeft--;
        const offset = fullCircle - (timeLeft / duration) * fullCircle;
        activeBar.style.strokeDashoffset = offset;
        
        if (timeLeft <= 0) {
            clearInterval(turnCountdown);
            console.log("⏳ Temps expiré pour le slot:", slotNum);
        }
    }, 1000);
}

// --- GESTION DU SOLDE (WALLET) ---
socket.on('wallet-update', (data) => {
    const walletEl = document.getElementById('my-wallet-amount');
    if(walletEl) {
        walletEl.innerText = data.balance + " FCFA";
        walletEl.style.color = "#27ae60"; 
        setTimeout(() => { walletEl.style.color = "white"; }, 1000);
    }
});

// --- 2. GESTION DU CHAT ---
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (message !== "") {
        socket.emit('send-chat', {
            club_id: user.club_id,
            username: user.username,
            message: message
        });
        input.value = "";
    }
}

document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

socket.on('receive-chat', (data) => {
    const chatBox = document.getElementById('chat-messages');
    if(!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = "8px";
    msgDiv.innerHTML = `<small style="color:#888">${data.time}</small> <strong>${data.username}:</strong> ${data.message}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// --- 3. GESTION DE L'HISTORIQUE ---
socket.on('history-update', (data) => {
    const historyBox = document.getElementById('history-list');
    if(!historyBox) return;
    const logDiv = document.createElement('div');
    logDiv.style.padding = "5px 0";
    logDiv.style.borderBottom = "1px solid #eee";
    logDiv.style.fontSize = "0.85rem";
    
    let color = "#333";
    if(data.type === 'victory') color = "#27ae60"; 
    if(data.type === 'warning') color = "#c0392b"; 
    if(data.type === 'system') color = "#f39c12";

    logDiv.innerHTML = `<span style="color:#999">[${data.time}]</span> <span style="color:${color}">${data.message}</span>`;
    historyBox.prepend(logDiv); 
});

// --- 4. MISE À JOUR INTERFACE JOUEURS & DEALER ---
socket.on('player-list-update', (players) => {
    for(let i=1; i<=4; i++) {
        const isMeSlot = (i === 1);
        const nameEl = document.getElementById(isMeSlot ? 'my-name' : `n-${i}`);
        const avatarEl = document.getElementById(isMeSlot ? 'my-avatar' : `av-${i}`);
        const balEl = document.getElementById(isMeSlot ? 'my-wallet-amount' : `bal-${i}`);
        
        if(nameEl) nameEl.innerText = "Vide";
        if(avatarEl) avatarEl.innerHTML = `<button class="btn-sit" onclick="sitDown()">S'ASSEOIR</button>`;
        if(balEl && !isMeSlot) balEl.innerText = ""; 
    }

    playerMap = {};
    const me = players.find(p => p.username === user.username);
    
    if (me) {
        localStorage.setItem('active_club', user.club_id);
        playerMap[socket.id] = 1;
        document.getElementById('my-name').innerText = me.username;
        document.getElementById('my-avatar').innerHTML = `<img src="${me.avatar}" style="width:100%">`;
        
        const myWalletEl = document.getElementById('my-wallet-amount');
        if(myWalletEl) {
            myWalletEl.innerText = (me.wallet || 0) + " FCFA";
        }

        if(!document.getElementById('btn-refresh-wallet')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'btn-refresh-wallet';
            refreshBtn.innerHTML = "🔄";
            refreshBtn.style = "position:absolute; bottom:0; right:0; background:#3498db; border:none; color:white; border-radius:50%; width:25px; height:25px; cursor:pointer; z-index:20; font-size:12px;";
            refreshBtn.onclick = () => socket.emit('refresh-wallet', { username: user.username, club_id: user.club_id });
            document.getElementById('my-avatar').style.position = 'relative';
            document.getElementById('my-avatar').appendChild(refreshBtn);
        }
    }

    let otherSlots = [2, 3, 4];
    let slotIdx = 0;
    players.forEach(p => {
        if (p.username !== user.username && slotIdx < otherSlots.length) {
            const currentSlot = otherSlots[slotIdx];
            playerMap[p.id] = currentSlot;
            document.getElementById(`n-${currentSlot}`).innerText = p.username;
            document.getElementById(`av-${currentSlot}`).innerHTML = `<img src="${p.avatar}" style="width:100%">`;
            const balDiv = document.getElementById(`bal-${currentSlot}`);
            if(balDiv) balDiv.innerText = (p.wallet || 0) + " FCFA";
            slotIdx++;
        }
    });

    updateDealerUI();
});

socket.on('update-dealer', (data) => {
    currentDealerId = data.dealerId;
    updateDealerUI();
});

function updateDealerUI() {
    document.querySelectorAll('.dealer-badge').forEach(b => b.remove());
    const distribBtn = document.getElementById('distribBtn');
    const playerCount = Object.keys(playerMap).length;

    // Le bouton s'affiche si c'est mon tour de distribuer ET qu'aucune manche n'est en cours
    if(distribBtn) {
        if (currentDealerId === socket.id && playerCount >= 2 && myHand.length === 0) {
            distribBtn.style.display = 'block';
            distribBtn.innerText = "DISTRIBUER";
        } else {
            distribBtn.style.display = 'none';
        }
    }

    const dealerSlot = playerMap[currentDealerId];
    if(dealerSlot) {
        const avatarEl = document.getElementById(dealerSlot === 1 ? 'my-avatar' : `av-${dealerSlot}`);
        if(avatarEl) {
            const badge = document.createElement('div');
            badge.className = 'dealer-badge';
            badge.innerHTML = '🎴';
            avatarEl.style.position = 'relative';
            avatarEl.appendChild(badge);
        }
    }
}

// --- 5. LOGIQUE DES BOUTONS D'ACTION ---
function updateActionPanel() {
    const actionContainer = document.getElementById('special-actions');
    if(!actionContainer) return;
    actionContainer.style.bottom = isMyTurn ? "20px" : "-110px"; 
    actionContainer.innerHTML = ''; 

    if (myHand.length > 0 && !hasFolded && cardsPlayedInRound < 2) {
        const bankBtn = document.createElement('button');
        bankBtn.className = 'btn-special';
        bankBtn.style.background = "#c0392b";
        bankBtn.innerText = "🏦 BANQUE";
        bankBtn.onclick = () => {
            if(confirm("Confirmer la BANQUE ?")) {
                socket.emit('fold-hand', { club_id: user.club_id });
            }
        };
        actionContainer.appendChild(bankBtn);
    }

    if (myHand.length === 5 && !hasFolded) {
        const values = myHand.map(c => parseInt(c.value));
        const suits = myHand.map(c => c.suit);
        const totalPoints = values.reduce((a, b) => a + b, 0);
        const counts = {};
        values.forEach(v => counts[v] = (counts[v] || 0) + 1);
        
        if (Object.values(counts).some(count => count >= 4)) createBonusButton("CARRÉ !", "CARRE");
        if (totalPoints <= 21) createBonusButton(`TCHIA (${totalPoints})`, "TCHIA");
        if (values.filter(v => v === 7).length >= 3) createBonusButton("3 SEPT", "3 SEPT");
        
        if (suits.every(s => s === suits[0])) {
            const hasThree = values.includes(3);
            if (hasThree) createBonusButton("KORATTE (X2) !", "KORATTE");
            else createBonusButton("COULEUR !", "COULEUR");
        }
    }
}

function createBonusButton(label, type) {
    const container = document.getElementById('special-actions');
    const btn = document.createElement('button');
    btn.className = 'btn-special';
    btn.innerText = label;
    btn.onclick = () => {
        socket.emit('claim-special-victory', { club_id: user.club_id, type: type, reason: label });
    };
    container.appendChild(btn);
}

// --- 6. DÉROULEMENT DU JEU ---
socket.on('game-started', (data) => {
    clearBoard(); 
    currentDealerId = data.dealerId;
    document.getElementById('total-pot').innerText = data.pot + " FCFA";
    document.getElementById('distribBtn').style.display = 'none';
    document.getElementById('status-msg').innerText = "La partie commence !";
    hasFolded = false; 
    cardsPlayedInRound = 0; 
    totalCardsOnTable = 0; 
    closeWinnerModal();
    updateDealerUI();
});

socket.on('receive-cards', (data) => {
    playSound('deal');
    myHand = data.hand;
    isMyTurn = data.turn;
    hasFolded = false; 
    cardsPlayedInRound = 0;
    totalCardsOnTable = 0; 
    renderHand();
    updateActionPanel(); 
    updateTurnUI(data.turn ? socket.id : null);
    if(data.turn) playSound('turn');
    updateDealerUI();
});

function renderHand() {
    const handDiv = document.getElementById('my-hand');
    if(!handDiv) return;
    handDiv.innerHTML = '';
    myHand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        const icons = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
        const isRed = (card.suit === 'heart' || card.suit === 'diamond');
        cardEl.className = `card-img ${isRed ? 'red' : ''} ${hasFolded ? 'folded' : ''}`;
        cardEl.innerHTML = `<span>${card.value}</span><span>${icons[card.suit]}</span>`;
        cardEl.onclick = () => {
            if(!hasFolded && isMyTurn) playCard(index);
        };
        handDiv.appendChild(cardEl);
    });
}

function playCard(index) {
    playSound('play');
    const card = myHand[index];
    socket.emit('card-played', { club_id: user.club_id, card: card });
    myHand.splice(index, 1);
    isMyTurn = false;
    clearInterval(turnCountdown); 
    renderHand();
    updateActionPanel();
}

socket.on('display-card', (data) => {
    if(data.playerId !== socket.id) playSound('play');
    const slotNum = playerMap[data.playerId];
    if (!slotNum) return;
    
    cardsPlayedInRound++;
    totalCardsOnTable++; 

    const targetZone = document.getElementById(`pz-${slotNum}`);
    const icons = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
    const isRed = (data.card.suit === 'heart' || data.card.suit === 'diamond');
    
    // NOUVELLE STRUCTURE : Wrapper + Badge au-dessus
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'card-wrapper';
    cardWrapper.style.position = 'relative';
    cardWrapper.style.display = 'inline-block';
    cardWrapper.style.margin = '5px';

    const orderBadge = document.createElement('div');
    orderBadge.className = 'card-order-badge';
    orderBadge.innerText = totalCardsOnTable;
    // Style inline si non présent dans CSS
    orderBadge.style = "position:absolute; top:-15px; left:50%; transform:translateX(-50%); background:#d4af37; color:black; border-radius:50%; width:20px; height:20px; font-size:12px; font-weight:bold; display:flex; align-items:center; justify-content:center; z-index:10; border:1px solid #000;";

    const cardOnTable = document.createElement('div');
    cardOnTable.className = `card-on-table ${isRed ? 'red' : ''}`;
    cardOnTable.innerHTML = `<span>${data.card.value}</span><span>${icons[data.card.suit]}</span>`;
    
    cardWrapper.appendChild(orderBadge);
    cardWrapper.appendChild(cardOnTable);
    
    if(targetZone) targetZone.appendChild(cardWrapper);
    
    if (slotNum > 1) {
        const hDiv = document.getElementById(`h-${slotNum}`);
        if(hDiv && hDiv.lastChild) hDiv.removeChild(hDiv.lastChild);
    }
    updateActionPanel();
});

socket.on('player-folded', (data) => {
    showAnnouncement(`${data.username} BANQUE`, 2000);
    if(data.id === socket.id) {
        hasFolded = true; myHand = [];
        renderHand(); updateActionPanel();
    }
});

socket.on('next-turn', (data) => {
    isMyTurn = (socket.id === data.activePlayerId);
    if(isMyTurn) playSound('turn');
    document.getElementById('status-msg').innerText = isMyTurn ? "À VOUS !" : `Tour de ${data.activeUsername}`;
    updateTurnUI(data.activePlayerId);
    updateActionPanel();
});

socket.on('game-over', (data) => {
    playSound('win');
    clearInterval(turnCountdown);
    
    const winnerSlot = playerMap[data.winnerId];
    if(winnerSlot) {
        showAnnouncement(`🏆 ${data.winnerUsername} GAGNE !`, 4000);
    }

    // Le gagnant devient le distributeur
    if(data.newDealerId) currentDealerId = data.newDealerId;
    
    myHand = []; 
    hasFolded = false; 
    cardsPlayedInRound = 0;
    totalCardsOnTable = 0;
    
    renderHand();
    // On force la mise à jour pour afficher le bouton Distribuer au nouveau gagnant
    updateDealerUI();
});

// --- 7. UTILITAIRES & ACTIONS JOUEUR ---
function clearBoard() {
    for(let i=1; i<=4; i++) {
        const pz = document.getElementById(`pz-${i}`);
        if(pz) pz.innerHTML = "";
    }
}

function updateTurnUI(activeId) {
    document.querySelectorAll('.player-slot').forEach(s => s.classList.remove('active-turn'));
    const activeSlot = playerMap[activeId];
    if(activeSlot) {
        const slotEl = document.getElementById(`slot-${activeSlot}`);
        if(slotEl) {
            slotEl.classList.add('active-turn');
            startTurnTimer(activeSlot);
        }
    } else {
        clearInterval(turnCountdown);
    }
}

function closeWinnerModal() {
    const modal = document.getElementById('winner-modal');
    if(modal) modal.style.display = 'none';
    updateDealerUI();
    clearBoard();
}

function sitDown() {
    socket.emit('join-table', { club_id: user.club_id, username: user.username, stake: user.stake });
}

function requestDistribute() {
    const btn = document.getElementById('distribBtn');
    if(btn) {
        btn.innerText = "LANCEMENT...";
        btn.style.display = 'none';
    }
    socket.emit('start-game', { club_id: user.club_id, username: user.username });
}

function standUp() {
    socket.emit('stand-up', { club_id: user.club_id });
    myHand = []; hasFolded = false;
    renderHand(); closeWinnerModal();
}

function leaveClub() {
    localStorage.removeItem('active_club');
    socket.emit('stand-up', { club_id: user.club_id });
    window.location.href = "index.html";
}

function showAnnouncement(text, duration = 2000) {
    const el = document.getElementById('announcement');
    if(el) {
        el.innerText = text;
        el.style.opacity = "1";
        setTimeout(() => { el.style.opacity = "0"; }, duration);
    }
}