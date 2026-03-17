// ============================================
// NAVIGATION
// ============================================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`page-${item.dataset.page}`).classList.add('active');

    // Charger les données de la page
    loadPageData(item.dataset.page);
  });
});

function loadPageData(page) {
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'config': loadConfig(); break;
    case 'contacts': loadContacts(); break;
    case 'templates': loadLocalTemplates(); break;
    case 'campaigns': loadCampaigns(); loadTemplatesSelect(); loadContactsCheckboxes(); break;
    case 'messages': loadMessages(); break;
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ============================================
// API HELPER
// ============================================
async function api(url, options = {}) {
  const res = await fetch(`/api${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return res.json();
}

async function apiForm(url, formData) {
  const res = await fetch(`/api${url}`, { method: 'POST', body: formData });
  return res.json();
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
  const stats = await api('/stats');
  document.getElementById('stat-contacts').textContent = stats.totalContacts;
  document.getElementById('stat-sent').textContent = stats.totalMessages;
  document.getElementById('stat-received').textContent = stats.totalReceived;
  document.getElementById('stat-campaigns').textContent = stats.totalCampaigns;

  const tbody = document.getElementById('recent-messages');
  tbody.innerHTML = (stats.recentMessages || []).map(m => `
    <tr>
      <td>${m.contact_phone}</td>
      <td><span class="badge ${m.direction === 'sent' ? 'badge-info' : 'badge-success'}">${m.direction === 'sent' ? 'Envoy\u00e9' : 'Re\u00e7u'}</span></td>
      <td>${truncate(m.content, 60)}</td>
      <td><span class="badge badge-${statusColor(m.status)}">${m.status || '-'}</span></td>
      <td>${formatDate(m.created_at)}</td>
    </tr>
  `).join('');

  // Check connection
  const config = await api('/config');
  const banner = document.getElementById('connection-banner');
  if (config.access_token_preview) {
    banner.innerHTML = `<div class="connection-status connected"><span class="connection-dot"></span> Meta WhatsApp configur\u00e9</div>`;
  } else {
    banner.innerHTML = `<div class="connection-status disconnected"><span class="connection-dot"></span> Meta non configur\u00e9 - <a href="#" onclick="navigateTo('config')" style="color:inherit;text-decoration:underline">Configurer maintenant</a></div>`;
  }
}

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  loadPageData(page);
}

// ============================================
// CONFIGURATION
// ============================================
async function loadConfig() {
  const config = await api('/config');
  if (config.access_token_preview) {
    document.getElementById('cfg-token').placeholder = `Actuel: ${config.access_token_preview}`;
  }
  document.getElementById('cfg-phone-id').value = config.phone_number_id || '';
  document.getElementById('cfg-business-id').value = config.business_account_id || '';
  document.getElementById('cfg-webhook-token').value = config.webhook_verify_token || '';

  // Afficher la vraie URL du webhook
  const webhookUrl = `${window.location.origin}/webhook`;
  document.getElementById('webhook-url').textContent = webhookUrl;
}

function copyWebhookUrl() {
  const url = `${window.location.origin}/webhook`;
  navigator.clipboard.writeText(url).then(() => {
    toast('URL copi\u00e9e !');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    toast('URL copi\u00e9e !');
  });
}

document.getElementById('config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {};
  const token = document.getElementById('cfg-token').value;
  const phoneId = document.getElementById('cfg-phone-id').value;
  const businessId = document.getElementById('cfg-business-id').value;
  const webhookToken = document.getElementById('cfg-webhook-token').value;

  if (token) data.access_token = token;
  if (phoneId) data.phone_number_id = phoneId;
  if (businessId) data.business_account_id = businessId;
  if (webhookToken) data.webhook_verify_token = webhookToken;

  const result = await api('/config', { method: 'POST', body: data });
  if (result.success) {
    toast('Configuration sauvegard\u00e9e !');
    document.getElementById('cfg-token').value = '';
    loadConfig();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
});

async function testConnection() {
  const statusEl = document.getElementById('config-connection-status');
  statusEl.innerHTML = '<div class="connection-status disconnected"><span class="connection-dot"></span> Test en cours...</div>';

  const result = await api('/config/test', { method: 'POST' });
  if (result.success) {
    statusEl.innerHTML = `
      <div class="connection-status connected">
        <span class="connection-dot"></span>
        Connexion r\u00e9ussie ! Num\u00e9ro: ${result.data.display_phone_number} | Nom: ${result.data.verified_name} | Qualit\u00e9: ${result.data.quality_rating}
      </div>`;
    toast('Connexion Meta r\u00e9ussie !');
  } else {
    statusEl.innerHTML = `<div class="connection-status disconnected"><span class="connection-dot"></span> ${result.message}</div>`;
    toast(result.message, 'error');
  }
}

// ============================================
// CONTACTS
// ============================================
async function loadContacts(search = '') {
  const contacts = await api(`/contacts?search=${encodeURIComponent(search)}`);
  const tbody = document.getElementById('contacts-list');
  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td>${c.phone}</td>
      <td>${c.name || '-'}</td>
      <td>${c.tags || '-'}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="sendToContact('${c.phone}')">Envoyer</button>
        <button class="btn btn-sm btn-danger" onclick="deleteContact(${c.id})">Suppr.</button>
      </td>
    </tr>
  `).join('');

  if (contacts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;">Aucun contact</td></tr>';
  }
}

document.getElementById('add-contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await api('/contacts', {
    method: 'POST',
    body: {
      phone: document.getElementById('contact-phone').value,
      name: document.getElementById('contact-name').value,
      tags: document.getElementById('contact-tags').value
    }
  });
  if (result.success) {
    toast('Contact ajout\u00e9 !');
    document.getElementById('contact-phone').value = '';
    document.getElementById('contact-name').value = '';
    document.getElementById('contact-tags').value = '';
    loadContacts();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
});

