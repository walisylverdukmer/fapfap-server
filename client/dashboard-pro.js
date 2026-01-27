// ==========================================================
//    DASHBOARD-PRO.JS - Administration Centrale Fap Fap
// ==========================================================

// Vérification de sécurité au chargement
const user = JSON.parse(localStorage.getItem('user'));
const token = localStorage.getItem('token');

if (!user || user.role !== 'superadmin') {
    window.location.replace("index.html");
}

// Initialisation de la page
async function initAdmin() {
    document.getElementById('adminDisplay').innerText = `${user.username} (SuperAdmin)`;
    
    // Charger les données initiales
    loadKatikaList();
    loadStats(); 
}

// --- 0. CHARGER LES STATISTIQUES GLOBALES (Mises et Commissions) ---
async function loadStats() {
    try {
        const response = await fetch('http://localhost:5000/api/money/admin-stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await response.json();

        if (response.ok) {
            // Volume total des mises effectuées sur le réseau
            document.getElementById('statVolume').innerText = `${stats.totalVolume.toLocaleString()} FCFA`;
            // Somme de toutes les balances de clubs (La caisse cumulée)
            document.getElementById('statComms').innerText = `${stats.totalCommissions.toLocaleString()} FCFA`;
        }
    } catch (error) {
        console.error("Erreur stats:", error);
    }
}

// --- 1. GESTION DU RECRUTEMENT (KATIKA + CLUB) ---
document.getElementById('addKatikaFormPro').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        username: document.getElementById('k_name').value,
        phone: document.getElementById('k_phone').value,
        password: document.getElementById('k_pass').value,
        clubName: document.getElementById('k_club').value
    };

    try {
        const response = await fetch('http://localhost:5000/api/auth/register-katika', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ Recrutement réussi : " + result.msg);
            document.getElementById('addKatikaFormPro').reset();
            loadKatikaList(); 
            loadStats();
        } else {
            alert("❌ Erreur : " + result.msg);
        }
    } catch (error) {
        console.error("Erreur réseau:", error);
    }
});

// --- 2. AFFICHAGE DES KATIKAS ET CONTRÔLE DES CLUBS ---
async function loadKatikaList() {
    const tableBody = document.getElementById('katikaTableBody');
    
    try {
        const response = await fetch('http://localhost:5000/api/money/all-katikas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const katikas = await response.json();

        if (!katikas || katikas.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#555; padding:20px;">Aucun Katika recruté.</td></tr>`;
            return;
        }

        tableBody.innerHTML = katikas.map(k => {
            const statusColor = k.is_active ? '#4caf50' : '#f44336';
            const statusLabel = k.is_active ? 'ACTIF' : 'SUSPENDU';
            
            return `
            <tr>
                <td>
                    <div style="font-weight:bold; color:white;">${k.username}</div>
                    <div style="font-size:0.75rem; color:#666;">📞 ${k.phone}</div>
                </td>
                <td>
                    <span class="badge-katika">${k.club_name || 'Sans Club'}</span>
                    <div style="font-size:0.65rem; color:#888; margin-top:4px;">ID Club: ${k.club_id}</div>
                </td>
                <td>
                    <div style="color:var(--pro-gold); font-weight:bold; font-size:0.9rem;">
                        Perso: ${k.wallet.toLocaleString()} F
                    </div>
                    <div style="color:#4caf50; font-size:0.8rem; margin-top:4px;">
                        Caisse Club: ${(k.club_balance || 0).toLocaleString()} F
                    </div>
                </td>
                <td>
                    <div style="color:${statusColor}; font-size:0.8rem; font-weight:bold;">● ${statusLabel}</div>
                    <div style="font-size:0.7rem; color:#aaa;">Exp: ${new Date(k.expiry_date).toLocaleDateString()}</div>
                </td>
                <td style="display:flex; gap:8px;">
                    <button onclick="rechargeKatika(${k.id}, '${k.username}')" style="background:#222; border:1px solid var(--pro-gold); color:var(--pro-gold); padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.7rem;">
                        💰 DOTER
                    </button>
                    <button onclick="toggleClubStatus(${k.club_id}, ${k.is_active})" style="background:#111; border:1px solid #444; color:#fff; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.7rem;">
                        ${k.is_active ? '🚫 BLOQUER' : '✅ ACTIVER'}
                    </button>
                </td>
            </tr>
        `}).join('');

        document.getElementById('statClubs').innerText = katikas.length;

    } catch (error) {
        console.error("Erreur chargement liste:", error);
        tableBody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Erreur serveur.</td></tr>`;
    }
}

// --- 3. ACTIONS DE DOTATION ET GESTION ---

// Fonction pour déclencher la dotation
function rechargeKatika(id, name) {
    const amount = prompt(`Montant de la dotation SuperAdmin pour ${name} (FCFA) :`);
    if (amount && !isNaN(amount) && amount > 0) {
        transferToKatika(id, amount);
    }
}

// Appel API pour le transfert SuperAdmin -> Katika
async function transferToKatika(id, amount) {
    try {
        const response = await fetch('http://localhost:5000/api/money/transfer-admin', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ receiver_id: id, amount: parseInt(amount) })
        });

        if (response.ok) {
            alert("✅ Dotation effectuée avec succès !");
            loadKatikaList();
            loadStats();
        } else {
            const err = await response.json();
            alert("❌ Échec : " + err.msg);
        }
    } catch (error) {
        alert("Erreur réseau lors de la dotation.");
    }
}

// Fonction pour activer/désactiver un club (Sécurité Licence)
async function toggleClubStatus(clubId, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    const confirmMsg = newStatus ? "Activer ce club ?" : "Suspendre ce club et bloquer les parties ?";
    
    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch(`http://localhost:5000/api/money/toggle-club/${clubId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ is_active: newStatus })
        });

        if (response.ok) {
            loadKatikaList();
        } else {
            alert("Erreur lors de la modification du statut.");
        }
    } catch (error) {
        console.error("Erreur réseau toggle:", error);
    }
}

// Déconnexion
function logout() {
    localStorage.clear();
    window.location.replace("index.html");
}

// Lancement automatique
initAdmin();