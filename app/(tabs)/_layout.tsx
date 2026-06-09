import { Tabs } from 'expo-router';

import { useTheme, useThemePreferences } from '../../src/theme/theme-provider';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();

  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        animation: preferences.reduceMotion ? 'none' : 'fade',
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
        }}
      />
      <Tabs.Screen
        name="listes"
        options={{
          title: 'Listes',
        }}
      />
      <Tabs.Screen
        name="rappels"
        options={{
          title: 'Rappels',
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
        }}
      />
      <Tabs.Screen
        name="plus"
        options={{
          title: 'Plus',
        }}
      />
    </Tabs>
  );
}
