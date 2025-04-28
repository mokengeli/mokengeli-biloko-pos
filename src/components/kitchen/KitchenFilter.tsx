// src/components/kitchen/KitchenFilter.tsx
import React from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Chip, Text, Surface, useTheme } from 'react-native-paper';

interface KitchenFilterProps {
  categories: string[];
  selectedCategories: string[];
  onSelectCategory: (category: string) => void;
}

export const KitchenFilter: React.FC<KitchenFilterProps> = ({
  categories,
  selectedCategories,
  onSelectCategory,
}) => {
  const theme = useTheme();
  
  // Détection de l'appareil
  const windowWidth = Dimensions.get('window').width;
  const windowHeight = Dimensions.get('window').height;
  const isTablet = windowWidth >= 768;
  const isLandscape = windowWidth > windowHeight;

  return (
    <Surface style={[styles.container, isTablet && styles.tabletContainer]}>
      <Text style={[styles.label, isTablet && styles.tabletLabel]}>Filtrer par catégorie:</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.chipContainer, 
          isTablet && styles.tabletChipContainer
        ]}
      >
        {categories.map((category, index) => (
          <Chip
            key={index}
            selected={selectedCategories.includes(category)}
            onPress={() => onSelectCategory(category)}
            style={[
              styles.chip,
              selectedCategories.includes(category) 
                ? { backgroundColor: theme.colors.primary } 
                : null,
              isTablet && styles.tabletChip
            ]}
            textStyle={{
              color: selectedCategories.includes(category) ? 'white' : undefined,
              ...(isTablet && styles.tabletChipText),
            }}
          >
            {category}
          </Chip>
        ))}
      </ScrollView>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    paddingRight: 20,
  },
  chip: {
    marginRight: 8,
  },
  // Styles pour tablette
  tabletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  tabletLabel: {
    fontSize: 16,
    marginBottom: 0,
    marginRight: 16,
    width: 'auto',
  },
  tabletChipContainer: {
    flexWrap: 'wrap',
    flex: 1,
  },
  tabletChip: {
    marginBottom: 8,
    height: 36,
  },
  tabletChipText: {
    fontSize: 14,
  },
});

export default KitchenFilter;