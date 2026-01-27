// club.js - Gestion administrative du Club
const user = JSON.parse(localStorage.getItem('user'));

if (!user || !user.club_id) {
    window.location.href = 'index.html';
}

// 1. Charger les joueurs existants au démarrage
document.addEventListener('DOMContentLoaded', () => {
    loadPlayers();
});

async function loadPlayers() {
    try {
        const response = await fetch(`/api/players/${user.club_id}`);
        const players = await response.json();
        
        const tbody = document.getElementById('playerTableBody');
        tbody.innerHTML = ''; // Vide le tableau avant de remplir

        players.forEach(player => {
            appendPlayerToTable(player);
        });
    } catch (err) {
        console.error("Erreur chargement joueurs:", err);
    }
}

// 2. Créer un joueur et l'enregistrer en BDD
async function createPlayer() {
    const name = document.getElementById('p_name').value;
    const phone = document.getElementById('p_phone').value;

    if(!name || !phone) return alert("Remplis les champs !");

    try {
        const response = await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                phone: phone,
                club_id: user.club_id
            })
        });

        const result = await response.json();

        if (response.ok) {
            appendPlayerToTable(result.player);
            // Vide les champs
            document.getElementById('p_name').value = '';
            document.getElementById('p_phone').value = '';
        } else {
            alert(result.message || "Erreur lors de la création");
        }
    } catch (err) {
        alert("Le serveur ne répond pas.");
    }
}

// 3. Fonction utilitaire pour ajouter une ligne au tableau
function appendPlayerToTable(player) {
    const tbody = document.getElementById('playerTableBody');
    tbody.innerHTML += `
        <tr>
            <td><b>${player.username}</b></td>
            <td style="color: #2ecc71; font-weight: bold;">${player.wallet.toLocaleString()} FCFA</td>
            <td>
                <button class="btn-action btn-stand" onclick="recharger('${player.username}')">RECHARGER</button>
            </td>
        </tr>
    `;
}

// 4. Fonction de recharge (Appel API)
async function recharger(username) {
    const montant = prompt(`Montant à ajouter pour ${username} :`);
    if (!montant || isNaN(montant)) return;

    try {
        const response = await fetch('/api/wallet/recharge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                amount: parseInt(montant),
                club_id: user.club_id
            })
        });

        if (response.ok) {
            alert("Compte crédité !");
            loadPlayers(); // Rafraîchit la liste pour voir le nouveau solde
        }
    } catch (err) {
        alert("Erreur de connexion au serveur.");
    }
}