// src/components/common/RefreshControl.tsx
import React from 'react';
import { RefreshControl as RNRefreshControl, RefreshControlProps } from 'react-native';
import { useTheme } from 'react-native-paper';

interface RefreshMeProps extends RefreshControlProps {
  refreshing: boolean;
  onRefresh: () => void;
}

export const RefreshMe: React.FC<RefreshMeProps> = ({ refreshing, onRefresh, ...props }) => {
  const theme = useTheme();

  return (
    <RNRefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[theme.colors.primary]}
      tintColor={theme.colors.primary}
      {...props}
    />
  );
};