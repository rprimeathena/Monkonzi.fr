# WA Prospect - Bot de Prospection WhatsApp

## Description

Bot de prospection WhatsApp utilisant l'API WhatsApp Business de Meta. Interface web complète pour gérer les contacts, créer des pools (listes), lancer des campagnes ciblées et envoyer des messages via templates approuvés par Meta.

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : PostgreSQL (via `pg` Pool)
- **Frontend** : HTML/CSS/JS vanilla (SPA avec navigation côté client)
- **API externe** : Meta Graph API v21.0 (WhatsApp Business)
- **Hébergement** : Vercel (serverless) — https://monkonzi-v3.vercel.app
- **Repo** : https://github.com/rprimeathena/Monkonzi.fr

## Architecture des fichiers

```
server.js                  → Point d'entrée Express, middleware DB lazy-init
db/database.js             → Pool PostgreSQL, initialisation tables, helpers config
routes/api.js              → Toutes les routes API REST
routes/webhook.js          → Webhook Meta (réception messages WhatsApp)
api/index.js               → Entry point Vercel serverless
public/index.html          → SPA complète (toutes les pages dans un seul fichier)
public/js/app.js           → Logique frontend (navigation, API calls, DOM)
public/css/style.css       → Styles (thème sombre WhatsApp-like)
vercel.json                → Config Vercel (rewrites)
```

## Base de données (PostgreSQL)

### Tables

| Table | Description |
|-------|-------------|
| `config` | Clés/valeurs de configuration Meta (token, phone_id, business_id, webhook_token) |
| `contacts` | Contacts (phone UNIQUE, name, tags) |
| `pools` | Pools/listes de contacts (name, description) |
| `pool_contacts` | Liaison N:N entre pools et contacts |
| `messages` | Historique des messages envoyés/reçus |
| `templates` | Templates WhatsApp importés depuis Meta |
| `campaigns` | Campagnes d'envoi en masse |
| `campaign_contacts` | Liaison N:N entre campagnes et contacts avec statut d'envoi |

### Relations clés

- Un contact peut être dans plusieurs pools (`pool_contacts`)
- Un contact peut être dans plusieurs campagnes (`campaign_contacts`)
- Une campagne est liée à un template
- Les contacts ont un numéro de téléphone UNIQUE

## Fonctionnalités

### 1. Configuration Meta
- Stockage sécurisé du token d'accès, Phone Number ID, Business Account ID, Webhook Verify Token
- Test de connexion vers l'API Meta
- Affichage de l'URL webhook à configurer dans Meta

### 2. Contacts
- Ajout manuel (téléphone, nom, tags)
- Import CSV (détection auto des colonnes : phone/telephone/numero, name/nom, tags)
- Recherche en temps réel
- Suppression individuelle ou en masse
- Normalisation automatique des numéros (suppression espaces, tirets, parenthèses)

### 3. Pools (système de listes)
- **Concept** : un pool = une liste importée (ex: "Restaurants Paris", "Leads Mars 2026")
- Création de pool avec nom + description
- Import CSV directement dans un pool
- Vue détaillée avec statut de chaque contact :
  - **Disponible** (jamais contacté via campagne)
  - **Contacté** (déjà envoyé via une campagne, avec le nom de la campagne affiché)
- Stats en temps réel : total / contactés / disponibles
- Retirer un contact d'un pool (sans le supprimer de la base)
- Vider un pool
- Un même contact peut être dans plusieurs pools

### 4. Templates
- Synchronisation des templates approuvés depuis Meta (API Graph)
- Import dans la base locale
- Ajout manuel
- Détection automatique des variables ({{1}}, {{2}}, etc.)

### 5. Campagnes
- Création avec : nom, template, source de contacts (pool ou tous)
- **Sélection intelligente des contacts** :
  - Par pool (dropdown)
  - "Tous les disponibles" (non contactés)
  - "N au hasard" parmi les disponibles
  - Sélection manuelle avec checkboxes
  - Compteur de sélection en temps réel
- Envoi en masse avec délai de 1s entre chaque message (respect limites Meta)
- Suivi : draft → running → completed
- Stats : envoyés, délivrés, lus, échoués

### 6. Envoi de messages
- **Message texte libre** : uniquement dans la fenêtre de 24h (conversation initiée par le client)
- **Template** : pour contacter un prospect en dehors de la fenêtre 24h (template doit être approuvé par Meta)
- Support des variables dans les templates

### 7. Historique des messages
- Log de tous les messages envoyés/reçus
- Filtrage par numéro de téléphone
- Statut : pending → sent → delivered → read → failed

### 8. Dashboard
- Stats globales : contacts, messages envoyés, reçus, pools, campagnes
- Derniers messages
- Statut de connexion Meta

## Routes API

### Configuration
- `GET /api/config` — Récupérer la config (token masqué)
- `POST /api/config` — Sauvegarder la config
- `POST /api/config/test` — Tester la connexion Meta

### Contacts
- `GET /api/contacts?search=&tag=` — Liste des contacts (filtrable)
- `POST /api/contacts` — Ajouter un contact
- `DELETE /api/contacts/all` — Supprimer tous les contacts
- `DELETE /api/contacts/:id` — Supprimer un contact
- `POST /api/contacts/import` — Import CSV (multipart/form-data)

### Pools
- `GET /api/pools` — Liste des pools avec stats (total, contactés, disponibles)
- `POST /api/pools` — Créer un pool
- `DELETE /api/pools/:id` — Supprimer un pool
- `GET /api/pools/:id/contacts` — Contacts d'un pool avec statut campagne
- `POST /api/pools/:id/import` — Import CSV dans un pool (multipart/form-data)
- `DELETE /api/pools/:poolId/contacts/:contactId` — Retirer un contact d'un pool
- `DELETE /api/pools/:id/contacts` — Vider un pool

### Templates
- `GET /api/templates` — Templates locaux
- `POST /api/templates` — Ajouter un template
- `DELETE /api/templates/:id` — Supprimer un template
- `GET /api/templates/meta` — Récupérer templates depuis Meta
- `POST /api/templates/import-meta` — Importer un template Meta en local

### Campagnes
- `GET /api/campaigns` — Liste des campagnes
- `POST /api/campaigns` — Créer une campagne (name, template_id, contact_ids)
- `DELETE /api/campaigns/:id` — Supprimer une campagne
- `POST /api/campaigns/send` — Lancer l'envoi d'une campagne

### Messages
- `GET /api/messages?phone=` — Historique des messages
- `POST /api/send/text` — Envoyer un message texte
- `POST /api/send/template` — Envoyer un template

### Stats
- `GET /api/stats` — Stats dashboard

### Webhook
- `GET /webhook` — Vérification Meta (challenge)
- `POST /webhook` — Réception messages et statuts WhatsApp

## Conventions

- Les numéros de téléphone sont stockés au format international sans le "+" (ex: 33612345678)
- Les séparateurs CSV supportés : ";" (par défaut)
- L'API utilise JSON pour les requêtes/réponses, sauf les imports CSV (multipart/form-data)
- Les templates Meta doivent être approuvés avant utilisation
- Le frontend est une SPA : navigation via `data-page` attributes, pages affichées/cachées par CSS
- Les variables d'environnement : `DATABASE_URL`, `META_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
- La config est stockée en DB (table `config`) et surcharge les variables d'environnement

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `PORT` | Port du serveur (défaut: 3000) |
| `META_ACCESS_TOKEN` | Token Meta (fallback si pas en DB) |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID (fallback) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Business Account ID (fallback) |
