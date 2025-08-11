import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import {
  Appbar,
  Button,
  List,
  TextInput,
  Divider,
  Text,
} from 'react-native-paper';
import { usePrinter } from '../../hooks/usePrinter';
import { usePrinters } from '../../contexts/PrintersContext';
import { Printer } from '../../types/printer';

export const PrinterConfigScreen: React.FC<any> = ({ navigation }) => {
  const { printers, addPrinter, removePrinter, setDefaultPrinter, kitchenPrinterId, receiptPrinterId } = usePrinters();
  const { scanPrinters, connectPrinter, print } = usePrinter();
  const [available, setAvailable] = useState<Printer[]>([]);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('9100');

  const handleScan = async () => {
    const res = await scanPrinters();
    setAvailable(res);
  };

  const handleAddManual = () => {
    if (!ip) return;
    const printer: Printer = {
      id: ip,
      type: 'net',
      host: ip,
      port: parseInt(port, 10) || 9100,
      name: ip,
    };
    addPrinter(printer);
    setIp('');
  };

  const handleTestPrint = async (printer: Printer) => {
    await connectPrinter(printer);
    await print('[C]Test d\'impression');
  };

  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Configuration d'impression" />
      </Appbar.Header>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Button mode="contained" onPress={handleScan} icon="magnify">
          Rechercher des imprimantes
        </Button>

        {available.length > 0 && (
          <>
            <List.Subheader>Imprimantes détectées</List.Subheader>
            {available.map((p) => (
              <List.Item
                key={p.id}
                title={p.name}
                description={p.host || p.macAddress}
                right={() => (
                  <Button onPress={() => addPrinter(p)}>Enregistrer</Button>
                )}
              />
            ))}
            <Divider style={{ marginVertical: 8 }} />
          </>
        )}

        <List.Subheader>Ajouter manuellement</List.Subheader>
        <TextInput label="Adresse IP" value={ip} onChangeText={setIp} style={{ marginBottom: 8 }} />
        <TextInput label="Port" value={port} onChangeText={setPort} keyboardType="numeric" style={{ marginBottom: 8 }} />
        <Button onPress={handleAddManual}>Ajouter</Button>

        <Divider style={{ marginVertical: 16 }} />
        <List.Subheader>Imprimantes enregistrées</List.Subheader>
        {printers.length === 0 && <Text>Aucune imprimante enregistrée</Text>}
        {printers.map((p) => (
          <List.Item
            key={p.id}
            title={p.name}
            description={p.host || p.macAddress}
            left={() => (
              <List.Icon icon={p.id === kitchenPrinterId || p.id === receiptPrinterId ? 'check' : 'printer'} />
            )}
            right={() => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Button onPress={() => setDefaultPrinter('kitchen', p.id)} compact>
                  Cuisine
                </Button>
                <Button onPress={() => setDefaultPrinter('receipt', p.id)} compact>
                  Addition
                </Button>
                <Button onPress={() => handleTestPrint(p)} compact>
                  Test
                </Button>
                <Button onPress={() => removePrinter(p.id)} compact>
                  Supprimer
                </Button>
              </View>
            )}
          />
        ))}
      </ScrollView>
    </View>
  );
};
