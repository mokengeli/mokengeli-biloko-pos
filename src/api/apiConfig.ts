//src/api/apiConfig.ts

import axios from 'axios';
import env from '../config/environment';

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
// Intercepteur pour gérer les réponses et les erreurs
api.interceptors.response.use(
  response => response,
  error => {
    // Gérer les erreurs globalement
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;