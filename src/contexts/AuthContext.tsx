// src/contexts/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import authService, { User, LoginCredentials } from '../api/authService';

// Type de contexte d'authentification
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
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

  // Fonction pour effacer les erreurs
  const clearError = () => setError(null);

  // Vérifier l'état d'authentification au chargement
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const isAuth = await authService.isAuthenticated();
        if (isAuth) {
          const userData = await authService.getCurrentUser();
          setUser(userData);
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
      
      // Format spécifique mentionné: {"message": ["Login failed: Bad credentials"], "timeStamp": "...", "uuidTechnique": null}
      if (data.message && Array.isArray(data.message) && data.message.length > 0) {
        return data.message[0];
      } else if (data.message && typeof data.message === 'string') {
        return data.message;
      }
    }
    
    // Message par défaut si nous ne pouvons pas extraire un message spécifique
    return 'Connexion échouée. Veuillez vérifier vos informations de connexion.';
  };

  // Fonction de connexion
  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await authService.login(credentials);
      setUser(userData);
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
      await authService.logout();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Valeur du contexte
  const value = {
    user,
    isLoading,
    error,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};