import React from 'react';
import { GestureResponderEvent, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressScale } from '../hooks/usePressScale';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * Basılınca hafifçe küçülüp bırakınca spring ile geri dönen TouchableOpacity.
 * Ana ve outline butonlar için kullanılır; diğer tüm props'lar TouchableOpacity'ye geçer.
 */
export default function PressableScale({
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: TouchableOpacityProps) {
  const { onPressIn: scaleIn, onPressOut: scaleOut, animatedStyle } = usePressScale();

  return (
    <AnimatedTouchable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e: GestureResponderEvent) => { scaleIn(); onPressIn?.(e); }}
      onPressOut={(e: GestureResponderEvent) => { scaleOut(); onPressOut?.(e); }}
    >
      {children}
    </AnimatedTouchable>
  );
}
