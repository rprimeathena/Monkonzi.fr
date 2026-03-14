const { Pool } = require('pg');

// Utiliser un Pool pour gérer les connexions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialiser la DB au démarrage
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        name TEXT,
        tags TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        contact_phone TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
        content TEXT NOT NULL,
        template_name TEXT,
        status TEXT DEFAULT 'pending',
        whatsapp_message_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        variables TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        template_id INTEGER,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'running', 'completed', 'paused')),
        total_contacts INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        delivered_count INTEGER DEFAULT 0,
        read_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );

      CREATE TABLE IF NOT EXISTS campaign_contacts (
        campaign_id INTEGER NOT NULL,
        contact_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at TIMESTAMP,
        PRIMARY KEY (campaign_id, contact_id),
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      );
    `);
    console.log('✓ Tables de base de données initialisées');
  } finally {
    client.release();
  }
};

// Helpers pour la config
const getConfig = async (key) => {
  const result = await pool.query('SELECT value FROM config WHERE key = $1', [key]);
  return result.rows.length > 0 ? result.rows[0].value : null;
};

const setConfig = async (key, value) => {
  await pool.query(
    `INSERT INTO config (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
};

const getAllConfig = async () => {
  const result = await pool.query('SELECT key, value FROM config');
  const config = {};
  result.rows.forEach(r => config[r.key] = r.value);
  return config;
};

module.exports = { pool, initializeDatabase, getConfig, setConfig, getAllConfig };
