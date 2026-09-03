import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInvites } from '../context/InvitesContext';

export default function InvitesButton() {
  const { inviteCount, openModal } = useInvites();
  return (
    <TouchableOpacity onPress={openModal} style={styles.btn} hitSlop={8} activeOpacity={0.7}>
      <Ionicons name="notifications-outline" size={24} color="#561C24" />
      {inviteCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{inviteCount > 9 ? '9+' : String(inviteCount)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
});
