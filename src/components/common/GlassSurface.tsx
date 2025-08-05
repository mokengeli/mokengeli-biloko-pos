import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from 'react-native-paper';

interface GlassSurfaceProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

const GlassSurface: React.FC<GlassSurfaceProps> = ({ children, style, intensity = 50 }) => {
  const theme = useTheme();
  const backgroundColor = theme.dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
  const borderColor = theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)';
  return (
    <BlurView
      intensity={intensity}
      tint={theme.dark ? 'dark' : 'light'}
      style={[
        styles.container,
        { backgroundColor, borderColor, borderRadius: theme.roundness },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
});

export default GlassSurface;
