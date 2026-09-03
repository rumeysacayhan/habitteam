import React, { forwardRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type FocusEvt = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
type BlurEvt = Parameters<NonNullable<TextInputProps['onBlur']>>[0];

const BLUR_BORDER = '#A9C1D1';   // gri-mavi
const FOCUS_BORDER = '#561C24';  // bordo
const ERROR_BORDER = '#D98A8A';

type Props = TextInputProps & { hasError?: boolean };

/**
 * Odaklanınca kenarlığı gri-maviden bordoya ~150ms yumuşak renk geçişiyle
 * boyayan TextInput. `hasError` verilirse kenarlık hata rengine sabitlenir.
 */
const AnimatedInput = forwardRef<TextInput, Props>(function AnimatedInput(
  { style, onFocus, onBlur, hasError = false, ...rest },
  ref,
) {
  const focus = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [BLUR_BORDER, FOCUS_BORDER]),
  }));

  return (
    <AnimatedTextInput
      ref={ref}
      {...rest}
      style={[style, animatedStyle, hasError && { borderColor: ERROR_BORDER }]}
      onFocus={(e: FocusEvt) => {
        focus.value = withTiming(1, { duration: 150 });
        onFocus?.(e);
      }}
      onBlur={(e: BlurEvt) => {
        focus.value = withTiming(0, { duration: 150 });
        onBlur?.(e);
      }}
    />
  );
});

export default AnimatedInput;
