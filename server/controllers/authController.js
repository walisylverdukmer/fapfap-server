const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 1. CRÉATION KATIKA + CLUB (Action de Wali) ---
exports.registerKatika = async (req, res) => {
    try {
        const { username, phone, password, clubName } = req.body;

        if (!username || !phone || !password || !clubName) {
            return res.status(400).json({ msg: "Veuillez remplir tous les champs (Nom, Tel, Pass, Club)." });
        }

        const [existing] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ msg: "Ce numéro de téléphone est déjà utilisé." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        console.log("--- Début du recrutement ---");

        // ÉTAPE A : Création de l'utilisateur Katika
        const [userResult] = await db.query(
            "INSERT INTO users (username, phone, password, role, wallet) VALUES (?, ?, ?, 'katika', 0)",
            [username, phone, hashedPassword]
        );
        const katikaId = userResult.insertId;

        // ÉTAPE B : Création du Club
        const [clubResult] = await db.query(
            "INSERT INTO clubs (name, katika_id) VALUES (?, ?)",
            [clubName, katikaId]
        );
        const clubId = clubResult.insertId;

        // ÉTAPE C : Liaison finale
        await db.query("UPDATE users SET club_id = ? WHERE id = ?", [clubId, katikaId]);
        
        console.log(`Katika et Club "${clubName}" créés avec succès.`);

        res.status(201).json({ 
            msg: `Succès : Katika ${username} recruté et Club "${clubName}" créé !`,
            katikaId: katikaId,
            clubId: clubId
        });

    } catch (error) {
        console.error("ERREUR CRÉATION KATIKA:", error);
        res.status(500).json({ 
            msg: "Erreur lors du recrutement.", 
            detail: error.sqlMessage || error.message 
        });
    }
};

// --- 2. CRÉATION JOUEUR (Action libre ou via Katika) ---
exports.registerPlayer = async (req, res) => {
    try {
        const { username, phone, password, wallet, club_id } = req.body;

        // Note: club_id est ici optionnel pour permettre aux joueurs d'être "libres"
        if (!username || !phone || !password) {
            return res.status(400).json({ msg: "Données incomplètes (Nom, Tel, Pass requis)." });
        }

        const [existing] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ msg: "Ce numéro est déjà utilisé." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // On insère le joueur. Si club_id n'est pas fourni, il sera NULL par défaut en BD
        await db.query(
            "INSERT INTO users (username, phone, password, role, wallet, club_id) VALUES (?, ?, ?, 'player', ?, ?)",
            [username, phone, hashedPassword, wallet || 0, club_id || null]
        );

        res.status(201).json({ msg: `Joueur ${username} enregistré avec succès !` });

    } catch (error) {
        console.error("ERREUR CRÉATION JOUEUR:", error);
        res.status(500).json({ error: "Erreur lors de l'inscription." });
    }
};

// --- 3. LOGIQUE DE CONNEXION GÉNÉRALE ---
exports.login = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ msg: "Téléphone et mot de passe requis." });
        }

        const [users] = await db.query("SELECT * FROM users WHERE phone = ?", [phone]);
        
        if (users.length === 0) {
            return res.status(400).json({ msg: "Identifiants incorrects." });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Identifiants incorrects." });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, club_id: user.club_id },
            process.env.JWT_SECRET || 'votre_secret_fap_fap_2026',
            { expiresIn: '24h' }
        );

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                phone: user.phone,
                wallet: user.wallet,
                club_id: user.club_id 
            } 
        });

    } catch (error) {
        console.error("ERREUR LOGIN:", error);
        res.status(500).json({ error: "Erreur serveur lors de la connexion." });
    }
};

// --- 4. RÉCUPÉRER TOUS LES JOUEURS (Lobby Global) ---
exports.getAllPlayers = async (req, res) => {
    try {
        // Cette requête permet à tout le monde de voir tous les joueurs
        // Idéal pour ton salon commun
        const [players] = await db.query(
            "SELECT id, username, phone, wallet, role, club_id FROM users WHERE role = 'player'"
        );
        res.json(players);
    } catch (error) {
        console.error("ERREUR RÉCUPÉRATION JOUEURS:", error);
        res.status(500).json({ error: "Impossible de charger la liste des joueurs." });
    }
};