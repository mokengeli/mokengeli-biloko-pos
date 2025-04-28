// src/screens/kitchen/KitchenHomeScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, SectionList } from "react-native";
import {
  Appbar,
  Text,
  ActivityIndicator,
  Surface,
  useTheme,
  Divider,
  Portal,
  Dialog,
  Button,
  Snackbar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../contexts/AuthContext";
import { RolesUtils, Role } from "../../utils/roles";
import { KitchenFilter } from "../../components/kitchen/KitchenFilter";
import { OrderCard } from "../../components/kitchen/OrderCard";
import { NotAvailableDialog } from "../../components/common/NotAvailableDialog";
import orderService, { DomainOrder } from "../../api/orderService";
import {
  webSocketService,
  OrderNotification,
} from "../../services/WebSocketService";

export const KitchenHomeScreen = () => {
  const { user, logout } = useAuth();
  const theme = useTheme();

  // États
  const [pendingOrders, setPendingOrders] = useState<DomainOrder[]>([]);
  const [readyOrders, setReadyOrders] = useState<DomainOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notAvailableDialog, setNotAvailableDialog] = useState({
    visible: false,
    featureName: "",
  });

  // États pour la gestion des erreurs
  const [errorDialog, setErrorDialog] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const [snackbarError, setSnackbarError] = useState({
    visible: false,
    message: "",
  });

  const [infoSnackbar, setInfoSnackbar] = useState({
    visible: false,
    message: "",
  });

  // Fonction pour montrer une notification informative
  const showInfoSnackbar = (message: string) => {
    setInfoSnackbar({
      visible: true,
      message,
    });
  };

  // Fonction pour afficher une erreur dans une boîte de dialogue
  const showErrorDialog = (title: string, message: string) => {
    setErrorDialog({
      visible: true,
      title,
      message,
    });
  };

  // Fonction pour afficher une erreur dans une snackbar
  const showErrorSnackbar = (message: string) => {
    setSnackbarError({
      visible: true,
      message,
    });
  };

  // Chargement des commandes
  const loadOrders = useCallback(async () => {
    if (!user?.tenantCode) {
      showErrorSnackbar("Code de restaurant non disponible");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Chargement des commandes
      const pendingResponse = await orderService.getOrdersByState("PENDING");
      setPendingOrders(pendingResponse);

      const readyResponse = await orderService.getOrdersByState("READY");
      setReadyOrders(readyResponse);
    } catch (err: any) {
      console.error("Error loading orders:", err);
      // Afficher l'erreur dans une snackbar sans bloquer l'interface
      showErrorSnackbar("Erreur lors du chargement des commandes");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantCode]);

  // Actualiser les données
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  // Filtrage par catégorie
  const handleCategorySelect = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((cat) => cat !== category)
        : [...prev, category]
    );
  };

  // Marquer un plat comme prêt
  const handleMarkAsReady = async (itemId: number) => {
    try {
      await orderService.prepareOrderItem(itemId);
      loadOrders();
    } catch (err: any) {
      console.error("Error marking item as ready:", err);

      // Afficher une erreur détaillée mais non bloquante
      if (err.response) {
        // Erreur de réponse du serveur
        showErrorDialog(
          "Erreur lors de la mise à jour",
          `Le serveur a répondu avec une erreur: ${err.response.status} ${
            err.response.statusText || ""
          }`
        );
      } else if (err.request) {
        // Requête envoyée mais pas de réponse
        showErrorDialog(
          "Erreur de connexion",
          "La requête a été envoyée mais aucune réponse n'a été reçue. Vérifiez votre connexion internet."
        );
      } else {
        // Erreur lors de la configuration de la requête
        showErrorDialog(
          "Erreur de requête",
          err.message ||
            "Une erreur s'est produite lors de la mise à jour du statut du plat"
        );
      }
    }
  };

  // Rejeter un plat
  const handleRejectItem = async (itemId: number) => {
    try {
      await orderService.rejectDish(itemId);
      loadOrders();
    } catch (err: any) {
      console.error("Error rejecting item:", err);

      // Afficher une erreur détaillée mais non bloquante
      if (err.response) {
        showErrorDialog(
          "Erreur lors du rejet du plat",
          `Le serveur a répondu avec une erreur: ${err.response.status} ${
            err.response.statusText || ""
          }`
        );
      } else if (err.request) {
        showErrorDialog(
          "Erreur de connexion",
          "La requête a été envoyée mais aucune réponse n'a été reçue. Vérifiez votre connexion internet."
        );
      } else {
        showErrorDialog(
          "Erreur de requête",
          err.message || "Une erreur s'est produite lors du rejet du plat"
        );
      }
    }
  };

  // Obtenir toutes les catégories uniques
  const getAllCategories = () => {
    const categories = new Set<string>();

    [...pendingOrders, ...readyOrders].forEach((order) => {
      order.items.forEach((item) => {
        if (item.categories && item.categories.length > 0) {
          item.categories.forEach((category) => categories.add(category));
        }
      });
    });

    return Array.from(categories);
  };

  // Gestion des WebSockets pour les mises à jour en temps réel
  useEffect(() => {
    if (!user?.tenantCode) return;

    // Se connecter au WebSocket au montage du composant
    webSocketService.connect(user.tenantCode).catch((error) => {
      console.error("WebSocket connection error:", error);
      showErrorSnackbar(
        "Erreur de connexion au service de mise à jour en temps réel"
      );
    });

    // S'abonner aux notifications
    const unsubscribe = webSocketService.addSubscription(
      user.tenantCode,
      handleOrderNotification
    );

    // Nettoyage à la destruction du composant
    return () => {
      unsubscribe();
    };
  }, [user?.tenantCode]);

  // Gestionnaire de notifications WebSocket
  const handleOrderNotification = useCallback(
    (notification: OrderNotification) => {
      console.log("Processing notification:", notification);

      // Recharger les données suite à une notification
      // Autre option: mettre à jour sélectivement les commandes concernées
      loadOrders();

      // Afficher une notification à l'utilisateur pour indiquer la mise à jour
      showInfoSnackbar(
        `Commande #${notification.orderId} mise à jour: ${notification.newState}`
      );
    },
    [loadOrders]
  );

  // Chargement initial et à chaque focus
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  // Filtrer les commandes selon les catégories sélectionnées
  const getFilteredOrders = (orders: DomainOrder[]) => {
    if (selectedCategories.length === 0) return orders;

    return orders
      .map((order) => ({
        ...order,
        items: order.items.filter(
          (item) =>
            item.categories &&
            item.categories.some((category) =>
              selectedCategories.includes(category)
            )
        ),
      }))
      .filter((order) => order.items.length > 0);
  };

  const filteredPendingOrders = getFilteredOrders(pendingOrders);
  const filteredReadyOrders = getFilteredOrders(readyOrders);

  // Préparer les données pour la SectionList
  const sections = [
    {
      title: `Commandes à préparer (${filteredPendingOrders.length})`,
      data: filteredPendingOrders,
      status: "PENDING" as const,
    },
    {
      title: `Commandes prêtes à servir (${filteredReadyOrders.length})`,
      data: filteredReadyOrders,
      status: "READY" as const,
    },
  ];

  // Affichage de chargement
  if (
    isLoading &&
    !refreshing &&
    pendingOrders.length === 0 &&
    readyOrders.length === 0
  ) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement des commandes...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content
          title="Mokengeli Biloko POS - Cuisine"
          subtitle={`${RolesUtils.getRoleDescription(Role.COOK)}: ${
            user?.firstName || ""
          } ${user?.lastName || ""}`}
        />
        <Appbar.Action
          icon="refresh"
          onPress={onRefresh}
          disabled={refreshing}
        />
        <Appbar.Action icon="logout" onPress={logout} />
      </Appbar.Header>

      {/* Filtres de catégories */}
      <KitchenFilter
        categories={getAllCategories()}
        selectedCategories={selectedCategories}
        onSelectCategory={handleCategorySelect}
      />

      {/* Liste des commandes */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, section }) => (
          <OrderCard
            order={item}
            status={section.status}
            onMarkAsReady={handleMarkAsReady}
            onReject={handleRejectItem}
            style={styles.orderCard}
          />
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Divider style={styles.divider} />
          </View>
        )}
        stickySectionHeadersEnabled={true}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucune commande disponible</Text>
          </View>
        }
      />

      {/* Dialogue pour les fonctionnalités non disponibles */}
      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        onDismiss={() =>
          setNotAvailableDialog({ visible: false, featureName: "" })
        }
        featureName={notAvailableDialog.featureName}
      />

      {/* Dialogue d'erreur */}
      <Portal>
        <Dialog
          visible={errorDialog.visible}
          onDismiss={() => setErrorDialog({ ...errorDialog, visible: false })}
        >
          <Dialog.Title style={styles.errorDialogTitle}>
            {errorDialog.title}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={styles.errorDialogMessage}>{errorDialog.message}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setErrorDialog({ ...errorDialog, visible: false })}
            >
              Fermer
            </Button>
            <Button
              onPress={() => {
                setErrorDialog({ ...errorDialog, visible: false });
                onRefresh();
              }}
            >
              Réessayer
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Snackbar d'information pour les notifications WebSocket */}
      <Snackbar
        visible={infoSnackbar.visible}
        onDismiss={() => setInfoSnackbar({ ...infoSnackbar, visible: false })}
        duration={3000}
        style={styles.infoSnackbar}
      >
        {infoSnackbar.message}
      </Snackbar>
      {/* Snackbar d'erreur */}
      <Snackbar
        visible={snackbarError.visible}
        onDismiss={() => setSnackbarError({ ...snackbarError, visible: false })}
        duration={4000}
        action={{
          label: "Réessayer",
          onPress: onRefresh,
        }}
        style={styles.errorSnackbar}
      >
        {snackbarError.message}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  appbar: {
    height: 56,
    paddingTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  sectionHeader: {
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  divider: {
    height: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  orderCard: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
  },
  errorDialogTitle: {
    color: "#D32F2F",
  },
  errorDialogMessage: {
    fontSize: 16,
  },
  errorSnackbar: {
    backgroundColor: "#D32F2F",
  },
  infoSnackbar: {
    backgroundColor: "#4CAF50", // Vert pour les mises à jour
  },
});
