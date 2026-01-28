const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 17787, // Utilise le port d'Aiven
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // --- AJOUT INDISPENSABLE POUR AIVEN ---
    ssl: {
        rejectUnauthorized: false
    }
});

// On exporte la version promise pour pouvoir utiliser async/await dans tes controllers
module.exports = pool.promise();