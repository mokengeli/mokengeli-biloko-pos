import React, { useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Searchbar, useTheme } from "react-native-paper";

interface DishSearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const DishSearchBar: React.FC<DishSearchBarProps> = ({
  onSearch,
  isLoading = false,
  placeholder = "Rechercher un plat...",
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    onSearch(searchQuery.trim());
  }, [onSearch, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    onSearch("");
  }, [onSearch]);

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder={placeholder}
        onChangeText={handleSearchChange}
        value={searchQuery}
        onClearIconPress={handleClearSearch}
        onBlur={handleSearchSubmit}
        onSubmitEditing={handleSearchSubmit}
        style={[
          styles.searchBar,
          { backgroundColor: theme.colors.surface }
        ]}
        inputStyle={styles.searchInput}
        iconColor={theme.colors.onSurfaceVariant}
        loading={isLoading}
        elevation={1}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    borderRadius: 8,
  },
  searchInput: {
    fontSize: 16,
  },
});