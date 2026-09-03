import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/**
 * Butona basılı tutulunca hafifçe küçülen, bırakınca yumuşak bir spring ile
 * eski boyutuna dönen mikro etkileşim.
 *
 * Dönen `onPressIn`/`onPressOut`'u Touchable/Pressable'a bağla, `animatedStyle`'ı
 * da Reanimated destekli bir elemana (ör. Animated.createAnimatedComponent(...)) uygula.
 */
export function usePressScale(pressedScale = 0.97) {
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value standart güncelleme deseni
    scale.value = withTiming(pressedScale, { duration: 90 });
  }, [scale, pressedScale]);

  const onPressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value standart güncelleme deseni
    scale.value = withSpring(1, { damping: 13, stiffness: 240, mass: 0.6 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return { onPressIn, onPressOut, animatedStyle };
}
