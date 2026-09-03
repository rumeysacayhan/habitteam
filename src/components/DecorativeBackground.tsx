import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Onboarding + Welcome/Login/Register ekranlarının ortak dekoratif arka planı.
// İçeriğin ARKASINDA render edilir; dokunmaları engellemez (pointerEvents="none").

export default function DecorativeBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Dikey 3 renkli gradient — opaklık her rengin kendi alfa değerinde */}
      <View style={styles.gradientWrap} pointerEvents="none">
        <LinearGradient
          colors={['#561C2466', '#6D293259', '#D8C3A5A6', '#D8C3A500']}
          locations={[0, 0.22, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Native splash + app.json ile aynı zemin: alfa'lı gradient bunun üzerine
  // kompozit olur, native→JS splash geçişinde renk sıçraması olmaz.
  root: { flex: 1, backgroundColor: '#FEFCFA' },
  // StyleSheet.absoluteFillObject bu RN sürümünde tiplenmediği için birebir karşılığı yazıldı
  gradientWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
