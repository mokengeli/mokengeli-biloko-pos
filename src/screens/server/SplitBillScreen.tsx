// src/screens/server/SplitBillScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, FlatList } from 'react-native';
import { 
  Appbar, 
  Text, 
  Card, 
  Chip, 
  Divider, 
  Button, 
  Surface, 
  useTheme,
  IconButton,
  DataTable,
  TextInput,
  ToggleButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { DomainOrderItem } from '../../api/orderService';

// Type définitions pour la navigation
type SplitBillParamList = {
  SplitBill: {
    orderId: number;
    tableName?: string;
    billItems: BillItem[];
    totalAmount: number;
    splitType: 'perPerson' | 'custom';
    numberOfPeople: number;
    currency: string;
  };
};

type SplitBillScreenRouteProp = RouteProp<SplitBillParamList, 'SplitBill'>;
type SplitBillScreenNavigationProp = StackNavigationProp<SplitBillParamList, 'SplitBill'>;

interface SplitBillScreenProps {
  navigation: SplitBillScreenNavigationProp;
  route: SplitBillScreenRouteProp;
}

// Interface pour les éléments d'addition
interface BillItem extends DomainOrderItem {
  selected: boolean;
  discount?: number;
}

// Interface pour les personnes
interface Person {
  id: number;
  name: string;
  items: BillItem[];
  customAmount?: number; // Pour la saisie manuelle d'un montant
  useCustomAmount: boolean;
}

export const SplitBillScreen: React.FC<SplitBillScreenProps> = ({ navigation, route }) => {
  const { 
    orderId, 
    tableName, 
    billItems, 
    totalAmount, 
    splitType, 
    numberOfPeople,
    currency 
  } = route.params;
  
  const theme = useTheme();
  
  // États
  const [people, setPeople] = useState<Person[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<BillItem[]>([]);
  const [activePersonId, setActivePersonId] = useState<number | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [splitMode, setSplitMode] = useState<'items' | 'amount'>(
    splitType === 'perPerson' ? 'amount' : 'items'
  );
  
  // Initialiser les personnes et les articles lors du chargement
  useEffect(() => {
    // Créer les personnes
    const initialPeople: Person[] = Array.from({ length: numberOfPeople }, (_, index) => ({
      id: index + 1,
      name: `Personne ${index + 1}`,
      items: [],
      useCustomAmount: false
    }));
    
    setPeople(initialPeople);
    
    // Initialiser avec tous les articles non assignés
    setUnassignedItems([...billItems]);
    
    // Si le type de répartition est par personne, passer en mode montant
    if (splitType === 'perPerson') {
      setSplitMode('amount');
      // Répartir le montant total équitablement
      const equalShare = totalAmount / numberOfPeople;
      const updatedPeople = initialPeople.map(person => ({
        ...person,
        customAmount: equalShare,
        useCustomAmount: true
      }));
      setPeople(updatedPeople);
    }
  }, [billItems, numberOfPeople, splitType, totalAmount]);
  
  // Mettre à jour le nom d'une personne
  const updatePersonName = (id: number) => {
    if (!editingName.trim()) {
      Alert.alert('Erreur', 'Le nom ne peut pas être vide');
      return;
    }
    
    setPeople(prev => 
      prev.map(person => 
        person.id === id 
          ? { ...person, name: editingName } 
          : person
      )
    );
    
    setEditingPersonId(null);
    setEditingName('');
  };
  
  // Commencer l'édition du nom d'une personne
  const startEditingName = (person: Person) => {
    setEditingPersonId(person.id);
    setEditingName(person.name);
  };
  
  // Calculer le total pour une personne
  const calculatePersonTotal = (person: Person): number => {
    if (person.useCustomAmount && person.customAmount !== undefined) {
      return person.customAmount;
    }
    
    return person.items.reduce((total, item) => {
      const itemPrice = item.unitPrice * item.count;
      const discount = item.discount || 0;
      const discountedPrice = itemPrice * (1 - discount / 100);
      return total + discountedPrice;
    }, 0);
  };
  
  // Calculer le total de tous les articles assignés
  const calculateAssignedTotal = (): number => {
    return people.reduce((total, person) => total + calculatePersonTotal(person), 0);
  };
  
  // Calculer le total restant non assigné
  const calculateRemainingTotal = (): number => {
    const assignedTotal = calculateAssignedTotal();
    return totalAmount - assignedTotal;
  };
  
  // Assigner un article à une personne
  const assignItemToPerson = (personId: number, item: BillItem) => {
    // Retirer l'article des non assignés
    setUnassignedItems(prev => prev.filter(i => i.id !== item.id));
    
    // Ajouter l'article à la personne
    setPeople(prev => 
      prev.map(person => 
        person.id === personId
          ? { ...person, items: [...person.items, item] }
          : person
      )
    );
  };
  
  // Retirer un article d'une personne
  const removeItemFromPerson = (personId: number, itemId: number) => {
    // Récupérer l'article
    const person = people.find(p => p.id === personId);
    if (!person) return;
    
    const item = person.items.find(i => i.id === itemId);
    if (!item) return;
    
    // Retirer l'article de la personne
    setPeople(prev => 
      prev.map(p => 
        p.id === personId
          ? { ...p, items: p.items.filter(i => i.id !== itemId) }
          : p
      )
    );
    
    // Ajouter l'article aux non assignés
    setUnassignedItems(prev => [...prev, item]);
  };
  
  // Basculer entre mode articles et mode montant
  const toggleSplitMode = () => {
    // Si on passe de articles à montant, calculer les montants automatiquement
    if (splitMode === 'items') {
      const updatedPeople = people.map(person => ({
        ...person,
        customAmount: calculatePersonTotal(person),
        useCustomAmount: true
      }));
      setPeople(updatedPeople);
    } else {
      // Si on passe de montant à articles, désactiver les montants personnalisés
      const updatedPeople = people.map(person => ({
        ...person,
        useCustomAmount: false
      }));
      setPeople(updatedPeople);
    }
    
    setSplitMode(prev => prev === 'items' ? 'amount' : 'items');
  };
  
  // Mettre à jour le montant personnalisé d'une personne
  const updatePersonCustomAmount = (personId: number, amount: string) => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    
    if (isNaN(numericAmount) || numericAmount < 0) return;
    
    setPeople(prev => 
      prev.map(person => 
        person.id === personId
          ? { ...person, customAmount: numericAmount }
          : person
      )
    );
  };
  
  // Répartir équitablement les montants
  const distributeAmountsEvenly = () => {
    const equalShare = totalAmount / people.length;
    
    const updatedPeople = people.map(person => ({
      ...person,
      customAmount: equalShare,
      useCustomAmount: true
    }));
    
    setPeople(updatedPeople);
  };
  
  // Répartir équitablement les articles restants
  const distributeRemainingItemsEvenly = () => {
    if (unassignedItems.length === 0) return;
    
    // Copie des personnes et des articles pour manipulation
    const updatedPeople = [...people];
    const itemsToDistribute = [...unassignedItems];
    
    // Distribution circulaire
    let personIndex = 0;
    while (itemsToDistribute.length > 0) {
      const item = itemsToDistribute.shift();
      if (!item) break;
      
      updatedPeople[personIndex].items.push(item);
      
      // Passer à la personne suivante
      personIndex = (personIndex + 1) % updatedPeople.length;
    }
    
    setPeople(updatedPeople);
    setUnassignedItems([]); // Tous les articles sont maintenant assignés
  };
  
  // Vérifier si la répartition est valide
  const isSplitValid = (): boolean => {
    if (splitMode === 'items') {
      // En mode articles, tous les articles doivent être assignés
      return unassignedItems.length === 0;
    } else {
      // En mode montant, la somme des montants doit être égale au total
      const assignedTotal = calculateAssignedTotal();
      // Tolérance pour les erreurs d'arrondi
      return Math.abs(assignedTotal - totalAmount) < 0.01;
    }
  };
  
  // Passer à l'écran de paiement
  const proceedToPayment = () => {
    if (!isSplitValid()) {
      if (splitMode === 'items') {
        Alert.alert(
          "Articles non assignés",
          "Tous les articles doivent être assignés à une personne avant de continuer.",
          [{ text: "OK" }]
        );
      } else {
        const remaining = (totalAmount - calculateAssignedTotal()).toFixed(2);
        Alert.alert(
          "Montant incorrect",
          `Le total des montants assignés ne correspond pas au total de l'addition. Il reste ${remaining} ${currency} à répartir.`,
          [{ text: "OK" }]
        );
      }
      return;
    }
    
    // Préparer les données pour l'écran de paiement
    const bills = people.map(person => ({
      personId: person.id,
      personName: person.name,
      amount: calculatePersonTotal(person),
      items: person.items
    }));
    
    navigation.navigate('PaymentScreen', {
      orderId,
      tableName,
      bills,
      totalAmount,
      currency
    });
  };
  
  // Rendu d'un élément d'article
  const renderBillItem = (item: BillItem, personId?: number) => {
    const itemTotal = (item.unitPrice * item.count) * (1 - (item.discount || 0) / 100);
    
    return (
      <Card style={styles.itemCard} key={item.id}>
        <Card.Content style={styles.itemContent}>
          <View style={styles.itemDetails}>
            <Text style={styles.itemName}>{item.count}x {item.dishName}</Text>
            <Text style={styles.itemPrice}>{itemTotal.toFixed(2)} {currency}</Text>
          </View>
          
          {personId && (
            <IconButton
              icon="close"
              size={20}
              onPress={() => removeItemFromPerson(personId, item.id)}
            />
          )}
        </Card.Content>
      </Card>
    );
  };
  
  // Rendu d'une personne
  const renderPerson = (person: Person) => {
    const isActive = activePersonId === person.id;
    const personTotal = calculatePersonTotal(person);
    
    return (
      <Card 
        style={[
          styles.personCard, 
          isActive && styles.activePersonCard
        ]}
        onPress={() => setActivePersonId(isActive ? null : person.id)}
      >
        <Card.Content>
          {/* En-tête avec nom et actions */}
          <View style={styles.personHeader}>
            {editingPersonId === person.id ? (
              <View style={styles.nameEditContainer}>
                <TextInput
                  value={editingName}
                  onChangeText={setEditingName}
                  style={styles.nameInput}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => updatePersonName(person.id)}
                />
                <IconButton
                  icon="check"
                  size={20}
                  onPress={() => updatePersonName(person.id)}
                />
              </View>
            ) : (
              <View style={styles.personTitleContainer}>
                <Text style={styles.personName}>{person.name}</Text>
                <IconButton
                  icon="pencil"
                  size={20}
                  onPress={() => startEditingName(person)}
                />
              </View>
            )}
            
            <Chip 
              style={[
                styles.totalChip,
                isActive && styles.activeTotalChip
              ]}
            >
              {personTotal.toFixed(2)} {currency}
            </Chip>
          </View>
          
          {/* Section de montant personnalisé (en mode montant) */}
          {splitMode === 'amount' && (
            <View style={styles.customAmountContainer}>
              <TextInput
                label="Montant"
                value={person.customAmount?.toString() || ''}
                onChangeText={(text) => updatePersonCustomAmount(person.id, text)}
                keyboardType="numeric"
                right={<TextInput.Affix text={currency} />}
                style={styles.amountInput}
              />
            </View>
          )}
          
          {/* Afficher les articles si mode articles ou si section développée */}
          {splitMode === 'items' && isActive && (
            <View style={styles.personItems}>
              <Text style={styles.itemsHeader}>
                Articles ({person.items.length})
              </Text>
              
              {person.items.length > 0 ? (
                <View style={styles.itemsList}>
                  {person.items.map((item) => renderBillItem(item, person.id))}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  Aucun article attribué
                </Text>
              )}
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };
  
  return (
    <GestureHandlerRootView style={styles.gestureContainer}>
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content 
            title="Répartition de l'addition" 
            subtitle={tableName ? `Table: ${tableName}` : `Commande #${orderId}`} 
          />
        </Appbar.Header>
        
        <View style={styles.content}>
          {/* En-tête avec contrôles du mode */}
          <Surface style={styles.header}>
            <Text style={styles.headerTitle}>Mode de répartition:</Text>
            <ToggleButton.Row
              onValueChange={(value) => value && toggleSplitMode()}
              value={splitMode}
              style={styles.toggleRow}
            >
              <ToggleButton 
                icon="format-list-bulleted" 
                value="items"
                style={styles.toggleButton}
              />
              <ToggleButton 
                icon="currency-usd" 
                value="amount"
                style={styles.toggleButton}
              />
            </ToggleButton.Row>
            <Text style={styles.modeDescription}>
              {splitMode === 'items' 
                ? 'Attribuez des articles spécifiques à chaque personne' 
                : 'Définissez un montant pour chaque personne'}
            </Text>
          </Surface>
          
          {/* Liste des personnes */}
          <ScrollView style={styles.peopleContainer}>
            {people.map(renderPerson)}
          </ScrollView>
          
          {/* Articles non assignés (en mode articles) */}
          {splitMode === 'items' && (
            <Surface style={styles.unassignedContainer}>
              <View style={styles.unassignedHeader}>
                <Text style={styles.unassignedTitle}>
                  Articles non assignés ({unassignedItems.length})
                </Text>
                {unassignedItems.length > 0 && (
                  <Button
                    mode="outlined"
                    onPress={distributeRemainingItemsEvenly}
                    compact
                  >
                    Répartir équitablement
                  </Button>
                )}
              </View>
              
              {unassignedItems.length > 0 ? (
                <ScrollView 
                  horizontal 
                  style={styles.unassignedItems}
                  contentContainerStyle={styles.unassignedItemsContent}
                >
                  {unassignedItems.map((item) => {
                    const itemTotal = (item.unitPrice * item.count) * (1 - (item.discount || 0) / 100);
                    
                    return (
                      <Card 
                        key={item.id} 
                        style={styles.unassignedItemCard}
                        onPress={() => {
                          if (activePersonId !== null) {
                            assignItemToPerson(activePersonId, item);
                          } else {
                            Alert.alert(
                              "Sélectionnez une personne",
                              "Veuillez d'abord sélectionner une personne pour lui attribuer cet article.",
                              [{ text: "OK" }]
                            );
                          }
                        }}
                      >
                        <Card.Content>
                          <Text style={styles.itemName} numberOfLines={2}>
                            {item.count}x {item.dishName}
                          </Text>
                          <Text style={styles.itemPrice}>
                            {itemTotal.toFixed(2)} {currency}
                          </Text>
                        </Card.Content>
                      </Card>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.emptyUnassigned}>
                  <Text style={styles.emptyText}>
                    Tous les articles sont assignés
                  </Text>
                </View>
              )}
            </Surface>
          )}
          
          {/* Récapitulatif et actions en bas de l'écran */}
          <Surface style={styles.footer}>
            <View style={styles.summaryContainer}>
              <DataTable>
                <DataTable.Row>
                  <DataTable.Cell>Total assigné</DataTable.Cell>
                  <DataTable.Cell numeric>
                    {calculateAssignedTotal().toFixed(2)} {currency}
                  </DataTable.Cell>
                </DataTable.Row>
                
                {splitMode === 'amount' && (
                  <DataTable.Row>
                    <DataTable.Cell>Restant</DataTable.Cell>
                    <DataTable.Cell numeric>
                      {calculateRemainingTotal().toFixed(2)} {currency}
                    </DataTable.Cell>
                  </DataTable.Row>
                )}
                
                <DataTable.Row>
                  <DataTable.Cell style={styles.totalCell}>
                    <Text style={styles.totalText}>Total addition</Text>
                  </DataTable.Cell>
                  <DataTable.Cell numeric style={styles.totalCell}>
                    <Text style={styles.totalAmount}>
                      {totalAmount.toFixed(2)} {currency}
                    </Text>
                  </DataTable.Cell>
                </DataTable.Row>
              </DataTable>
            </View>
            
            {/* Boutons d'action */}
            <View style={styles.actionButtons}>
              {splitMode === 'amount' && (
                <Button
                  mode="outlined"
                  onPress={distributeAmountsEvenly}
                  style={styles.distributeButton}
                >
                  Répartir équitablement
                </Button>
              )}
              
              <Button
                mode="outlined"
                onPress={() => navigation.goBack()}
                style={styles.cancelButton}
              >
                Retour
              </Button>
              
              <Button
                mode="contained"
                onPress={proceedToPayment}
                style={styles.continueButton}
                disabled={!isSplitValid()}
                icon="cash-register"
              >
                Procéder au paiement
              </Button>
            </View>
          </Surface>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  gestureContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: 16,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  toggleRow: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  toggleButton: {
    width: 48,
  },
  modeDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  peopleContainer: {
    flex: 1,
    padding: 16,
  },
  personCard: {
    marginBottom: 12,
    borderRadius: 8,
  },
  activePersonCard: {
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  personHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  personTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  totalChip: {
    backgroundColor: '#E3F2FD',
  },
  activeTotalChip: {
    backgroundColor: '#2196F3',
    color: 'white',
  },
  nameEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  nameInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'transparent',
  },
  customAmountContainer: {
    marginTop: 8,
  },
  amountInput: {
    backgroundColor: 'transparent',
  },
  personItems: {
    marginTop: 16,
  },
  itemsHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  itemsList: {
    gap: 8,
  },
  unassignedContainer: {
    padding: 16,
    marginBottom: 8,
  },
  unassignedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  unassignedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  unassignedItems: {
    height: 120,
  },
  unassignedItemsContent: {
    paddingRight: 16,
    gap: 8,
  },
  unassignedItemCard: {
    width: 150,
    height: 100,
    justifyContent: 'center',
  },
  itemCard: {
    borderRadius: 8,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  emptyUnassigned: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 8,
  },
  summaryContainer: {
    marginBottom: 16,
  },
  totalCell: {
    height: 48,
  },
  totalText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  distributeButton: {
    flex: 1,
    marginRight: 8,
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  continueButton: {
    flex: 2,
  },
});