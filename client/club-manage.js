// club-manage.js - Gestion Katika & Caisse
const user = JSON.parse(localStorage.getItem('user'));
const token = localStorage.getItem('token');
const API_BASE = 'https://fap-fap-api.onrender.com'; 

// Sécurité : Redirection si non connecté ou rôle inapproprié
if (!user || (user.role !== 'katika' && user.role !== 'superadmin')) {
    window.location.replace("index.html");
}

/**
 * INITIALISATION
 */
async function initClub() {
    const displayElem = document.getElementById('userDisplay');
    if(displayElem) {
        // Affiche le pseudo et le wallet actuel du LocalStorage
        displayElem.innerText = `${user.username} (${user.role.toUpperCase()}) | Wallet: ${Number(user.wallet || 0).toLocaleString()} FCFA`;
    }
    
    const adminLink = document.getElementById('link-admin');
    if (user.role === 'superadmin' && adminLink) {
        adminLink.style.display = 'block';
    }

    loadClubPlayers();
    loadClubCaisse();

    // Gestion de l'ajout de joueur
    const addForm = document.getElementById('addPlayerForm');
    if (addForm && !addForm.dataset.listenerAdded) {
        addForm.dataset.listenerAdded = "true"; // Évite les doubles écoutes
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                username: document.getElementById('p_username').value,
                phone: document.getElementById('p_phone').value,
                password: document.getElementById('p_password').value,
                wallet: document.getElementById('p_wallet').value || 0,
                club_id: user.club_id,
                role: 'player'
            };

            try {
                const response = await fetch(`${API_BASE}/api/auth/register-player`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    alert("✅ Joueur inscrit avec succès !");
                    loadClubPlayers();
                    addForm.reset();
                } else {
                    alert("❌ Erreur : " + result.msg);
                }
            } catch (error) {
                alert("Le serveur ne répond pas.");
            }
        });
    }
}

/**
 * GESTION DE LA CAISSE DU CLUB (COMMISSIONS 5%)
 */
async function loadClubCaisse() {
    const caisseAmountEl = document.getElementById('caisse-amount');
    const btnCollect = document.getElementById('btn-collect');
    
    if (!caisseAmountEl || !user.club_id) return;

    try {
        const response = await fetch(`${API_BASE}/api/money/club-caisse/${user.club_id}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();

        if (response.ok) {
            caisseAmountEl.innerText = Number(data.caisse).toLocaleString();
            
            if (btnCollect) {
                btnCollect.disabled = data.caisse <= 0;
                btnCollect.style.opacity = data.caisse > 0 ? "1" : "0.5";
            }
        }
    } catch (error) {
        console.error("Erreur chargement caisse:", error);
    }
}

async function collectCaisse() {
    if (!confirm("Voulez-vous transférer les gains de la caisse vers votre compte personnel ?")) return;

    const btnCollect = document.getElementById('btn-collect');
    if(!btnCollect) return;

    btnCollect.innerText = "⏳ Transfert en cours...";
    btnCollect.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/money/collect-caisse`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ club_id: user.club_id })
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.msg);
            
            // --- MISE À JOUR DU SOLDE ---
            // On refait un petit fetch pour avoir le solde exact du Katika après la récolte
            const balRes = await fetch(`${API_BASE}/api/money/balance`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const balData = await balRes.json();
            
            if (balData.wallet !== undefined) {
                user.wallet = balData.wallet;
                localStorage.setItem('user', JSON.stringify(user));
            }

            loadClubCaisse(); // Remet l'affichage caisse à 0
            initClub(); // Rafraîchit l'affichage du solde en haut
        } else {
            alert("❌ Erreur : " + result.msg);
        }
    } catch (error) {
        console.error("Erreur récolte front:", error);
        alert("Erreur réseau lors de la récolte.");
    } finally {
        if(btnCollect) btnCollect.innerText = "💸 RÉCOLTER LES GAINS";
    }
}

/**
 * GESTION DES JOUEURS
 */
async function loadClubPlayers() {
    const container = document.getElementById('playerListContainer') || document.getElementById('playersTableBody');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/api/money/club-players/${user.club_id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const players = await response.json();

        if (players.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#888; padding:20px;">Aucun joueur trouvé.</div>`;
            return;
        }

        container.innerHTML = players.map(p => `
            <div class="player-card" style="background:#1a1a1a; padding:15px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #333;">
                <div class="player-info">
                    <strong style="color:white; display:block;">${p.username}</strong>
                    <span style="font-size:0.8rem; color:#888;">📞 ${p.phone || 'N/A'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="balance-badge" style="background:rgba(212,175,55,0.1); color:#d4af37; padding:5px 10px; border-radius:5px; font-weight:bold;">
                        ${Number(p.wallet).toLocaleString()} FCFA
                    </div>
                    <button onclick="manageBalance(${p.id}, '${p.username}')" style="background:#d4af37; border:none; padding:8px 12px; border-radius:4px; color:black; font-weight:bold; cursor:pointer;">
                        💰 DOTER
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<div style="color:red; text-align:center; padding:20px;">❌ Erreur serveur.</div>`;
    }
}

async function manageBalance(playerId, playerName) {
    const amount = prompt(`Montant à envoyer à ${playerName} (FCFA) :`);
    
    if (amount && !isNaN(amount) && amount > 0) {
        try {
            const response = await fetch(`${API_BASE}/api/money/transfer`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    receiver_id: playerId, 
                    amount: parseInt(amount) 
                })
            });

            const result = await response.json();

            if (response.ok) {
                alert(`✅ Transfert réussi !`);
                
                // On met à jour le wallet local de l'admin
                user.wallet = (user.wallet || 0) - parseInt(amount);
                localStorage.setItem('user', JSON.stringify(user));
                
                loadClubPlayers(); 
                initClub();
            } else {
                alert("❌ Erreur : " + result.msg);
            }
        } catch (error) {
            alert("Erreur lors de la transaction.");
        }
    }
}

function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}

// Lancement
initClub();