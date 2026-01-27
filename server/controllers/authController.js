const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 1. CRÉATION KATIKA + CLUB (Action de Wali) ---
exports.registerKatika = async (req, res) => {
    try {
        const { username, phone, password, clubName } = req.body;

        // Validation des champs
        if (!username || !phone || !password || !clubName) {
            return res.status(400).json({ msg: "Veuillez remplir tous les champs (Nom, Tel, Pass, Club)." });
        }

        // Vérification doublon téléphone
        const [existing] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ msg: "Ce numéro de téléphone est déjà utilisé." });
        }

        // Hachage du mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        console.log("--- Début du recrutement ---");

        // ÉTAPE A : Création de l'utilisateur Katika
        const [userResult] = await db.query(
            "INSERT INTO users (username, phone, password, role, wallet) VALUES (?, ?, ?, 'katika', 0)",
            [username, phone, hashedPassword]
        );
        const katikaId = userResult.insertId;
        console.log(`Utilisateur créé avec l'ID: ${katikaId}`);

        // ÉTAPE B : Création du Club (Utilise la colonne katika_id que tu viens d'ajouter)
        const [clubResult] = await db.query(
            "INSERT INTO clubs (name, katika_id) VALUES (?, ?)",
            [clubName, katikaId]
        );
        const clubId = clubResult.insertId;
        console.log(`Club "${clubName}" créé avec l'ID: ${clubId}`);

        // ÉTAPE C : Liaison finale (Mise à jour du club_id dans la table users)
        await db.query("UPDATE users SET club_id = ? WHERE id = ?", [clubId, katikaId]);
        console.log("Liaison User <-> Club terminée.");

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

// --- 2. CRÉATION JOUEUR (Action du Katika ou de Wali) ---
exports.registerPlayer = async (req, res) => {
    try {
        const { username, phone, password, wallet, club_id } = req.body;

        if (!username || !phone || !password || !club_id) {
            return res.status(400).json({ msg: "Données incomplètes pour le joueur." });
        }

        const [existing] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ msg: "Ce numéro est déjà utilisé par un joueur." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.query(
            "INSERT INTO users (username, phone, password, role, wallet, club_id) VALUES (?, ?, ?, 'player', ?, ?)",
            [username, phone, hashedPassword, wallet || 0, club_id]
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

        // Génération du Token avec les infos essentielles
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