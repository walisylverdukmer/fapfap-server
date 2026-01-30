const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * @route   POST /api/auth/login
 * @desc    Connexion générale (Wali, Katika, ou Joueur)
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/auth/register-katika
 * @desc    Action de Wali Sylver : Créer un gestionnaire (Katika) + son Club
 */
router.post('/register-katika', authController.registerKatika);

/**
 * @route   POST /api/auth/register-player
 * @desc    Action du Katika ou de Wali : Inscrire un joueur
 */
router.post('/register-player', authController.registerPlayer);

/**
 * @route   GET /api/auth/players
 * @desc    Récupérer la liste de TOUS les joueurs (Lobby Global)
 * Utile pour que les joueurs se voient entre eux dès la connexion
 */
router.get('/players', authController.getAllPlayers);

module.exports = router;