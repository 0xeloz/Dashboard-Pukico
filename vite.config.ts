import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function aiStudioIframePlugin(): Plugin {
  return {
    name: 'ai-studio-iframe-compat',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          injectTo: 'head',
          children: `
      // AI Studio Iframe Compatibility
      try {
        if (typeof window !== 'undefined') {
          var originalFetch = window.fetch ? window.fetch.bind(window) : undefined;
          if (originalFetch) {
            var activeFetch = originalFetch;
            Object.defineProperty(window, 'fetch', {
              get: function() { return activeFetch; },
              set: function(fn) { if (typeof fn === 'function') activeFetch = fn; },
              configurable: true,
              enumerable: true
            });
          }
          if (typeof window.ethereum === 'undefined') {
            window.ethereum = {
              isMetaMask: false,
              request: function() { return Promise.reject(new Error('No injected wallet in iframe')); },
              on: function() {},
              removeListener: function() {}
            };
          }
        }
      } catch (e) {}
          `,
        },
      ];
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [aiStudioIframePlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
