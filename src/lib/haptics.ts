import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

async function runHaptic(callback: () => Promise<void>, reduceMotion = false) {
  if (reduceMotion) {
    return;
  }

  try {
    await callback();
  } catch {
    // Haptics can be unavailable on simulators, web, low-power iOS, or devices without vibration hardware.
  }
}

export function selectionHaptic(reduceMotion = false) {
  return runHaptic(() => Haptics.selectionAsync(), reduceMotion);
}

export function confirmationHaptic(reduceMotion = false) {
  return runHaptic(async () => {
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, reduceMotion);
}

export function deletionHaptic(reduceMotion = false) {
  return runHaptic(async () => {
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, reduceMotion);
}

export function toggleHaptic(enabled: boolean, reduceMotion = false) {
  return runHaptic(async () => {
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(enabled ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off);
      return;
    }

    await Haptics.selectionAsync();
  }, reduceMotion);
}

export function swipeHaptic(reduceMotion = false) {
  return runHaptic(async () => {
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_End);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, reduceMotion);
}