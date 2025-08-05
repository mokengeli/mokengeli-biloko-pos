// src/screens/LoginScreen.tsx (Mise à jour pour afficher le message de déconnexion forcée)

import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import {
  TextInput,
  Button,
  Text,
  Banner,
  useTheme,
} from "react-native-paper";
import GlassSurface from "../components/common/GlassSurface";
import { Formik } from "formik";
import * as Yup from "yup";
import { useAuth } from "../contexts/AuthContext";

// Validation du schéma avec Yup
const LoginSchema = Yup.object().shape({
  username: Yup.string().required("Nom d'utilisateur requis"),
  password: Yup.string().required("Mot de passe requis"),
});

// Composant écran de connexion
export const LoginScreen: React.FC = () => {
  const { login, error, clearError, isLoading, forceLogoutReason, clearForceLogoutReason } = useAuth();
  const theme = useTheme();
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  // Gestionnaire de soumission du formulaire
  const handleSubmit = async (values: {
    username: string;
    password: string;
    platformType: string;
  }) => {
    try {
      setLocalError(null);
      await login(values);
    } catch (err) {
      // Les erreurs sont déjà gérées dans le contexte
      console.log("Handled in context");
    }
  };

  // Toggle pour afficher/masquer le mot de passe
  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  // Afficher les erreurs
  const showError = error || localError;
  
  // Effet pour effacer le message de déconnexion forcée après un certain temps
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (forceLogoutReason) {
      timer = setTimeout(() => {
        clearForceLogoutReason();
      }, 10000); // 10 secondes
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [forceLogoutReason, clearForceLogoutReason]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <GlassSurface style={[styles.surface]}> 
          <View style={styles.logoContainer}>
            <Text style={[styles.logoText, { color: theme.colors.primary }]}>Mokengeli Biloko POS</Text>
          </View>

          {/* Bannière pour le message de déconnexion forcée */}
          {forceLogoutReason && (
            <Banner
              visible={true}
              actions={[
                {
                  label: "Fermer",
                  onPress: clearForceLogoutReason,
                },
              ]}
              style={[styles.forceLogoutBanner, { backgroundColor: `${theme.colors.warning}20` }]}
              icon="alert-circle"
            >
              <Text style={[styles.forceLogoutText, { color: theme.colors.warning }]}>{forceLogoutReason}</Text>
            </Banner>
          )}

          {showError && (
            <Banner
              visible={true}
              actions={[
                {
                  label: "Fermer",
                  onPress: clearError,
                },
              ]}
              style={[styles.errorBanner, { backgroundColor: `${theme.colors.error}20` }]}
              icon="alert-circle"
            >
              <Text style={[styles.errorBannerText, { color: theme.colors.error }]}>{showError}</Text>
            </Banner>
          )}

          <Text style={[styles.title, { color: theme.colors.text }]}>Connexion</Text>

          <Formik
            initialValues={{
              username: "",
              password: "",
              platformType: "PHONE",
            }}
            validationSchema={LoginSchema}
            onSubmit={handleSubmit}
          >
            {({
              handleChange,
              handleBlur,
              handleSubmit,
              values,
              errors,
              touched,
            }) => (
              <View style={styles.form}>
                <TextInput
                  label="Nom d'utilisateur"
                  value={values.username}
                  onChangeText={handleChange("username")}
                  onBlur={handleBlur("username")}
                  error={touched.username && !!errors.username}
                  style={styles.input}
                  autoCapitalize="none"
                  disabled={isLoading}
                />
                {touched.username && errors.username && (
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.username}</Text>
                )}

                <TextInput
                  label="Mot de passe"
                  value={values.password}
                  onChangeText={handleChange("password")}
                  onBlur={handleBlur("password")}
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
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>{errors.password}</Text>
                )}

                <Button
                  mode="contained"
                  onPress={() => handleSubmit()}
                  style={styles.button}
                  disabled={isLoading}
                  loading={isLoading}
                >
                  {isLoading ? "Connexion en cours..." : "Se connecter"}
                </Button>
              </View>
            )}
          </Formik>
        </GlassSurface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  surface: {
    padding: 30,
    elevation: 4,
    width: "100%",
    maxWidth: 400,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoText: {
    fontSize: 28,
    fontWeight: "bold",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  input: {
    marginBottom: 5,
    backgroundColor: "transparent",
  },
  errorText: {
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 5,
  },
  errorBanner: {
    marginBottom: 20,
  },
  errorBannerText: {},
  forceLogoutBanner: {
    marginBottom: 20,
  },
  forceLogoutText: {},
  button: {
    marginTop: 20,
    paddingVertical: 6,
  },
});
