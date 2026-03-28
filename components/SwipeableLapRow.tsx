import { useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
};

export default function SwipeableLapRow({ children, onDelete }: Props) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ scale }] }]}>
        <Text style={styles.deleteText} onPress={() => { swipeableRef.current?.close(); onDelete(); }}>Delete</Text>
      </Animated.View>
    );
  };

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} rightThreshold={40}>
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  deleteText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
