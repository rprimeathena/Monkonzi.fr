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
    case 'pools': loadPools(); break;
    case 'templates': loadLocalTemplates(); break;
    case 'send': loadSendTemplates(); break;
    case 'campaigns': loadCampaigns(); loadTemplatesSelect(); loadPoolsSelect(); break;
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
  document.getElementById('stat-pools').textContent = stats.totalPools || 0;
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
// POOLS
// ============================================
let currentPoolId = null;

async function loadPools() {
  const pools = await api('/pools');
  const tbody = document.getElementById('pools-list');
  tbody.innerHTML = pools.map(p => {
    const pct = p.total_contacts > 0 ? Math.round((p.contacted_count / p.total_contacts) * 100) : 0;
    return `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.description || '-'}</td>
      <td>${p.total_contacts}</td>
      <td>${p.contacted_count}</td>
      <td><span class="badge badge-success">${p.available_count}</span></td>
      <td>${formatDate(p.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openPoolDetail(${p.id}, '${p.name.replace(/'/g, "\\'")}')">Voir</button>
        <button class="btn btn-sm btn-danger" onclick="deletePool(${p.id})">Suppr.</button>
      </td>
    </tr>
  `;
  }).join('');

  if (pools.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">Aucun pool. Cr\u00e9ez-en un pour commencer.</td></tr>';
  }
}

document.getElementById('create-pool-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await api('/pools', {
    method: 'POST',
    body: {
      name: document.getElementById('pool-name').value,
      description: document.getElementById('pool-description').value
    }
  });
  if (result.success) {
    toast('Pool cr\u00e9\u00e9 !');
    document.getElementById('pool-name').value = '';
    document.getElementById('pool-description').value = '';
    loadPools();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
});

async function deletePool(id) {
  if (!confirm('Supprimer ce pool ? Les contacts ne seront pas supprim\u00e9s, seulement le pool.')) return;
  await api(`/pools/${id}`, { method: 'DELETE' });
  toast('Pool supprim\u00e9');
  closePoolDetail();
  loadPools();
}

async function openPoolDetail(poolId, poolName) {
  currentPoolId = poolId;
  document.getElementById('pool-detail').style.display = 'block';
  document.getElementById('pool-detail-title').textContent = `Contacts du pool : ${poolName}`;
  await loadPoolContacts(poolId);

  // Scroll vers le d\u00e9tail
  document.getElementById('pool-detail').scrollIntoView({ behavior: 'smooth' });
}

function closePoolDetail() {
  document.getElementById('pool-detail').style.display = 'none';
  currentPoolId = null;
}

