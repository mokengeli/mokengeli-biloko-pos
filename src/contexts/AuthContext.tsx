// src/contexts/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import authService, { User, LoginCredentials } from '../api/authService';
// CHANGEMENT: Migration vers Socket.io
import { socketIOService } from '../services/SocketIOService';
import { EventRegister } from 'react-native-event-listeners';
import { FORCE_LOGOUT_EVENT } from '../api/apiConfig';

// Type de contexte d'authentification
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  forceLogoutReason: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearForceLogoutReason: () => void;
}

// Créer le contexte
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hook personnalisé pour utiliser le contexte
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Props du fournisseur d'authentification
interface AuthProviderProps {
  children: React.ReactNode;
}

// Composant fournisseur d'authentification
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [forceLogoutReason, setForceLogoutReason] = useState<string | null>(null);
  const [forceLogoutListener, setForceLogoutListener] = useState<any>(null);

  // Fonction pour effacer les erreurs
  const clearError = () => setError(null);
  
  // Fonction pour effacer la raison de déconnexion forcée
  const clearForceLogoutReason = () => setForceLogoutReason(null);

  // Écouter l'événement de déconnexion forcée
  useEffect(() => {
    // Créer un écouteur pour l'événement FORCE_LOGOUT_EVENT
    const listener = EventRegister.addEventListener(FORCE_LOGOUT_EVENT, (data: any) => {
      console.log('Événement de déconnexion forcée reçu:', data);
      // Stocker la raison de la déconnexion forcée
      setForceLogoutReason(data.message || 'Votre session a été déconnectée.');
      // Effectuer le processus de déconnexion
      handleForceLogout();
    });
    
    // Stocker la référence de l'écouteur pour le nettoyage
    setForceLogoutListener(listener);
    
    // Nettoyage à la destruction du composant
    return () => {
      if (forceLogoutListener) {
        EventRegister.removeEventListener(forceLogoutListener);
      }
    };
  }, []);

  // Fonction pour gérer la déconnexion forcée
  const handleForceLogout = async () => {
    setIsLoading(true);
    try {
      // CHANGEMENT: Fermer la connexion Socket.io
      await socketIOService.disconnect();
      
      // Utiliser la méthode spéciale de déconnexion forcée
      await authService.forceLogout();
      
      // Réinitialiser l'état utilisateur
      setUser(null);
    } catch (err) {
      console.error('Erreur lors de la déconnexion forcée:', err);
      // En cas d'erreur grave, nettoyage minimal
      await authService.cleanLocalStorage();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Vérifier l'état d'authentification au chargement
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const isAuth = await authService.isAuthenticated();
        if (isAuth) {
          const userData = await authService.getCurrentUser();
          setUser(userData);
          
          // CHANGEMENT: Si l'utilisateur est authentifié et a un tenant, connecter Socket.io
          if (userData?.tenantCode) {
            console.log('[AuthContext] User authenticated, connecting Socket.io...');
            socketIOService.connect(userData.tenantCode).catch(err => {
              console.error('[AuthContext] Failed to connect Socket.io:', err);
              // Ne pas bloquer l'authentification si Socket.io échoue
            });
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Fonction pour extraire le message d'erreur de la réponse du serveur
  const extractErrorMessage = (err: any): string => {
    if (err.response && err.response.data) {
      const { data } = err.response;
      
      // Format spécifique: {"message": ["Login failed: Bad credentials"], "timeStamp": "...", "uuidTechnique": null}
      if (data.message && Array.isArray(data.message) && data.message.length > 0) {
        return data.message[0];
      } else if (data.message && typeof data.message === 'string') {
        return data.message;
      }
    }
    
    // Message par défaut
    return 'Connexion échouée. Veuillez vérifier vos informations de connexion.';
  };

  // Fonction de connexion
  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await authService.login(credentials);
      setUser(userData);
      
      // CHANGEMENT: Connexion automatique à Socket.io après login réussi
      if (userData?.tenantCode) {
        console.log('[AuthContext] Login successful, connecting Socket.io...');
        // Connexion asynchrone sans bloquer le processus de login
        socketIOService.connect(userData.tenantCode).catch(err => {
          console.error('[AuthContext] Failed to connect Socket.io after login:', err);
          // Ne pas propager l'erreur Socket.io, l'utilisateur est déjà connecté
        });
      }
    } catch (err: any) {
      console.error('Login error in context:', err);
      
      // Extraire le message d'erreur approprié
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction de déconnexion
  const logout = async () => {
    setIsLoading(true);
    try {
      // CHANGEMENT: Fermer la connexion Socket.io
      console.log('[AuthContext] Logging out, disconnecting Socket.io...');
      await socketIOService.disconnect();
      
      // Appeler le service d'authentification pour se déconnecter côté serveur
      await authService.logout();
      
      // Réinitialiser l'état utilisateur
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      // Continuer le processus de déconnexion même en cas d'erreur
      setUser(null);
      
      // S'assurer que Socket.io est bien déconnecté même en cas d'erreur
      try {
        await socketIOService.disconnect();
      } catch (socketError) {
        console.error('Error disconnecting Socket.io during logout:', socketError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // AMÉLIORATION: Gérer la reconnexion Socket.io si le tenant change
  useEffect(() => {
    if (user?.tenantCode) {
      const currentTenant = socketIOService.getTenantCode();
      
      // Si le tenant a changé ou si non connecté, reconnecter
      if (currentTenant !== user.tenantCode || !socketIOService.isConnected()) {
        console.log('[AuthContext] Tenant changed or not connected, reconnecting Socket.io...');
        socketIOService.connect(user.tenantCode).catch(err => {
          console.error('[AuthContext] Failed to reconnect Socket.io:', err);
        });
      }
    }
  }, [user?.tenantCode]);

  // Valeur du contexte
  const value = {
    user,
    isLoading,
    error,
    forceLogoutReason,
    login,
    logout,
    clearError,
    clearForceLogoutReason,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};