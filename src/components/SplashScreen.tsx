import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import DecorativeBackground from './DecorativeBackground';

/**
 * Native splash screen'in yerini JS tarafında sorunsuzca devralan splash.
 * Mount olur olmaz native splash'i kapatır; app.json'daki splash ile aynı
 * görsel (assets/icon.png @ 200x200, contain) DecorativeBackground gradient'i
 * üzerinde gösterilir.
 */
export default function SplashScreen() {
  useEffect(() => {
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <DecorativeBackground>
      {/* WelcomeScreen'deki transparentBg deseni: DecorativeBackground içindeyken
          zemin görünsün diye View'ın kendi rengi olmasın */}
      <View style={[styles.container, styles.transparentBg]}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
    </DecorativeBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transparentBg: { backgroundColor: 'transparent' },
  image: { width: 200, height: 200 },
});
