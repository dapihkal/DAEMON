import * as CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';

const DB_KEY_IDENTIFIER = 'carnet_mobile_db_encryption_key';
let memoryDBCryptoKey: string | null = null;

// Initialiser ou récupérer la clé AES
export async function initDbEncryptionKey() {
  if (memoryDBCryptoKey) return memoryDBCryptoKey;

  try {
    let key = await SecureStore.getItemAsync(DB_KEY_IDENTIFIER);
    if (!key) {
      // Génère une clé AES de 256 bits (64 caractères Hex) de façon purement JS et déterministe par rapport au hasard/temps.
      // Cela évite d'importer tout module natif de génération de nombres aléatoires qui pourrait crasher.
      const rawSeed = Math.random().toString() + Date.now().toString() + Math.random().toString();
      key = CryptoJS.SHA256(rawSeed).toString(CryptoJS.enc.Hex);
      
      try {
        await SecureStore.setItemAsync(DB_KEY_IDENTIFIER, key, {
           keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        });
      } catch (storeError) {
        console.warn("SecureStore setItemAsync failed:", storeError);
      }
    }
    memoryDBCryptoKey = key;
    return key;
  } catch (error) {
    console.warn("SecureStore failed inside initDbEncryptionKey, using development key fallback:", error);
    // Clé de secours statique pour éviter de bloquer l'initialisation de la DB sur les simulateurs ou le web
    memoryDBCryptoKey = "carnet_mobile_development_static_aes_key_64_characters_long_val";
    return memoryDBCryptoKey;
  }
}

// Utilitaires synchrones pour la couche de données
export function encryptField(plainText: string | null | undefined): string {
  if (!plainText) return '';
  if (!memoryDBCryptoKey) {
     console.warn("La clé de base de données n'est pas chargée. Initialisez initDbEncryptionKey().");
     return plainText; // Fallback pour éviter de casser l'application en cours de démarrage
  }
  
  // Utiliser AES (le mode par défaut de crypto-js est CBC)
  return CryptoJS.AES.encrypt(plainText, memoryDBCryptoKey).toString();
}

export function decryptField(cipherText: string | null | undefined): string {
  if (!cipherText) return '';
  if (!memoryDBCryptoKey) {
     console.warn("La clé de base de données n'est pas chargée. Initialisez initDbEncryptionKey().");
     return cipherText; // Fallback pour éviter de casser l'application en cours de démarrage
  }
  
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, memoryDBCryptoKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    // Si bytes.toString() échoue ou renvoie vide sur un texte encodé classiquement, c'est que la clé ou le format est invalide
    return decrypted || cipherText;
  } catch (error) {
    // Fallback: Si le déchiffrement échoue, le composant était potentiellement en texte clair (avant chiffrement)
    // On retourne le texte en clair pour assurer la transition
    return cipherText;
  }
}
