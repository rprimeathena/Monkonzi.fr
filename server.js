require('dotenv').config();
const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/webhook'));
app.use('/api', require('./routes/api'));

// Fallback vers l'interface
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialiser la DB et démarrer le serveur
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  WA Prospect - Bot WhatsApp`);
    console.log(`  Interface: http://localhost:${PORT}`);
    console.log(`  Webhook:   http://localhost:${PORT}/webhook`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Erreur initialisation DB:', err);
  process.exit(1);
});
