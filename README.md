# Bot de Prospection WhatsApp

Bot d'automatisation pour envoyer des messages de prospection via WhatsApp Business API de Meta.

## 🚀 Démarrage rapide

### 1. Installer les dépendances
```bash
npm install
```

### 2. Démarrer le serveur
```bash
npm start
```

L'application sera accessible à : **http://localhost:3000**

---

## ⚙️ Configuration Meta (Important)

### Accéder à l'interface de configuration
1. Ouvre [http://localhost:3000/config](http://localhost:3000/config)
2. Remplis les champs suivants avec tes informations Meta

### Informations à récupérer

#### 📱 **Token d'accès**
- Va à : [https://developers.facebook.com/tools/explorer/](https://developers.facebook.com/tools/explorer/)
- Sélectionne ton app **"Bot de prospection WA"**
- Clique sur le dropdown du token
- Sélectionne **"Obtenir un token d'accès utilisateur"**
- Accepte les permissions et copie le token généré

#### 📞 **Phone Number ID**
- Va à : [https://business.facebook.com/](https://business.facebook.com/)
- Clique sur **"Paramètres"** → **"Comptes WhatsApp"**
- Sélectionne ton compte WhatsApp
- Onglet **"Numéros de téléphone"**
- Tu trouveras le **Phone Number ID** associé à ton numéro

#### 🏢 **WhatsApp Business Account ID (WABA ID)**
- Même endroit que ci-dessus (Comptes WhatsApp)
- Onglet **"Récapitulatif"** ou dans les infos du compte
- L'ID commence par un nombre long (ex: 442946952244271)

#### 🔐 **Token de vérification Webhook**
- Choisis une chaîne secrète (ex: `mokonzi_webhook_2024`)
- Cette clé doit être la même partout
- **Important** : Configure ce token aussi dans Meta Developers
  - Va à ton app → **WhatsApp** → **Configuration**
  - Section **Webhooks** → rentre le même token de vérification

### Exemple de remplissage
```
Token d'accès: EAAxxxxxxxxxxxxxxxxxx
Phone Number ID: 123456789012345
Business Account ID: 987654321098765
Token de vérification: mon_token_secret_123
```

---

## 📚 Ressources utiles

- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Facebook Business Manager](https://business.facebook.com/)
- [Developer Dashboard](https://developers.facebook.com/apps/)

---

## ✅ Checklist de configuration

- [x] App créée dans Meta Developers
- [x] Cas d'utilisation "WhatsApp" sélectionné
- [x] Token d'accès généré
- [x] Phone Number ID récupéré
- [x] Business Account ID récupéré
- [x] Interface de configuration remplie
- [x] Connexion testée avec succès

---

## 🔗 Liens rapides

| Action | Lien |
|--------|------|
| **Configuration du bot (Local)** | [http://localhost:3000/config](http://localhost:3000/config) |
| **Configuration du bot (Production)** | [https://monkonzi-v3.vercel.app/config](https://monkonzi-v3.vercel.app/config) |
| **Meta Developers** | [https://developers.facebook.com/](https://developers.facebook.com/) |
| **Business Manager** | [https://business.facebook.com/](https://business.facebook.com/) |
| **API Explorer** | [https://developers.facebook.com/tools/explorer/](https://developers.facebook.com/tools/explorer/) |

---

## 📝 Notes

- Les tokens d'accès Meta expirent après 60 jours
- Garde tes tokens secrets et ne les partage jamais
- Utilise des variables d'environnement pour stocker les données sensibles en production
