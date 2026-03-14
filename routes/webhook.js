const express = require('express');
const router = express.Router();
const { pool, getConfig } = require('../db/database');

// Vérification du webhook par Meta (GET)
router.get('/webhook', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = await getConfig('webhook_verify_token') || process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook vérifié avec succès');
      return res.status(200).send(challenge);
    }

    console.log('❌ Échec de la vérification du webhook');
    return res.sendStatus(403);
  } catch (err) {
    console.error('Erreur vérification webhook:', err);
    res.sendStatus(500);
  }
});

// Réception des messages et statuts (POST)
router.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;

        // Messages reçus
        if (value.messages) {
          for (const message of value.messages) {
            const from = message.from;
            const text = message.text?.body || '[media]';
            const msgId = message.id;

            console.log(`📩 Message reçu de ${from}: ${text}`);

            // Sauvegarder le contact s'il n'existe pas
            await pool.query(
              'INSERT INTO contacts (phone, name) VALUES ($1, $2) ON CONFLICT(phone) DO NOTHING',
              [from, value.contacts?.[0]?.profile?.name || '']
            );

            // Sauvegarder le message
            await pool.query(
              'INSERT INTO messages (contact_phone, direction, content, whatsapp_message_id) VALUES ($1, $2, $3, $4)',
              [from, 'received', text, msgId]
            );
          }
        }

        // Mises à jour de statut des messages envoyés
        if (value.statuses) {
          for (const status of value.statuses) {
            const msgId = status.id;
            const statusValue = status.status; // sent, delivered, read, failed

            await pool.query('UPDATE messages SET status = $1 WHERE whatsapp_message_id = $2', [statusValue, msgId]);

            // Mettre à jour les compteurs de campagne
            if (statusValue === 'delivered') {
              await pool.query(
                `UPDATE campaigns SET delivered_count = delivered_count + 1
                 WHERE id IN (
                   SELECT c.id FROM campaigns c
                   JOIN messages m ON m.template_name IS NOT NULL
                   WHERE m.whatsapp_message_id = $1
                 )`,
                [msgId]
              );
            } else if (statusValue === 'read') {
              await pool.query(
                `UPDATE campaigns SET read_count = read_count + 1
                 WHERE id IN (
                   SELECT c.id FROM campaigns c
                   JOIN messages m ON m.template_name IS NOT NULL
                   WHERE m.whatsapp_message_id = $1
                 )`,
                [msgId]
              );
            } else if (statusValue === 'failed') {
              await pool.query(
                `UPDATE campaigns SET failed_count = failed_count + 1
                 WHERE id IN (
                   SELECT c.id FROM campaigns c
                   JOIN messages m ON m.template_name IS NOT NULL
                   WHERE m.whatsapp_message_id = $1
                 )`,
                [msgId]
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Erreur webhook:', err);
  }

  res.sendStatus(200);
});

module.exports = router;
