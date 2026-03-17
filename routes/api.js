const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { pool, getConfig, setConfig, getAllConfig } = require('../db/database');

const upload = multer({ dest: '/tmp' });

// Détecte automatiquement le séparateur CSV (;  ,  tabulation)
function detectSeparator(filePath) {
  const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
  const counts = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ';';
}

// ============================================
// CONFIGURATION META
// ============================================

// Récupérer la configuration
router.get('/config', async (req, res) => {
  try {
    const config = await getAllConfig();
    // Ne pas renvoyer le token complet pour la sécurité
    if (config.access_token) {
      config.access_token_preview = config.access_token.substring(0, 20) + '...';
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sauvegarder la configuration
router.post('/config', async (req, res) => {
  try {
    const { access_token, phone_number_id, business_account_id, webhook_verify_token } = req.body;

    if (access_token) await setConfig('access_token', access_token);
    if (phone_number_id) await setConfig('phone_number_id', phone_number_id);
    if (business_account_id) await setConfig('business_account_id', business_account_id);
    if (webhook_verify_token) await setConfig('webhook_verify_token', webhook_verify_token);

    res.json({ success: true, message: 'Configuration sauvegardée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tester la connexion Meta
router.post('/config/test', async (req, res) => {
  const token = await getConfig('access_token') || process.env.META_ACCESS_TOKEN;
  const phoneId = await getConfig('phone_number_id') || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return res.status(400).json({ success: false, message: 'Token ou Phone Number ID manquant' });
  }

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v21.0/${phoneId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({
      success: true,
      message: 'Connexion réussie !',
      data: {
        display_phone_number: response.data.display_phone_number,
        verified_name: response.data.verified_name,
        quality_rating: response.data.quality_rating
      }
    });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ success: false, message: `Erreur: ${msg}` });
  }
});

// ============================================
// CONTACTS
// ============================================

// Liste des contacts
router.get('/contacts', async (req, res) => {
  try {
    const { search, tag } = req.query;
    let query = 'SELECT * FROM contacts';
    const params = [];

    if (search) {
      query += ' WHERE (phone ILIKE $' + (params.length + 1) + ' OR name ILIKE $' + (params.length + 2) + ')';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (tag) {
      query += search ? ' AND' : ' WHERE';
      query += ' tags ILIKE $' + (params.length + 1);
      params.push(`%${tag}%`);
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ajouter un contact
router.post('/contacts', async (req, res) => {
  try {
    const { phone, name, tags } = req.body;
    if (!phone) return res.status(400).json({ error: 'Numéro de téléphone requis' });

    // Normaliser le numéro (enlever espaces, tirets, etc.)
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

    await pool.query('INSERT INTO contacts (phone, name, tags) VALUES ($1, $2, $3)', [cleanPhone, name || '', tags || '']);
    res.json({ success: true, message: 'Contact ajouté' });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'Ce numéro existe déjà' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Supprimer tous les contacts
router.delete('/contacts/all', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM contacts');
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer un contact
router.delete('/contacts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import CSV
router.post('/contacts/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  const results = [];
  let imported = 0;
  let skipped = 0;

  const separator = detectSeparator(req.file.path);
  const rows = [];
  fs.createReadStream(req.file.path)
    .pipe(csv({ separator }))
    .on('data', (row) => rows.push(row))
    .on('end', async () => {
      for (const row of rows) {
        const phone = (row.phone || row.telephone || row.numero || row.Phone || Object.values(row)[0] || '').replace(/[\s\-\(\)\+]/g, '');
        const name = row.name || row.nom || row.Name || Object.values(row)[1] || '';
        const tags = row.tags || row.tag || '';
        if (phone) {
          try {
            await pool.query(
              'INSERT INTO contacts (phone, name, tags) VALUES ($1, $2, $3) ON CONFLICT(phone) DO NOTHING',
              [phone, name, tags]
            );
            imported++;
          } catch {
            skipped++;
          }
        }
      }
      fs.unlinkSync(req.file.path);
      res.json({ success: true, imported, skipped });
    })
    .on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
});

// ============================================
// POOLS
// ============================================

// Liste des pools avec stats
router.get('/pools', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM pool_contacts pc WHERE pc.pool_id = p.id) as total_contacts,
        (SELECT COUNT(DISTINCT pc.contact_id) FROM pool_contacts pc
          JOIN campaign_contacts cc ON cc.contact_id = pc.contact_id
          WHERE pc.pool_id = p.id AND cc.status IN ('sent', 'delivered', 'read')) as contacted_count
      FROM pools p
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows.map(r => ({
      ...r,
      total_contacts: parseInt(r.total_contacts),
      contacted_count: parseInt(r.contacted_count),
      available_count: parseInt(r.total_contacts) - parseInt(r.contacted_count)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Créer un pool
router.post('/pools', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const result = await pool.query(
      'INSERT INTO pools (name, description) VALUES ($1, $2) RETURNING id',
      [name, description || '']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer un pool (et ses liens, pas les contacts)
router.delete('/pools/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM pool_contacts WHERE pool_id = $1', [req.params.id]);
    await pool.query('DELETE FROM pools WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contacts d'un pool avec statut campagne
router.get('/pools/:id/contacts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        CASE WHEN EXISTS (
          SELECT 1 FROM campaign_contacts cc
          WHERE cc.contact_id = c.id AND cc.status IN ('sent', 'delivered', 'read')
        ) THEN true ELSE false END as contacted,
        (SELECT string_agg(DISTINCT cam.name, ', ')
         FROM campaign_contacts cc2
         JOIN campaigns cam ON cam.id = cc2.campaign_id
         WHERE cc2.contact_id = c.id AND cc2.status IN ('sent', 'delivered', 'read')
        ) as campaign_names
      FROM contacts c
      JOIN pool_contacts pc ON pc.contact_id = c.id
      WHERE pc.pool_id = $1
      ORDER BY c.name ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import CSV dans un pool
router.post('/pools/:id/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  const poolId = req.params.id;
  let imported = 0;
  let skipped = 0;
  const rows = [];

  const separator = detectSeparator(req.file.path);
  fs.createReadStream(req.file.path)
    .pipe(csv({ separator }))
    .on('data', (row) => rows.push(row))
    .on('end', async () => {
      for (const row of rows) {
        const phone = (row.phone || row.telephone || row.numero || row.Phone || Object.values(row)[0] || '').replace(/[\s\-\(\)]/g, '');
        const name = row.name || row.nom || row.Name || Object.values(row)[1] || '';
        const tags = row.tags || row.tag || '';
        if (phone) {
          try {
            const insertRes = await pool.query(
              `INSERT INTO contacts (phone, name, tags) VALUES ($1, $2, $3)
               ON CONFLICT(phone) DO UPDATE SET name = COALESCE(NULLIF($2, ''), contacts.name)
               RETURNING id`,
              [phone, name, tags]
            );
            const contactId = insertRes.rows[0].id;
            await pool.query(
              'INSERT INTO pool_contacts (pool_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [poolId, contactId]
            );
            imported++;
          } catch {
            skipped++;
          }
        }
      }
      fs.unlinkSync(req.file.path);
      res.json({ success: true, imported, skipped });
    })
    .on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
});

// Retirer un contact d'un pool
router.delete('/pools/:poolId/contacts/:contactId', async (req, res) => {
  try {
    await pool.query('DELETE FROM pool_contacts WHERE pool_id = $1 AND contact_id = $2', [req.params.poolId, req.params.contactId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vider un pool
router.delete('/pools/:id/contacts', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM pool_contacts WHERE pool_id = $1', [req.params.id]);
    res.json({ success: true, removed: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ENVOI DE MESSAGES
// ============================================

async function getMetaCredentials() {
  return {
    token: await getConfig('access_token') || process.env.META_ACCESS_TOKEN,
    phoneId: await getConfig('phone_number_id') || process.env.WHATSAPP_PHONE_NUMBER_ID
  };
}

// Envoyer un message texte libre
router.post('/send/text', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const { token, phoneId } = await getMetaCredentials();

    if (!token || !phoneId) {
      return res.status(400).json({ error: 'Configuration Meta manquante' });
    }

    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message }
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const msgId = response.data.messages?.[0]?.id;

    await pool.query(
      `INSERT INTO messages (contact_phone, direction, content, status, whatsapp_message_id)
       VALUES ($1, 'sent', $2, 'sent', $3)`,
      [phone, message, msgId]
    );

    res.json({ success: true, message_id: msgId });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: msg });
  }
});

// Envoyer un template
router.post('/send/template', async (req, res) => {
  try {
    const { phone, template_name, language, variables } = req.body;
    const { token, phoneId } = await getMetaCredentials();

    if (!token || !phoneId) {
      return res.status(400).json({ error: 'Configuration Meta manquante' });
    }

    const templatePayload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template_name,
        language: { code: language || 'fr' },
      }
    };

    // Ajouter les variables si présentes
    if (variables && variables.length > 0) {
      templatePayload.template.components = [{
        type: 'body',
        parameters: variables.map(v => ({ type: 'text', text: v }))
      }];
    }

    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      templatePayload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const msgId = response.data.messages?.[0]?.id;

    await pool.query(
      `INSERT INTO messages (contact_phone, direction, content, template_name, status, whatsapp_message_id)
       VALUES ($1, 'sent', $2, $3, 'sent', $4)`,
      [phone, `[Template: ${template_name}]`, template_name, msgId]
    );

    res.json({ success: true, message_id: msgId });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: msg });
  }
});

// Envoi en masse (campagne)
router.post('/campaigns/send', async (req, res) => {
  try {
    const { campaign_id } = req.body;

    const campaignRes = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
    const campaign = campaignRes.rows[0];
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });

    const templateRes = await pool.query('SELECT * FROM templates WHERE id = $1', [campaign.template_id]);
    const template = templateRes.rows[0];
    if (!template) return res.status(404).json({ error: 'Template introuvable' });

    const contactsRes = await pool.query(`
      SELECT c.* FROM contacts c
      JOIN campaign_contacts cc ON cc.contact_id = c.id
      WHERE cc.campaign_id = $1 AND cc.status = 'pending'
    `, [campaign_id]);
    const contacts = contactsRes.rows;

    const { token, phoneId } = await getMetaCredentials();
    if (!token || !phoneId) {
      return res.status(400).json({ error: 'Configuration Meta manquante' });
    }

    await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['running', campaign_id]);

    // Envoi asynchrone avec délai entre chaque message
    let sentCount = 0;
    const sendNext = async (index) => {
      if (index >= contacts.length) {
        await pool.query('UPDATE campaigns SET status = $1, sent_count = $2 WHERE id = $3', ['completed', sentCount, campaign_id]);
        return;
      }

      const contact = contacts[index];
      try {
        const payload = {
          messaging_product: 'whatsapp',
          to: contact.phone,
          type: 'template',
          template: {
            name: template.name,
            language: { code: 'fr' }
          }
        };

        const vars = JSON.parse(template.variables || '[]');
        if (vars.length > 0) {
          payload.template.components = [{
            type: 'body',
            parameters: vars.map(v => {
              let value = v;
              if (v === '{{name}}') value = contact.name || '';
              if (v === '{{phone}}') value = contact.phone;
              return { type: 'text', text: value };
            })
          }];
        }

        const response = await axios.post(
          `https://graph.facebook.com/v21.0/${phoneId}/messages`,
          payload,
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        const msgId = response.data.messages?.[0]?.id;

        await pool.query(
          `INSERT INTO messages (contact_phone, direction, content, template_name, status, whatsapp_message_id)
           VALUES ($1, 'sent', $2, $3, 'sent', $4)`,
          [contact.phone, `[Campaign: ${campaign.name}]`, template.name, msgId]
        );

        await pool.query(
          'UPDATE campaign_contacts SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE campaign_id = $2 AND contact_id = $3',
          ['sent', campaign_id, contact.id]
        );

        sentCount++;
      } catch (err) {
        console.error(`Erreur envoi à ${contact.phone}:`, err.response?.data?.error?.message || err.message);
        await pool.query('UPDATE campaign_contacts SET status = $1 WHERE campaign_id = $2 AND contact_id = $3', ['failed', campaign_id, contact.id]);
      }

      // Délai de 1 seconde entre chaque envoi pour respecter les limites Meta
      setTimeout(() => sendNext(index + 1), 1000);
    };

    sendNext(0);
    res.json({ success: true, message: `Envoi en cours pour ${contacts.length} contacts` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CAMPAGNES
// ============================================

router.get('/campaigns', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, t.name as template_name_display
      FROM campaigns c
      LEFT JOIN templates t ON t.id = c.template_id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campaigns', async (req, res) => {
  try {
    const { name, template_id, contact_ids } = req.body;

    const result = await pool.query(
      'INSERT INTO campaigns (name, template_id, total_contacts) VALUES ($1, $2, $3) RETURNING id',
      [name, template_id, contact_ids?.length || 0]
    );
    const campaignId = result.rows[0].id;

    if (contact_ids && contact_ids.length > 0) {
      for (const cid of contact_ids) {
        await pool.query('INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [campaignId, cid]);
      }
    }

    res.json({ success: true, id: campaignId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM campaign_contacts WHERE campaign_id = $1', [req.params.id]);
    await pool.query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TEMPLATES
// ============================================

router.get('/templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM templates ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, content, variables } = req.body;
    await pool.query(
      'INSERT INTO templates (name, content, variables) VALUES ($1, $2, $3)',
      [name, content, JSON.stringify(variables || [])]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Récupérer les templates approuvés depuis Meta
router.get('/templates/meta', async (req, res) => {
  try {
    const { token, phoneId } = await getMetaCredentials();
    const wabaId = await getConfig('business_account_id') || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!token || !wabaId) {
      return res.status(400).json({ error: 'Configuration Meta manquante (token ou Business Account ID)' });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
      {
        params: { limit: 100 },
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const templates = (response.data.data || []).map(t => ({
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      components: t.components,
      id: t.id
    }));

    res.json(templates);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: msg });
  }
});

// Importer un template Meta dans la DB locale
router.post('/templates/import-meta', async (req, res) => {
  try {
    const { name, content, variables, language } = req.body;

    await pool.query(
      `INSERT INTO templates (name, content, variables)
       VALUES ($1, $2, $3)
       ON CONFLICT(name) DO UPDATE SET content = $2, variables = $3`,
      [name, content || '', JSON.stringify(variables || [])]
    );

    res.json({ success: true, message: `Template "${name}" importé` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// MESSAGES / HISTORIQUE
// ============================================

router.get('/messages', async (req, res) => {
  try {
    const { phone } = req.query;
    let query = 'SELECT * FROM messages';
    const params = [];

    if (phone) {
      query += ' WHERE contact_phone = $1';
      params.push(phone);
    }

    query += ' ORDER BY created_at DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats dashboard
router.get('/stats', async (req, res) => {
  try {
    const totalContactsRes = await pool.query('SELECT COUNT(*) as count FROM contacts');
    const totalMessagesRes = await pool.query('SELECT COUNT(*) as count FROM messages WHERE direction = $1', ['sent']);
    const totalReceivedRes = await pool.query('SELECT COUNT(*) as count FROM messages WHERE direction = $1', ['received']);
    const totalCampaignsRes = await pool.query('SELECT COUNT(*) as count FROM campaigns');
    const totalPoolsRes = await pool.query('SELECT COUNT(*) as count FROM pools');
    const recentMessagesRes = await pool.query('SELECT * FROM messages ORDER BY created_at DESC LIMIT 10');

    res.json({
      totalContacts: parseInt(totalContactsRes.rows[0].count),
      totalMessages: parseInt(totalMessagesRes.rows[0].count),
      totalReceived: parseInt(totalReceivedRes.rows[0].count),
      totalCampaigns: parseInt(totalCampaignsRes.rows[0].count),
      totalPools: parseInt(totalPoolsRes.rows[0].count),
      recentMessages: recentMessagesRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