async function loadPoolContacts(poolId) {
  const contacts = await api(`/pools/${poolId}/contacts`);
  const tbody = document.getElementById('pool-contacts-list');

  const total = contacts.length;
  const contacted = contacts.filter(c => c.contacted).length;
  const available = total - contacted;

  document.getElementById('pool-detail-stats').innerHTML = `
    <div class="badge badge-info" style="padding:8px 14px;font-size:14px;">${total} total</div>
    <div class="badge badge-warning" style="padding:8px 14px;font-size:14px;">${contacted} contact\u00e9(s)</div>
    <div class="badge badge-success" style="padding:8px 14px;font-size:14px;">${available} disponible(s)</div>
  `;

  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td>${c.phone}</td>
      <td>${c.name || '-'}</td>
      <td>${c.tags || '-'}</td>
      <td>
        ${c.contacted
          ? `<span class="badge badge-warning">Contact\u00e9</span> <small style="color:var(--text-muted)">${c.campaign_names || ''}</small>`
          : '<span class="badge badge-success">Disponible</span>'
        }
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeFromPool(${currentPoolId}, ${c.id})">Retirer</button>
      </td>
    </tr>
  `).join('');

  if (contacts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;">Aucun contact dans ce pool. Importez un CSV.</td></tr>';
  }
}

async function removeFromPool(poolId, contactId) {
  if (!confirm('Retirer ce contact du pool ?')) return;
  await api(`/pools/${poolId}/contacts/${contactId}`, { method: 'DELETE' });
  toast('Contact retir\u00e9 du pool');
  loadPoolContacts(poolId);
  loadPools();
}

async function clearPool() {
  if (!currentPoolId) return;
  if (!confirm('Vider ce pool ? Tous les contacts seront retir\u00e9s du pool (pas supprim\u00e9s).')) return;
  const result = await api(`/pools/${currentPoolId}/contacts`, { method: 'DELETE' });
  if (result.success) {
    toast(`${result.removed} contact(s) retir\u00e9(s) du pool`);
    loadPoolContacts(currentPoolId);
    loadPools();
  }
}

document.getElementById('pool-import-csv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentPoolId) return;
  const formData = new FormData();
  formData.append('file', file);
  const result = await apiForm(`/pools/${currentPoolId}/import`, formData);
  if (result.success) {
    toast(`${result.imported} contacts import\u00e9s dans le pool`);
    loadPoolContacts(currentPoolId);
    loadPools();
  } else {
    toast(result.error || 'Erreur', 'error');
  }
  e.target.value = '';
});

// ============================================
// ENVOI DE MESSAGES
// ============================================
async function loadSendTemplates() {
  const templates = await api('/templates');
  const select = document.getElementById('tpl-name');
  select.innerHTML = '<option value="">-- Sélectionnez un template --</option>' +
    templates.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
}

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

async function loadPoolsSelect() {
  const pools = await api('/pools');
  const select = document.getElementById('camp-pool');
  select.innerHTML = '<option value="">-- S\u00e9lectionner --</option><option value="all">Tous les contacts</option>' +
    pools.map(p => `<option value="${p.id}">${p.name} (${p.available_count} dispo / ${p.total_contacts} total)</option>`).join('');
  // Reset contacts section
  document.getElementById('camp-contacts-section').style.display = 'none';
  document.getElementById('camp-contacts').innerHTML = '';
}

async function loadPoolContactsForCampaign(poolValue) {
  const section = document.getElementById('camp-contacts-section');
  const container = document.getElementById('camp-contacts');

  if (!poolValue) {
    section.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  let contacts;

  if (poolValue === 'all') {
    contacts = await api('/contacts');
    contacts = contacts.map(c => ({ ...c, contacted: false }));
  } else {
    contacts = await api(`/pools/${poolValue}/contacts`);
  }

  if (contacts.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:12px;">Aucun contact dans cette source.</p>';
    updateSelectionCount();
    return;
  }

  container.innerHTML = `
    <div class="contact-check-item" style="border-bottom:1px solid var(--border);margin-bottom:4px;padding-bottom:8px;">
      <input type="checkbox" id="select-all-contacts" onchange="toggleAllContacts(this)">
      <label for="select-all-contacts" style="cursor:pointer;color:var(--primary);font-weight:600;">Tout s\u00e9lectionner</label>
    </div>
  ` + contacts.map(c => `
    <div class="contact-check-item" data-contacted="${c.contacted ? 'true' : 'false'}">
      <input type="checkbox" class="contact-cb" value="${c.id}" id="cc-${c.id}" onchange="updateSelectionCount()">
      <label for="cc-${c.id}" style="cursor:pointer;">
        ${c.phone} ${c.name ? '- ' + c.name : ''}
        ${c.contacted
          ? ' <span class="badge badge-warning" style="font-size:11px;">Contact\u00e9</span>'
          : ' <span class="badge badge-success" style="font-size:11px;">Disponible</span>'
        }
      </label>
    </div>
  `).join('');

  updateSelectionCount();
}

function toggleAllContacts(el) {
  document.querySelectorAll('.contact-cb').forEach(cb => { cb.checked = el.checked; });
  updateSelectionCount();
}

function selectAvailableContacts() {
  document.querySelectorAll('.contact-cb').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.contact-check-item[data-contacted="false"] .contact-cb').forEach(cb => { cb.checked = true; });
  updateSelectionCount();
}

function selectRandomContacts() {
  const n = parseInt(document.getElementById('camp-random-count').value);
  if (!n || n < 1) { toast('Entrez un nombre valide', 'error'); return; }

  // Get available (not contacted) contacts
  const available = [...document.querySelectorAll('.contact-check-item[data-contacted="false"] .contact-cb')];
  if (available.length === 0) { toast('Aucun contact disponible', 'error'); return; }

  // Deselect all first
  document.querySelectorAll('.contact-cb').forEach(cb => { cb.checked = false; });

  // Shuffle and pick N
  const shuffled = available.sort(() => Math.random() - 0.5);
  const toSelect = Math.min(n, shuffled.length);
  for (let i = 0; i < toSelect; i++) {
    shuffled[i].checked = true;
  }

  toast(`${toSelect} contact(s) s\u00e9lectionn\u00e9(s) au hasard`);
  updateSelectionCount();
}

function deselectAllCampaignContacts() {
  document.querySelectorAll('.contact-cb').forEach(cb => { cb.checked = false; });
  const selectAll = document.getElementById('select-all-contacts');
  if (selectAll) selectAll.checked = false;
  updateSelectionCount();
}

function updateSelectionCount() {
  const count = document.querySelectorAll('.contact-cb:checked').length;
  const el = document.getElementById('camp-selection-count');
  if (el) el.textContent = `${count} s\u00e9lectionn\u00e9(s)`;
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

    // Auto-import tous les templates approuvés en DB locale
    const approved = templates.filter(t => t.status === 'APPROVED');
    let imported = 0;
    for (const t of approved) {
      const bodyComp = (t.components || []).find(c => c.type === 'BODY');
      const content = bodyComp ? bodyComp.text : '';
      const vars = bodyComp ? (bodyComp.text.match(/\{\{\d+\}\}/g) || []) : [];
      const result = await api('/templates/import-meta', {
        method: 'POST',
        body: { name: t.name, content, variables: vars, language: t.language }
      });
      if (result.success) imported++;
    }
    loadLocalTemplates();

    statusEl.innerHTML = `<div class="connection-status connected"><span class="connection-dot"></span> ${templates.length} templates trouv\u00e9s, ${imported} approuv\u00e9s import\u00e9s automatiquement</div>`;
    toast(`${imported} templates import\u00e9s en local`);
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
