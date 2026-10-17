import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer'],
      globals: {
        Buffer: true,
        global: true,
        process: true
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('/@tonconnect/ui-react/')) return 'tonconnect-react';
          if (id.includes('/@tonconnect/ui/')) return 'tonconnect-ui';
          if (id.includes('/@tonconnect/sdk/')) return 'tonconnect-sdk';
          if (id.includes('/@ton/core/') || id.includes('/@ton/crypto/')) return 'ton-core-vendor';
          if (id.includes('/@tonconnect/')) return 'tonconnect-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
          if (id.includes('/buffer/') || id.includes('/vite-plugin-node-polyfills/')) return 'runtime-vendor';
          return undefined;
        }
      }
    }
  }
});
