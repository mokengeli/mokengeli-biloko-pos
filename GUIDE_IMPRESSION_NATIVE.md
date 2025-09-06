# 📖 Guide d'Impression Native avec EAS Build

## 🎯 Vue d'ensemble

Ce guide explique comment utiliser l'impression thermique native dans l'application Mokengeli Biloko POS grâce à EAS Build et au config plugin Expo.

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│     App Expo (JavaScript)       │
├─────────────────────────────────┤
│    NativePrinterService.ts      │
├─────────────────────────────────┤
│  react-native-esc-pos-printer   │  ← Module natif (après build)
├─────────────────────────────────┤
│   Config Plugin (prebuild)      │
├─────────────────────────────────┤
│      Imprimante ESC/POS        │
└─────────────────────────────────┘
```

## ⚠️ Important : Différences Dev vs Production

### En Développement Local (Expo Go)
- ❌ **Module natif NON disponible**
- ❌ **Impression ne fonctionne PAS**
- ✅ **Interface utilisateur testable**
- ⚠️ **Message d'alerte expliquant la limitation**

### Après Build EAS (APK/IPA)
- ✅ **Module natif DISPONIBLE**
- ✅ **Impression FONCTIONNE**
- ✅ **Connexion TCP directe**
- ✅ **Support Bluetooth, Wi-Fi, USB**

## 🚀 Marche à Suivre pour le Build

### 1. Prérequis

```bash
# Installer EAS CLI globalement si pas déjà fait
npm install -g eas-cli

# Se connecter à votre compte Expo
eas login
```

### 2. Configuration du Projet

Vérifiez que le projet ID est configuré :

```bash
# Initialiser EAS dans le projet
eas build:configure
```

Cela va créer/mettre à jour le projectId dans `app.config.js`.

### 3. Lancer le Build de Développement

Pour tester rapidement avec l'impression native :

```bash
# Build APK de développement (Android)
eas build --platform android --profile development

# OU pour iOS (nécessite compte Apple Developer)
eas build --platform ios --profile development
```

### 4. Télécharger et Installer l'APK

1. **Attendez** que le build se termine (~15-20 minutes)
2. **Téléchargez** l'APK depuis le lien fourni par EAS
3. **Installez** sur votre appareil Android :
   - Transférez l'APK sur votre téléphone
   - Activez "Sources inconnues" dans les paramètres
   - Installez l'APK

### 5. Tester l'Impression

1. **Ouvrez** l'app installée
2. **Allez** dans Configuration → Imprimantes
3. **Ajoutez** une imprimante avec son IP
4. **Cliquez** "Imprimer Test"
5. **✅ Le ticket devrait sortir !**

## 🔧 Configuration des Imprimantes

### Imprimantes Wi-Fi
```
IP: 192.168.1.100
Port: 9100 (par défaut)
```

### Imprimantes Bluetooth
```
Adresse: AA:BB:CC:DD:EE:FF
(Format MAC Address)
```

## 📝 Structure du Code

### Config Plugin
```
plugins/withThermalPrinter.js
```
- Configure les permissions Android/iOS
- Ajoute les features hardware
- Injecte les protocoles supportés

### Service Native
```
src/services/NativePrinterService.ts
```
- Interface avec `react-native-esc-pos-printer`
- Gestion connexion/déconnexion
- Génération tickets ESC/POS

### App Config
```
app.config.js
```
- Active le plugin
- Configure les permissions
- Définit les paramètres de build

## 🐛 Dépannage

### "Module natif non disponible"
**Cause** : Vous êtes en Expo Go
**Solution** : Faites un build EAS

### "Connexion échouée"
**Causes possibles** :
- Mauvaise IP/Port
- Imprimante éteinte
- Problème réseau
- Firewall

### "Impression échoue après connexion"
**Causes possibles** :
- Imprimante non compatible ESC/POS
- Buffer plein
- Papier manquant

## 🔄 Workflow de Développement

1. **Développez** l'UI avec Expo Go
2. **Testez** la logique métier
3. **Build EAS** pour tester l'impression
4. **Itérez** si nécessaire

## 📊 Profiles de Build

### Development
```bash
eas build --profile development
```
- APK avec client de développement
- Rechargement à chaud possible
- Debug activé

### Preview
```bash
eas build --profile preview
```
- APK de test pour distribution interne
- Optimisé mais debuggable

### Production
```bash
eas build --profile production
```
- Bundle optimisé
- Prêt pour les stores
- Pas de debug

## 🎯 Commandes Utiles

```bash
# Voir les builds en cours
eas build:list

# Annuler un build
eas build:cancel

# Voir les détails d'un build
eas build:view

# Nettoyer le cache prebuild local
npx expo prebuild --clear
```

## 💡 Tips

1. **Testez d'abord** avec un build de développement
2. **Gardez l'IP** de l'imprimante fixe (DHCP statique)
3. **Vérifiez les permissions** dans les paramètres Android
4. **Utilisez le port 9100** pour les imprimantes réseau
5. **Redémarrez l'imprimante** si connexion instable

## 📚 Ressources

- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [react-native-esc-pos-printer](https://github.com/tr3v3r/react-native-esc-pos-printer)
- [ESC/POS Commands Reference](http://content.epson.de/fileadmin/content/files/RSD/downloads/escpos.pdf)

## ✅ Checklist Avant Production

- [ ] Tester sur plusieurs modèles d'imprimantes
- [ ] Vérifier les permissions sur Android 12+
- [ ] Tester reconnexion après perte réseau
- [ ] Valider format des tickets
- [ ] Optimiser taille de l'APK
- [ ] Configurer les certificats de signature

---

**Support** : Pour toute question, contactez l'équipe de développement Mokengeli Biloko.