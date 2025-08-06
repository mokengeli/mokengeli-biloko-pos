import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AppTheme } from '../../theme/theme';

interface NeumorphicSurfaceProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  distance?: number;
  borderRadius?: number;
}

const NeumorphicSurface: React.FC<NeumorphicSurfaceProps> = ({
  children,
  style,
  distance = 6,
  borderRadius,
}) => {
  const { colors, roundness } = useTheme<AppTheme>();
  const radius = borderRadius ?? roundness;

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: colors.background,
          borderRadius: radius,
          shadowColor: colors.shadowLight,
          shadowOffset: { width: -distance, height: -distance },
          shadowOpacity: 1,
          shadowRadius: distance,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            backgroundColor: colors.background,
            borderRadius: radius,
            shadowColor: colors.shadowDark,
            shadowOffset: { width: distance, height: distance },
            shadowOpacity: 1,
            shadowRadius: distance,
            elevation: distance,
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {},
  inner: {},
});

export default NeumorphicSurface;

