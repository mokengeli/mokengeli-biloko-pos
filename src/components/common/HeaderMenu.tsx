// src/components/common/HeaderMenu.tsx (version améliorée)
import React, { useState } from 'react';
import { 
  Portal, 
  Modal, 
  Surface, 
  List, 
  Divider, 
  Text, 
  Appbar,
  useTheme 
} from 'react-native-paper';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';

interface MenuItem {
  title: string;
  icon: string;
  onPress: () => void;
  dividerAfter?: boolean;
  color?: string;
  disabled?: boolean;
}

interface HeaderMenuProps {
  additionalItems?: MenuItem[];
  showProfile?: boolean;
  showLogout?: boolean;
  menuTitle?: string;
  iconName?: string;
}

export const HeaderMenu: React.FC<HeaderMenuProps> = ({ 
  additionalItems = [],
  showProfile = true,
  showLogout = true,
  menuTitle = "Menu",
  iconName = "menu"
}) => {
  const [visible, setVisible] = useState(false);
  const navigation = useNavigation();
  const { logout } = useAuth();
  const theme = useTheme();

  const handleItemPress = (onPress: () => void) => {
    setVisible(false);
    onPress();
  };

  return (
    <>
      <Appbar.Action 
        icon={iconName} 
        onPress={() => setVisible(true)} 
      />
      
      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text style={styles.modalTitle}>{menuTitle}</Text>
            <Divider style={styles.modalDivider} />
            
            {/* Items additionnels personnalisés */}
            {additionalItems.map((item, index) => (
              <React.Fragment key={index}>
                <List.Item
                  title={item.title}
                  titleStyle={item.color ? { color: item.color } : undefined}
                  left={props => (
                    <List.Icon 
                      {...props} 
                      icon={item.icon} 
                      color={item.color || props.color}
                    />
                  )}
                  onPress={() => handleItemPress(item.onPress)}
                  disabled={item.disabled}
                />
                {item.dividerAfter && <Divider style={styles.itemDivider} />}
              </React.Fragment>
            ))}
            
            {/* Divider avant les items par défaut si nécessaire */}
            {additionalItems.length > 0 && (showProfile || showLogout) && 
              !additionalItems[additionalItems.length - 1]?.dividerAfter && (
              <Divider style={styles.itemDivider} />
            )}
            
            {/* Item Profil */}
            {showProfile && (
              <List.Item
                title="Mon profil"
                left={props => <List.Icon {...props} icon="account" />}
                onPress={() => handleItemPress(() => navigation.navigate('ProfilHome' as never))}
              />
            )}
            
            {/* Divider entre profil et déconnexion */}
            {showProfile && showLogout && (
              <Divider style={styles.itemDivider} />
            )}
            
            {/* Item Déconnexion */}
            {showLogout && (
              <List.Item
                title="Déconnexion"
                titleStyle={{ color: theme.colors.error }}
                left={props => (
                  <List.Icon 
                    {...props} 
                    icon="logout" 
                    color={theme.colors.error}
                  />
                )}
                onPress={() => handleItemPress(logout)}
              />
            )}
          </Surface>
        </Modal>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 0,
    overflow: 'hidden',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 16,
    textAlign: 'center',
  },
  modalDivider: {
    marginBottom: 8,
  },
  itemDivider: {
    marginVertical: 8,
  },
});