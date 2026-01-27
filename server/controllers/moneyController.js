const db = require('../config/db');

// ==========================================
//        RÉCUPÉRATION DES DONNÉES
// ==========================================

// Solde de l'utilisateur connecté
exports.getBalance = async (req, res) => {
    try {
        const [user] = await db.query("SELECT wallet FROM users WHERE id = ?", [req.user.id]);
        if (user.length === 0) return res.status(404).json({ msg: "Utilisateur non trouvé" });
        res.json({ wallet: user[0].wallet });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Liste des Katikas pour Wali (SuperAdmin)
exports.getAllKatikas = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                u.id, 
                u.username, 
                u.phone, 
                u.wallet, 
                c.id as club_id,
                c.name as club_name, 
                c.balance as club_balance,
                c.is_active,
                c.expiry_date
            FROM users u 
            LEFT JOIN clubs c ON u.id = c.katika_id 
            WHERE u.role = 'katika'
            ORDER BY u.username ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Erreur getAllKatikas:", error);
        res.status(500).json({ error: error.message });
    }
};

// Statistiques globales pour le Dashboard Pro (Wali)
exports.getAdminStats = async (req, res) => {
    try {
        const [volume] = await db.query("SELECT SUM(ABS(amount)) as total FROM transactions WHERE type IN ('mise', 'gain')");
        const [comms] = await db.query("SELECT SUM(balance) as total FROM clubs");

        res.json({
            totalVolume: volume[0].total || 0,
            totalCommissions: comms[0].total || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Liste des joueurs pour un club
exports.getClubPlayers = async (req, res) => {
    try {
        const { club_id } = req.params;
        if (!club_id || club_id === 'undefined') return res.json([]); 

        const [players] = await db.query(
            "SELECT id, username, phone, wallet, role FROM users WHERE club_id = ? AND role = 'player' ORDER BY username ASC",
            [club_id]
        );
        res.json(players);
    } catch (error) {
        res.status(500).json({ error: "Erreur récupération joueurs." });
    }
};

// Consulter la caisse accumulée du club
exports.getClubCaisse = async (req, res) => {
    try {
        const { club_id } = req.params;
        const [club] = await db.query("SELECT balance, name FROM clubs WHERE id = ?", [club_id]);
        if (club.length === 0) return res.status(404).json({ msg: "Club non trouvé" });
        res.json({ club_name: club[0].name, caisse: club[0].balance });
    } catch (error) {
        res.status(500).json({ error: "Erreur récupération caisse" });
    }
};

// ==========================================
//          MOUVEMENTS D'ARGENT
// ==========================================

// --- MISE À JOUR : Collecter la caisse vers wallet Katika ---
exports.collectClubCaisse = async (req, res) => {
    const { club_id } = req.body;
    const userId = req.user.id;

    if (!club_id) return res.status(400).json({ msg: "ID du club manquant." });

    try {
        // 1. Vérifier la caisse et l'appartenance du club
        const [club] = await db.query("SELECT balance, katika_id FROM clubs WHERE id = ?", [club_id]);
        
        if (club.length === 0) return res.status(404).json({ msg: "Club non trouvé." });
        
        // Sécurité : Seul le propriétaire (Katika) peut récolter sa caisse
        if (club[0].katika_id !== userId && req.user.role !== 'superadmin') {
            return res.status(403).json({ msg: "Vous n'êtes pas autorisé à récolter cette caisse." });
        }

        const amountToCollect = parseFloat(club[0].balance || 0);

        if (amountToCollect <= 0) {
            return res.status(400).json({ msg: "La caisse est déjà vide." });
        }

        // 2. Exécuter les mises à jour (Vider caisse -> Créditer Wallet)
        await db.query("UPDATE clubs SET balance = 0 WHERE id = ?", [club_id]);
        await db.query("UPDATE users SET wallet = wallet + ? WHERE id = ?", [amountToCollect, userId]);
        
        // 3. Log de la transaction
        await db.query(
            "INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, 'recolte_katika', ?)",
            [userId, amountToCollect, `Récolte caisse Club #${club_id}`]
        );

        res.json({ 
            msg: `Récolte de ${amountToCollect} FCFA réussie !`,
            newBalance: 0 
        });

    } catch (error) {
        console.error("Détail Erreur Collecte:", error);
        res.status(500).json({ error: "Erreur technique lors de la récolte." });
    }
};

// Transfert standard (Katika -> Joueur)
exports.transferFunds = async (req, res) => {
    const { receiver_id, amount } = req.body;
    const sender_id = req.user.id;
    const numAmount = parseFloat(amount);

    if (!numAmount || numAmount <= 0) return res.status(400).json({ msg: "Montant invalide." });

    try {
        const [sender] = await db.query("SELECT wallet FROM users WHERE id = ?", [sender_id]);
        if (!sender[0] || sender[0].wallet < numAmount) return res.status(400).json({ msg: "Solde insuffisant." });

        await db.query("UPDATE users SET wallet = wallet - ? WHERE id = ?", [numAmount, sender_id]);
        await db.query("UPDATE users SET wallet = wallet + ? WHERE id = ?", [numAmount, receiver_id]);
        
        await db.query("INSERT INTO transactions (user_id, amount, type, sender_id, description) VALUES (?, ?, 'transfert', ?, 'Recharge Katika')",
            [receiver_id, numAmount, sender_id]);

        res.json({ msg: "Transfert réussi !" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Transfert Admin (SuperAdmin -> Katika) - Injection de fonds
exports.transferFundsAdmin = async (req, res) => {
    const { receiver_id, amount } = req.body;
    if (req.user.role !== 'superadmin') return res.status(403).json({ msg: "Accès refusé." });

    try {
        const numAmount = parseFloat(amount);
        await db.query("UPDATE users SET wallet = wallet + ? WHERE id = ?", [numAmount, receiver_id]);
        await db.query("INSERT INTO transactions (user_id, amount, type, sender_id, description) VALUES (?, ?, 'dotation_admin', ?, 'Injection Admin')",
            [receiver_id, numAmount, req.user.id]);

        res.json({ msg: "Dotation admin effectuée !" });
    } catch (error) {
        res.status(500).json({ error: "Erreur dotation admin." });
    }
};

// ==========================================
//           GESTION ADMINISTRATIVE
// ==========================================

// Activer / Bloquer un club
exports.toggleClubStatus = async (req, res) => {
    const { club_id } = req.params;
    const { is_active } = req.body;

    if (req.user.role !== 'superadmin') return res.status(403).json({ msg: "Accès refusé." });

    try {
        await db.query("UPDATE clubs SET is_active = ? WHERE id = ?", [is_active, club_id]);
        res.json({ msg: `Club ${is_active ? 'activé' : 'suspendu'} avec succès.` });
    } catch (error) {
        res.status(500).json({ error: "Erreur modification statut club." });
    }
};

exports.requestRecharge = async (req, res) => {
    res.json({ msg: "Demande reçue." });
};