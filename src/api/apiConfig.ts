// src/api/apiConfig.ts
import axios from 'axios';
import env from '../config/environment';
import { EventRegister } from 'react-native-event-listeners';

// Créer une constante pour identifier notre événement custom de déconnexion forcée
export const FORCE_LOGOUT_EVENT = 'FORCE_LOGOUT_EVENT';

// Créer une instance axios avec des configurations par défaut
const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 10000,
  withCredentials: true, // Pour permettre l'envoi et la réception de cookies
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
});

console.log({url: env.apiUrl})

// Flag pour éviter les boucles infinies de déconnexion forcée
let isHandlingForceLogout = false;

// Intercepteur pour gérer les réponses et les erreurs
api.interceptors.response.use(
  response => response,
  error => {
    // Extraire le code d'erreur HTTP
    const statusCode = error.response?.status;
    
    // Gérer spécifiquement les erreurs 401 et 429
    if ((statusCode === 401 || statusCode === 429) && !isHandlingForceLogout) {
      isHandlingForceLogout = true;
      
      console.log(`Erreur ${statusCode} détectée: déclenchement de la déconnexion forcée`);
      
      // Message approprié selon le code d'erreur
      const message = statusCode === 401 
        ? 'Votre session a expiré. Veuillez vous reconnecter.'
        : 'Vous avez atteint le nombre maximum de sessions actives. Veuillez vous reconnecter.';
      
      // Émettre l'événement pour la déconnexion forcée
      EventRegister.emit(FORCE_LOGOUT_EVENT, {
        code: statusCode,
        message: message
      });
      
      // Réinitialiser le flag après un court délai
      setTimeout(() => {
        isHandlingForceLogout = false;
      }, 2000);
    }
    
    // Toujours rejeter l'erreur pour la chaîne de promesses
    return Promise.reject(error);
  }
);

export default api;