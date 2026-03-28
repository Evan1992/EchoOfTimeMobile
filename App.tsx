import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from './AuthContext';
import { LapProvider } from './LapContext';
import TodayScreen from './screens/TodayScreen';
import TasksScreen from './screens/TasksScreen';
import LoginScreen from './screens/LoginScreen';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  const { auth } = useAuth();

  if (!auth) return <LoginScreen />;

  return (
    <LapProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#2a2a2a' },
            tabBarActiveTintColor: '#ffffff',
            tabBarInactiveTintColor: '#666666',
          }}
        >
          <Tab.Screen
            name="Today"
            component={TodayScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="stopwatch-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Tasks"
            component={TasksScreen}
            options={{
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="checkbox-outline" size={size} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </LapProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
