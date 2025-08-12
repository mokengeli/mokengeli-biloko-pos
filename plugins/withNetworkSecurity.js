// plugins/withNetworkSecurity.js

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withNetworkSecurity(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      // Chemin source (à la racine du projet)
      const sourcePath = path.join(projectRoot, "network_security_config.xml");

      // Chemin destination dans Android
      const destDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "res",
        "xml"
      );

      const destPath = path.join(destDir, "network_security_config.xml");

      // Créer le dossier xml s'il n'existe pas
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        console.log("✅ Created xml directory");
      }

      // Copier le fichier s'il existe
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log("✅ network_security_config.xml copied successfully");
        console.log(`   From: ${sourcePath}`);
        console.log(`   To: ${destPath}`);
      } else {
        console.warn(
          "⚠️ network_security_config.xml not found at project root"
        );
        console.warn(`   Expected at: ${sourcePath}`);

        // Créer un fichier par défaut si nécessaire
        const defaultConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Configuration pour le développement -->
    <domain-config cleartextTrafficPermitted="true">
        <!-- Localhost et émulateurs -->
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
        
        <!-- Réseaux locaux pour les imprimantes -->
        <domain includeSubdomains="true">192.168.0.0</domain>
        <domain includeSubdomains="true">192.168.1.0</domain>
        <domain includeSubdomains="true">10.0.0.0</domain>
    </domain-config>
    
    <!-- Configuration par défaut -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system"/>
            <certificates src="user"/>
        </trust-anchors>
    </base-config>
</network-security-config>`;

        fs.writeFileSync(destPath, defaultConfig, "utf8");
        console.log("✅ Created default network_security_config.xml");
      }

      return config;
    },
  ]);
};
