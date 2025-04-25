// src/components/common/NotAvailableDialog.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Dialog, Portal, Text, Button, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface NotAvailableDialogProps {
  visible: boolean;
  onDismiss: () => void;
  featureName: string;
}

export const NotAvailableDialog: React.FC<NotAvailableDialogProps> = ({
  visible,
  onDismiss,
  featureName,
}) => {
  const theme = useTheme();

  return (
    <Portal>
      <View style={styles.dialogWrapper}>
        <Dialog
          visible={visible}
          onDismiss={onDismiss}
          style={styles.dialog}
        >
          <View style={styles.dialogContent}>
            <Dialog.Content style={styles.content}>
              <Icon
                name="clock-outline"
                size={48}
                color={theme.colors.primary}
                style={styles.icon}
              />
              <Text style={styles.title}>Fonctionnalité à venir</Text>
              <Text style={styles.message}>
                La fonctionnalité "{featureName}" n'est pas encore disponible dans cette version.
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={onDismiss} mode="contained">
                Compris
              </Button>
            </Dialog.Actions>
          </View>
        </Dialog>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
    dialogWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dialog: {
      borderRadius: 12,
    },
    dialogContent: {
      borderRadius: 12,
      overflow: 'hidden',
    },
    content: {
      alignItems: 'center',
      paddingTop: 20,
    },
    icon: {
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 8,
    },
    message: {
      fontSize: 16,
      textAlign: 'center',
      opacity: 0.8,
    },
  });