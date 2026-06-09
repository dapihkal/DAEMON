import { useFonts } from 'expo-font';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';

export function useAppFonts() {
  return useFonts({
    JetBrainsMono_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Syne_700Bold,
    Syne_800ExtraBold,
  });
}
