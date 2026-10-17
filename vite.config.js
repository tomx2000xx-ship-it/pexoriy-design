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
          if (id.includes('/@tonconnect/') || id.includes('/@ton/core/') || id.includes('/@ton/crypto/')) return 'wallet-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
          if (id.includes('/buffer/') || id.includes('/vite-plugin-node-polyfills/')) return 'runtime-vendor';
          return undefined;
        }
      }
    }
  }
});
