import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { SimulatedBadge } from './SimulatedBadge';
import { spacing } from './theme';

/** Full-screen view of one image; tap anywhere or "Close" to dismiss. */
export function ImageViewer({
  uri,
  title,
  onClose,
}: {
  uri: string | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="image-viewer">
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <SimulatedBadge />
        </View>
        {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : null}
        <Text style={styles.close}>Tap to close</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },
  image: { width: '100%', maxWidth: 900, flex: 1, maxHeight: 900 },
  close: { color: '#94A3B8', fontSize: 14 },
});
