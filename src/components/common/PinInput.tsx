// src/components/common/PinInput.tsx
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface PinInputProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  length?: number;
  clearOnError?: boolean;
}

export interface PinInputRef {
  clear: () => void;
}

export const PinInput = forwardRef<PinInputRef, PinInputProps>(({ 
  onComplete, 
  disabled = false,
  length = 4,
  clearOnError = true
}, ref) => {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  // Exposer la méthode clear via ref
  useImperativeHandle(ref, () => ({
    clear: () => {
      setPin('');
      setHasSubmitted(false);
      inputRef.current?.focus();
    }
  }));
  
  const handlePinChange = (value: string) => {
    // Réinitialiser le flag si on modifie après une soumission
    if (hasSubmitted) {
      setHasSubmitted(false);
    }
    
    // Accepter uniquement les chiffres
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length <= length) {
      setPin(numericValue);
      
      // Appeler onComplete UNIQUEMENT quand on atteint la longueur ET qu'on n'a pas déjà soumis
      if (numericValue.length === length && !hasSubmitted) {
        setHasSubmitted(true);
        onComplete(numericValue);
      }
    }
  };
  
  const handleBoxPress = () => {
    inputRef.current?.focus();
  };
  
  const renderPinBoxes = () => {
    const boxes = [];
    for (let i = 0; i < length; i++) {
      const isFilled = i < pin.length;
      const isActive = i === pin.length && !disabled;
      
      boxes.push(
        <View
          key={i}
          style={[
            styles.pinBox,
            { borderColor: isActive ? theme.colors.primary : '#E0E0E0' },
            isFilled && { borderColor: theme.colors.primary, borderWidth: 2 },
            disabled && styles.disabledBox
          ]}
        >
          <Text style={[styles.pinText, { color: theme.colors.text }]}>
            {pin[i] ? '●' : ''}
          </Text>
        </View>
      );
    }
    return boxes;
  };
  
  return (
    <Pressable onPress={handleBoxPress} style={styles.container}>
      <View style={styles.pinContainer}>
        {renderPinBoxes()}
      </View>
      
      <TextInput
        ref={inputRef}
        value={pin}
        onChangeText={handlePinChange}
        keyboardType="numeric"
        maxLength={length}
        style={styles.hiddenInput}
        editable={!disabled}
        autoFocus
      />
    </Pressable>
  );
});

// Donner un nom au composant pour le debugging
PinInput.displayName = 'PinInput';

export default PinInput;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pinContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  pinBox: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinText: {
    fontSize: 24,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  disabledBox: {
    backgroundColor: '#F5F5F5',
  },
});