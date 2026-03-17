import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: true, // NOTE: Su anlik mock data ile ugrastigimiz icin auth true kabul ediyoruz.

  setAuth: (user, token) => {
    global.accessToken = token;
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    global.accessToken = null;
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

export default useAuthStore;