document.getElementById('search-contacts').addEventListener('input', (e) => {
  loadContacts(e.target.value);
});

document.getElementById('import-csv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const result = await apiForm('/contacts/import', formData);
  if (result.success) {
    toast(`${result.imported} contacts import\u00e9s, ${result.skipped} ignor\u00e9s`);
    loadContacts();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
  e.target.value = '';
});

async function deleteContact(id) {
  if (!confirm('Supprimer ce contact ?')) return;
  await api(`/contacts/${id}`, { method: 'DELETE' });
  toast('Contact supprim\u00e9');
  loadContacts();
}

async function deleteAllContacts() {
  if (!confirm('Supprimer TOUS les contacts ? Cette action est irr\u00e9versible.')) return;
  if (!confirm('\u00cates-vous vraiment s\u00fbr ? Tous les contacts seront supprim\u00e9s d\u00e9finitivement.')) return;
  const result = await api('/contacts/all', { method: 'DELETE' });
  if (result.success) {
    toast(`${result.deleted} contact(s) supprim\u00e9(s)`);
    loadContacts();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
}

function sendToContact(phone) {
  navigateTo('send');
  document.getElementById('send-phone').value = phone;
  document.getElementById('tpl-phone').value = phone;
}

// ============================================
// ENVOI DE MESSAGES
// ============================================
document.getElementById('send-text-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-send-text');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  const result = await api('/send/text', {
    method: 'POST',
    body: {
      phone: document.getElementById('send-phone').value,
      message: document.getElementById('send-message').value
    }
  });
  if (result.success) {
    toast('Message envoy\u00e9 !');
    document.getElementById('send-message').value = '';
  } else {
    toast(result.error || 'Erreur', 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Envoyer';
});

document.getElementById('send-template-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-send-template');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  const varsText = document.getElementById('tpl-vars').value.trim();
  const variables = varsText ? varsText.split('\n').map(v => v.trim()).filter(Boolean) : [];

  const result = await api('/send/template', {
    method: 'POST',
    body: {
      phone: document.getElementById('tpl-phone').value,
      template_name: document.getElementById('tpl-name').value,
      language: document.getElementById('tpl-lang').value,
      variables
    }
  });
  if (result.success) {
    toast('Template envoy\u00e9 !');
  } else {
    toast(result.error || 'Erreur', 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Envoyer le template';
});

// ============================================
// CAMPAGNES
// ============================================
async function loadTemplatesSelect() {
  const templates = await api('/templates');
  const select = document.getElementById('camp-template');
  select.innerHTML = '<option value="">-- S\u00e9lectionner --</option>' +
    templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

async function loadContactsCheckboxes() {
  const contacts = await api('/contacts');
  const container = document.getElementById('camp-contacts');
  if (contacts.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:12px;">Aucun contact. Ajoutez des contacts d\'abord.</p>';
    return;
  }
  container.innerHTML = `
    <div class="contact-check-item" style="border-bottom:1px solid var(--border);margin-bottom:4px;padding-bottom:8px;">
      <input type="checkbox" id="select-all-contacts" onchange="toggleAllContacts(this)">
      <label for="select-all-contacts" style="cursor:pointer;color:var(--primary);font-weight:600;">Tout s\u00e9lectionner</label>
    </div>
  ` + contacts.map(c => `
    <div class="contact-check-item">
      <input type="checkbox" class="contact-cb" value="${c.id}" id="cc-${c.id}">
      <label for="cc-${c.id}" style="cursor:pointer;">${c.phone} ${c.name ? '- ' + c.name : ''}</label>
    </div>
  `).join('');
}

function toggleAllContacts(el) {
  document.querySelectorAll('.contact-cb').forEach(cb => cb.checked = el.checked);
}

async function loadCampaigns() {
  const campaigns = await api('/campaigns');
  const tbody = document.getElementById('campaigns-list');
  tbody.innerHTML = campaigns.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.template_name_display || '-'}</td>
      <td>${c.total_contacts}</td>
      <td>${c.sent_count}</td>
      <td>${c.delivered_count}</td>
      <td>${c.read_count}</td>
      <td>${c.failed_count}</td>
      <td><span class="badge badge-${campaignStatusColor(c.status)}">${c.status}</span></td>
      <td>
        ${c.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="launchCampaign(${c.id})">Lancer</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteCampaign(${c.id})">Suppr.</button>
      </td>
    </tr>
  `).join('');

  if (campaigns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:40px;">Aucune campagne</td></tr>';
  }
}

document.getElementById('create-campaign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const selectedContacts = [...document.querySelectorAll('.contact-cb:checked')].map(cb => parseInt(cb.value));

  if (selectedContacts.length === 0) {
    toast('S\u00e9lectionnez au moins un contact', 'error');
    return;
  }

  const result = await api('/campaigns', {
    method: 'POST',
    body: {
      name: document.getElementById('camp-name').value,
      template_id: parseInt(document.getElementById('camp-template').value) || null,
      contact_ids: selectedContacts
    }
  });

  if (result.success) {
    toast('Campagne cr\u00e9\u00e9e !');
    document.getElementById('camp-name').value = '';
    loadCampaigns();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
});

async function launchCampaign(id) {
  if (!confirm('Lancer cette campagne ?\n\nLes messages seront envoy\u00e9s imm\u00e9diatement \u00e0 tous les contacts s\u00e9lectionn\u00e9s.\n\nCette action est irr\u00e9versible.')) return;
  toast('Lancement de la campagne...', 'info');
  const result = await api('/campaigns/send', { method: 'POST', body: { campaign_id: id } });
  if (result.success) {
    toast(result.message);
    setTimeout(() => loadCampaigns(), 3000);
  } else {
    toast(result.error || 'Erreur', 'error');
  }
}

async function deleteCampaign(id) {
  if (!confirm('Supprimer cette campagne ?')) return;
  await api(`/campaigns/${id}`, { method: 'DELETE' });
  toast('Campagne supprim\u00e9e');
  loadCampaigns();
}

// ============================================
// MESSAGES
// ============================================
async function loadMessages(phone = '') {
  const url = phone ? `/messages?phone=${encodeURIComponent(phone)}` : '/messages';
  const messages = await api(url);
  const tbody = document.getElementById('messages-list');
  tbody.innerHTML = messages.map(m => `
    <tr>
      <td>${m.contact_phone}</td>
      <td><span class="badge ${m.direction === 'sent' ? 'badge-info' : 'badge-success'}">${m.direction === 'sent' ? 'Envoy\u00e9' : 'Re\u00e7u'}</span></td>
      <td>${truncate(m.content, 80)}</td>
      <td>${m.template_name || '-'}</td>
      <td><span class="badge badge-${statusColor(m.status)}">${m.status || '-'}</span></td>
      <td>${formatDate(m.created_at)}</td>
    </tr>
  `).join('');

  if (messages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">Aucun message</td></tr>';
  }
}

document.getElementById('filter-messages-phone').addEventListener('input', (e) => {
  loadMessages(e.target.value);
});

// ============================================
// TEMPLATES
// ============================================
async function syncMetaTemplates() {
  const btn = document.getElementById('btn-sync-meta');
  const statusEl = document.getElementById('meta-templates-status');
  btn.disabled = true;
  btn.textContent = 'Synchronisation...';
  statusEl.innerHTML = '<div class="connection-status disconnected"><span class="connection-dot"></span> Chargement des templates depuis Meta...</div>';

  try {
    const templates = await api('/templates/meta');

    if (templates.error) {
      statusEl.innerHTML = `<div class="connection-status disconnected"><span class="connection-dot"></span> Erreur: ${templates.error}</div>`;
      toast(templates.error, 'error');
      btn.disabled = false;
      btn.textContent = 'Synchroniser depuis Meta';
      return;
    }

    const tbody = document.getElementById('meta-templates-list');
    tbody.innerHTML = templates.map(t => {
      const bodyComp = (t.components || []).find(c => c.type === 'BODY');
      const preview = bodyComp ? bodyComp.text : '-';
      const statusClass = t.status === 'APPROVED' ? 'badge-success' : t.status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
      const vars = bodyComp ? (bodyComp.text.match(/\{\{\d+\}\}/g) || []) : [];

      return `
        <tr>
          <td><strong>${t.name}</strong></td>
          <td><span class="badge ${statusClass}">${t.status}</span></td>
          <td>${t.category || '-'}</td>
          <td>${t.language || '-'}</td>
          <td>${truncate(preview, 60)}</td>
          <td>
            ${t.status === 'APPROVED' ? `<button class="btn btn-sm btn-primary" onclick="importMetaTemplate('${t.name}', ${JSON.stringify(preview).replace(/'/g, "\\'")} , ${JSON.stringify(JSON.stringify(vars))})">Importer</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    if (templates.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">Aucun template trouv\u00e9 sur Meta</td></tr>';
    }

    const approved = templates.filter(t => t.status === 'APPROVED').length;
    statusEl.innerHTML = `<div class="connection-status connected"><span class="connection-dot"></span> ${templates.length} templates trouv\u00e9s dont ${approved} approuv\u00e9s</div>`;
    toast(`${templates.length} templates r\u00e9cup\u00e9r\u00e9s depuis Meta`);
  } catch (err) {
    statusEl.innerHTML = `<div class="connection-status disconnected"><span class="connection-dot"></span> Erreur de connexion \u00e0 Meta</div>`;
    toast('Erreur lors de la synchronisation', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Synchroniser depuis Meta';
}

async function importMetaTemplate(name, content, varsJson) {
  const variables = JSON.parse(varsJson || '[]');
  const result = await api('/templates/import-meta', {
    method: 'POST',
    body: { name, content, variables }
  });

  if (result.success) {
    toast(`Template "${name}" import\u00e9 !`);
    loadLocalTemplates();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
}

async function loadLocalTemplates() {
  const templates = await api('/templates');
  const tbody = document.getElementById('local-templates-list');
  tbody.innerHTML = templates.map(t => `
    <tr>
      <td><strong>${t.name}</strong></td>
      <td>${truncate(t.content, 60)}</td>
      <td>${t.variables || '[]'}</td>
      <td>${formatDate(t.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteTemplate(${t.id})">Suppr.</button>
      </td>
    </tr>
  `).join('');

  if (templates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;">Aucun template local. Synchronisez depuis Meta ou ajoutez-en manuellement.</td></tr>';
  }
}

async function deleteTemplate(id) {
  if (!confirm('Supprimer ce template ?')) return;
  await api(`/templates/${id}`, { method: 'DELETE' });
  toast('Template supprim\u00e9');
  loadLocalTemplates();
}

document.getElementById('add-template-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let variables = [];
  const varsInput = document.getElementById('tpl-add-vars').value.trim();
  if (varsInput) {
    try {
      variables = JSON.parse(varsInput);
    } catch {
      toast('Format JSON invalide pour les variables', 'error');
      return;
    }
  }

  const result = await api('/templates', {
    method: 'POST',
    body: {
      name: document.getElementById('tpl-add-name').value,
      content: document.getElementById('tpl-add-content').value,
      variables
    }
  });

  if (result.success) {
    toast('Template ajout\u00e9 !');
    document.getElementById('tpl-add-name').value = '';
    document.getElementById('tpl-add-content').value = '';
    document.getElementById('tpl-add-vars').value = '';
    loadLocalTemplates();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
});

// ============================================
// HELPERS
// ============================================
function truncate(str, len) {
  if (!str) return '-';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function statusColor(status) {
  switch (status) {
    case 'sent': return 'info';
    case 'delivered': return 'success';
    case 'read': return 'success';
    case 'failed': return 'danger';
    default: return 'warning';
  }
}

function campaignStatusColor(status) {
  switch (status) {
    case 'draft': return 'warning';
    case 'running': return 'info';
    case 'completed': return 'success';
    case 'paused': return 'warning';
    default: return 'info';
  }
}

// Load dashboard on start
loadDashboard();
