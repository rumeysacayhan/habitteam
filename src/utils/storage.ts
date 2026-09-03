import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_TOKEN_KEY = 'userToken';

export const getToken = () => AsyncStorage.getItem(USER_TOKEN_KEY);
export const setToken = (token: string) => AsyncStorage.setItem(USER_TOKEN_KEY, token);
export const removeToken = () => AsyncStorage.removeItem(USER_TOKEN_KEY);
