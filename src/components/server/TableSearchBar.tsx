import React, { useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Searchbar, useTheme } from "react-native-paper";
import { useDebouncedCallback } from "use-debounce";

interface TableSearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const TableSearchBar: React.FC<TableSearchBarProps> = ({
  onSearch,
  isLoading = false,
  placeholder = "Rechercher une table...",
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce la recherche pour éviter trop d'appels API
  const debouncedSearch = useDebouncedCallback((query: string) => {
    onSearch(query);
  }, 300);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

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