import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 1. Import the Query tools (Devtools removed to prevent npm/Vite dependency crashes)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 2. Import Router (HashRouter is absolutely required for Electron desktop apps)
import { HashRouter } from 'react-router-dom';

// 3. Import Global Toaster (For beautiful popup notifications anywhere in your app)
import { Toaster } from 'react-hot-toast';

// 4. Global CSS Import
import './assets/main.css'; 

// 5. Create the global cache client with optimized defaults for desktop & memory caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 15,       // 🚀 Keep data fresh for 15 mins (stops refetching on every tab switch)
      gcTime: 1000 * 60 * 60 * 24,     // 🚀 Keep data in local memory for 24 hours (instant response feel)
      refetchOnWindowFocus: false,     // 🛑 Prevents aggressive background fetching when switching PC windows
      refetchOnReconnect: false,       // 🛑 Prevents refetches on minor network blips
      refetchOnMount: false,           // 🚀 Uses cached data instantly when returning to a page
      retry: 1,                        // Only retry failed requests once to avoid spamming your backend
    },
  },
});

// 🚀 THE FIX: Removed <React.StrictMode> to prevent AG Grid rendering crashes!
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
        
        {/* Global Toast Notifications Provider */}
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            duration: 4000,
            style: {
              background: '#333',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 'bold',
              borderRadius: '8px',
            },
          }} 
        />
      </HashRouter>
    </QueryClientProvider>
);