// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { TextInput, Button, Text, Snackbar, Surface, ActivityIndicator, Banner } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../contexts/AuthContext';

// Validation du schéma avec Yup
const LoginSchema = Yup.object().shape({
  username: Yup.string()
    .required('Nom d\'utilisateur requis'),
  password: Yup.string()
    .required('Mot de passe requis'),
});

// Composant écran de connexion
export const LoginScreen: React.FC = () => {
  const { login, error, clearError, isLoading } = useAuth();
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  // Gestionnaire de soumission du formulaire
  const handleSubmit = async (values: { username: string; password: string }) => {
    try {
      setLocalError(null);
      await login(values);
    } catch (err) {
      // Les erreurs sont déjà gérées dans le contexte
      console.log('Handled in context');
    }
  };

  // Toggle pour afficher/masquer le mot de passe
  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  // Afficher les erreurs
  const showError = error || localError;
  
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Surface style={styles.surface}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Mokengeli Biloko POS</Text>
          </View>
          
          {showError && (
            <Banner
              visible={true}
              actions={[
                {
                  label: 'Fermer',
                  onPress: clearError,
                },
              ]}
              style={styles.errorBanner}
              icon="alert-circle"
            >
              <Text style={styles.errorBannerText}>{showError}</Text>
            </Banner>
          )}
          
          <Text style={styles.title}>Connexion</Text>
          
          <Formik
            initialValues={{ username: '', password: '' }}
            validationSchema={LoginSchema}
            onSubmit={handleSubmit}
          >
            {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
              <View style={styles.form}>
                <TextInput
                  label="Nom d'utilisateur"
                  value={values.username}
                  onChangeText={handleChange('username')}
                  onBlur={handleBlur('username')}
                  error={touched.username && !!errors.username}
                  style={styles.input}
                  autoCapitalize="none"
                  disabled={isLoading}
                />
                {touched.username && errors.username && (
                  <Text style={styles.errorText}>{errors.username}</Text>
                )}
                
                <TextInput
                  label="Mot de passe"
                  value={values.password}
                  onChangeText={handleChange('password')}
                  onBlur={handleBlur('password')}
                  secureTextEntry={secureTextEntry}
                  error={touched.password && !!errors.password}
                  style={styles.input}
                  right={
                    <TextInput.Icon 
                      icon={secureTextEntry ? "eye" : "eye-off"} 
                      onPress={toggleSecureEntry} 
                    />
                  }
                  disabled={isLoading}
                />
                {touched.password && errors.password && (
                  <Text style={styles.errorText}>{errors.password}</Text>
                )}
                
                <Button
                  mode="contained"
                  onPress={() => handleSubmit()}
                  style={styles.button}
                  disabled={isLoading}
                  loading={isLoading}
                >
                  {isLoading ? 'Connexion en cours...' : 'Se connecter'}
                </Button>
              </View>
            )}
          </Formik>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  surface: {
    padding: 30,
    borderRadius: 10,
    elevation: 4,
    width: '100%',
    maxWidth: 400,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0066CC',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 5,
    backgroundColor: 'transparent',
  },
  errorText: {
    color: '#B00020',
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 5,
  },
  errorBanner: {
    marginBottom: 20,
    backgroundColor: '#FFECEC',
  },
  errorBannerText: {
    color: '#B00020',
  },
  button: {
    marginTop: 20,
    paddingVertical: 6,
  },
});