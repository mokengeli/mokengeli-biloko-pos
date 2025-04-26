// src/components/kitchen/KitchenFilter.tsx
import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Chip, Text, Surface, useTheme } from "react-native-paper";

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

  return (
    <Surface style={styles.container}>
      <Text style={styles.label}>Filtrer par catégorie:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContainer}
      >
        {categories.map((category, index) => (
          // Dans KitchenFilter.tsx
          <Chip
            key={index}
            selected={selectedCategories.includes(category)}
            onPress={() => onSelectCategory(category)}
            style={[
              styles.chip,
              selectedCategories.includes(category)
                ? { backgroundColor: theme.colors.primary }
                : null,
            ]}
            textStyle={{
              color: selectedCategories.includes(category)
                ? "white"
                : undefined,
              ...styles.chipText,
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
    fontWeight: "bold",
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: "row",
    paddingRight: 20,
  },
  chip: {
    marginRight: 8,
    marginBottom: 4,
    paddingHorizontal: 8, // Plus d'espace horizontal
    height: 32, // Hauteur légèrement augmentée
  },
  chipText: {
    fontSize: 14, // Taille de texte appropriée
  },
});
