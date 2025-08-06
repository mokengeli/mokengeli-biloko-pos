// src/components/kitchen/OrderCard.tsx
import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import {
  Card,
  Text,
  Button,
  Chip,
  Divider,
  Badge,
  IconButton,
  List,
  Modal,
  Portal,
  Surface,
  useTheme,
} from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { DomainOrder, DomainOrderItem } from "../../api/orderService";

interface OrderCardProps {
  order: DomainOrder;
  status: "PENDING" | "READY";
  onMarkAsReady: (itemId: number) => void;
  onReject: (itemId: number) => void;
  style?: object;
  defaultExpanded?: boolean
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  status,
  onMarkAsReady,
  onReject,
  style,
  defaultExpanded= false,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selectedItem, setSelectedItem] = useState<DomainOrderItem | null>(
    null
  );
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [actionType, setActionType] = useState<"ready" | "reject">("ready");

  // Formatter la date de commande
  const formatOrderDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Calculer le temps écoulé depuis la commande
  const getElapsedTime = (dateString: string) => {
    const orderTime = new Date(dateString).getTime();
    const currentTime = new Date().getTime();
    const diffMinutes = Math.floor((currentTime - orderTime) / (1000 * 60));

    if (diffMinutes < 1) return "À l'instant";
    if (diffMinutes === 1) return "1 minute";
    if (diffMinutes < 60) return `${diffMinutes} minutes`;

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  // Obtenir la couleur selon le temps d'attente
  const getWaitTimeColor = (dateString: string) => {
    const diffMinutes = Math.floor(
      (new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60)
    );

    if (diffMinutes < 5) return theme.colors.success; // < 5 min: vert
    if (diffMinutes < 15) return theme.colors.warning; // 5-15 min: orange
    return theme.colors.error; // > 15 min: rouge
  };

  // Grouper les items par catégorie (si nécessaire)
  const groupItemsByCategory = () => {
    // Les items sont déjà triés par catégorie depuis l'API
    return order.items.filter(
      (item) => item.state === (status === "PENDING" ? "PENDING" : "READY")
    );
  };

  // Afficher la confirmation pour marquer comme prêt ou rejeter
  const showConfirmation = (
    item: DomainOrderItem,
    action: "ready" | "reject"
  ) => {
    setSelectedItem(item);
    setActionType(action);
    setConfirmModalVisible(true);
  };

  // Confirmer l'action
  const confirmAction = () => {
    if (!selectedItem) return;

    if (actionType === "ready") {
      onMarkAsReady(selectedItem.id);
    } else {
      onReject(selectedItem.id);
    }

    setConfirmModalVisible(false);
    setSelectedItem(null);
  };

  // Items filtrés selon le statut
  const filteredItems = order.items.filter(
    (item) => item.state === (status === "PENDING" ? "PENDING" : "READY")
  );

  // Si aucun item ne correspond au statut, ne pas afficher la carte
  if (filteredItems.length === 0) {
    return null;
  }

  // Couleur du bord vertical
  const waitTimeColor = getWaitTimeColor(order.orderDate);

  // Nouvelle approche : utiliser une View avec elevation pour l'ombre
  return (
    <View style={[styles.outerContainer, style]}>
      {/* Barre verticale colorée */}
      <View 
        style={[
          styles.waitTimeIndicator, 
          { backgroundColor: waitTimeColor }
        ]} 
      />
      
      {/* Contenu de la carte avec shadow */}
      <View style={styles.cardContainer}>
        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.headerRow}>
              <View style={styles.orderInfo}>
                <Text style={styles.orderNumber}>Commande #{order.id}</Text>
                <View style={styles.tableTimeContainer}>
                  <Text style={styles.tableText}>Table: {order.tableName}</Text>
                  <Text
                    style={[
                      styles.timeText,
                      { color: waitTimeColor },
                    ]}
                  >
                    {getElapsedTime(order.orderDate)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.expandButton}
                onPress={() => setExpanded(!expanded)}
              >
                <Icon
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={24}
                  color={theme.colors.primary}
                />
              </TouchableOpacity>
            </View>

            <Divider style={styles.divider} />

            {expanded ? (
              <View style={styles.itemsContainer}>
                {groupItemsByCategory().map((item, index) => {
                  // Vérifier si c'est un nouveau groupe de catégorie
                  const showCategoryHeader =
                    index === 0 ||
                    (index > 0 &&
                      item.categories[0] !==
                        groupItemsByCategory()[index - 1].categories[0]);

                  return (
                    <View key={item.id}>
                      {showCategoryHeader && (
                        <View style={styles.categoryHeader}>
                          <Text style={styles.categoryTitle}>
                            {item.categories[0]}
                          </Text>
                          <Divider style={styles.categoryDivider} />
                        </View>
                      )}

                      <View style={styles.itemRow}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>
                            {item.count}x {item.dishName}
                          </Text>
                          {item.note && (
                            <View style={styles.noteContainer}>
                              <Text style={styles.noteLabel}>Note:</Text>
                              <Text style={styles.noteText}>{item.note}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.itemActions}>
                          {status === "PENDING" ? (
                            <Button
                              mode="contained"
                              onPress={() => showConfirmation(item, "ready")}
                              style={styles.readyButton}
                              compact
                            >
                              Prêt
                            </Button>
                          ) : (
                            <Badge style={styles.readyBadge}>Prêt</Badge>
                          )}

                          {/* Afficher le bouton de rejet uniquement pour les plats en attente (PENDING) */}
                          {status === "PENDING" && (
                            <IconButton
                              icon="close"
                              size={20}
                              color={theme.colors.error}
                              onPress={() => showConfirmation(item, "reject")}
                              style={styles.rejectButton}
                            />
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.collapsedContent}>
                <Text style={styles.itemCount}>
                  {filteredItems.length}{" "}
                  {filteredItems.length > 1 ? "plats" : "plat"}
                </Text>
                <View style={styles.chipRow}>
                  {/* Afficher jusqu'à 3 catégories */}
                  {Array.from(
                    new Set(filteredItems.flatMap((item) => item.categories))
                  )
                    .slice(0, 3)
                    .map((category, index) => (
                      <Chip key={index} style={styles.categoryChip} compact>
                        {category}
                      </Chip>
                    ))}
                </View>
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      {/* Modal de confirmation */}
      <Portal>
        <Modal
          visible={confirmModalVisible}
          onDismiss={() => setConfirmModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {actionType === "ready"
                ? "Marquer comme prêt"
                : "Rejeter le plat"}
            </Text>
            <Text style={styles.modalText}>
              {actionType === "ready"
                ? `Confirmer que "${selectedItem?.dishName}" est prêt à servir?`
                : `Rejeter "${selectedItem?.dishName}" de la commande #${order.id}?`}
            </Text>
            <View style={styles.modalActions}>
              <Button
                onPress={() => setConfirmModalVisible(false)}
                style={styles.modalButton}
              >
                Annuler
              </Button>
              <Button
                mode="contained"
                onPress={confirmAction}
                style={styles.modalButton}
                buttonColor={
                  actionType === "ready"
                    ? theme.colors.primary
                    : theme.colors.error
                }
              >
                Confirmer
              </Button>
            </View>
          </Surface>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginBottom: 12,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  waitTimeIndicator: {
    width: 4,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  cardContainer: {
    flex: 1,
  },
  card: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    marginLeft: 0,
    elevation: 3,
  },
  cardContent: {
    paddingLeft: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderInfo: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "bold",
  },
  tableTimeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  tableText: {
    fontSize: 14,
  },
  timeText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  expandButton: {
    padding: 4,
  },
  divider: {
    marginVertical: 12,
  },
  itemsContainer: {
    marginTop: 8,
  },
  categoryHeader: {
    marginTop: 8,
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#666",
  },
  categoryDivider: {
    marginTop: 4,
    backgroundColor: "#ddd",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "500",
  },
  noteContainer: {
    marginTop: 4,
    flexDirection: "row",
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: "bold",
    marginRight: 4,
  },
  noteText: {
    fontSize: 12,
    fontStyle: "italic",
    flex: 1,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  readyButton: {
    marginRight: 4,
  },
  readyBadge: {
    backgroundColor: "#4CAF50",
    color: "white",
    marginRight: 8,
  },
  rejectButton: {
    margin: 0,
  },
  collapsedContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemCount: {
    fontSize: 14,
    fontWeight: "500",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap", // Permettre le retour à la ligne si nécessaire
    flex: 1, // Prendre tout l'espace disponible
  },
  categoryChip: {
    marginLeft: 4,
    marginBottom: 4, // Ajouter un espace en bas pour les lignes multiples
    height: 28, // Hauteur légèrement augmentée
    paddingHorizontal: 8, // Plus d'espace horizontal
  },
  categoryChipText: {
    fontSize: 12, // Taille de texte légèrement réduite pour éviter la troncature
  },
  // Styles pour la modal
  modalContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    padding: 20,
    borderRadius: 8,
    elevation: 4,
    width: "80%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalButton: {
    marginLeft: 8,
  },
});