import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

export function createTestQueryClient(config?: QueryClientConfig) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
    ...config,
  });
}

export function createQueryWrapper(queryClient = createTestQueryClient()) {
  return function TestQueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}
