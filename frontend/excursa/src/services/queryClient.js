import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();

export const clearUserScopedCache = () => {
  queryClient.cancelQueries();
  queryClient.clear();
};

export default queryClient;
