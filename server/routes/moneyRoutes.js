const express = require('express');
const router = express.Router();
const moneyController = require('../controllers/moneyController');
const auth = require('../middleware/authMiddleware');

// ==========================================
//                LECTURE
// ==========================================

// Route pour voir son propre solde (Wallet)
router.get('/balance', auth, moneyController.getBalance);

// Route pour SuperAdmin (Wali) : Voir tous les Katikas
router.get('/all-katikas', auth, moneyController.getAllKatikas);

// Route pour SuperAdmin : Statistiques globales
router.get('/admin-stats', auth, moneyController.getAdminStats);

// Route pour Katika/Wali : Voir les joueurs d'un club
router.get('/club-players/:club_id', auth, moneyController.getClubPlayers);

// Route pour Katika : Voir la caisse de son club
router.get('/club-caisse/:club_id', auth, moneyController.getClubCaisse);


// ==========================================
//           ACTIONS FINANCIÈRES
// ==========================================

// Route de dotation standard (Katika -> Joueur)
router.post('/transfer', auth, moneyController.transferFunds);

// Route de dotation administrative (SuperAdmin -> Katika)
router.post('/transfer-admin', auth, moneyController.transferFundsAdmin);

// Route pour Katika : Récolter la caisse club (C'est ici que l'erreur 500 se produisait)
// On s'assure que seul un 'katika' ou 'superadmin' peut appeler cette route
router.post('/collect-caisse', auth, moneyController.collectClubCaisse);

// Route pour demander une recharge
router.post('/recharge', auth, moneyController.requestRecharge);


// ==========================================
//           GESTION DES CLUBS
// ==========================================

// Route pour SuperAdmin : Activer ou Suspendre un club
router.put('/toggle-club/:club_id', auth, moneyController.toggleClubStatus);


module.exports = router;