import React, { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const PARTICLE_CONFIGS = [
  { dx: -50, dy: -80, color: '#561C24' },
  { dx:   0, dy: -90, color: '#6D2932' },
  { dx:  50, dy: -80, color: '#C7B7A3' },
  { dx:  70, dy: -50, color: '#561C24' },
  { dx:  80, dy: -15, color: '#F5EDE0' },
  { dx:  55, dy:  25, color: '#6D2932' },
  { dx: -55, dy:  25, color: '#C7B7A3' },
  { dx: -80, dy: -15, color: '#561C24' },
  { dx: -70, dy: -50, color: '#F5EDE0' },
  { dx:  30, dy: -70, color: '#6D2932' },
  { dx: -30, dy: -70, color: '#C7B7A3' },
  { dx:   0, dy: -55, color: '#561C24' },
];

type Props = {
  completed: boolean;
  onComplete: () => void;
  onUndo: () => void;
  disabled?: boolean;
};

export default function CheckButton({ completed, onComplete, onUndo, disabled }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const particles = useRef(
    PARTICLE_CONFIGS.map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  const [showParticles, setShowParticles] = useState(false);

  const fireConfetti = () => {
    setShowParticles(true);
    particles.forEach((p) => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
    });
    Animated.parallel(
      particles.map((p, i) =>
        Animated.parallel([
          Animated.timing(p.x, {
            toValue: PARTICLE_CONFIGS[i].dx,
            duration: 800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.y, {
            toValue: PARTICLE_CONFIGS[i].dy,
            duration: 800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 700,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    ).start(() => setShowParticles(false));
  };

  const handlePress = () => {
    if (disabled) return;
    if (completed) {
      onUndo();
      return;
    }
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 40,
        bounciness: 12,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 4,
      }),
    ]).start();
    fireConfetti();
    onComplete();
  };

  return (
    <View style={[styles.wrapper, disabled && { opacity: 0.35 }]}>
      {showParticles &&
        particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              { backgroundColor: PARTICLE_CONFIGS[i].color },
              {
                transform: [{ translateX: p.x }, { translateY: p.y }],
                opacity: p.opacity,
              },
            ]}
          />
        ))}
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <Animated.View
          style={[
            styles.circle,
            completed && styles.circleDone,
            { transform: [{ scale }] },
          ]}
        >
          {completed && <Text style={styles.check}>✓</Text>}
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#561C24',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {
    backgroundColor: '#561C24',
    borderColor: '#561C24',
  },
  check: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
