/**
 * Browser & Iframe Compatibility Shims for AI Studio Environment
 *
 * 1. WalletConnect fetch ponyfill fix:
 *    @walletconnect/jsonrpc-http-connection executes:
 *      function F() { this.fetch = false; }
 *      F.prototype = __global__; // window
 *      new F();
 *    Because `window.fetch` has only a getter on Window.prototype in modern browsers,
 *    assigning `this.fetch = false` on an instance inheriting from Window throws:
 *    "TypeError: Cannot set property fetch of #<Window> which has only a getter"
 *    We install a setter on `window.fetch` to prevent this strict-mode error.
 *
 * 2. Base Account SDK cross-origin iframe security fix:
 *    @base-org/account `getInjectedProvider()` attempts:
 *      window.ethereum ?? window.top?.ethereum
 *    When running inside an iframe (like AI Studio preview), reading `window.top.ethereum`
 *    across different origins throws:
 *    "SecurityError: Failed to read a named property 'ethereum' from 'Window'"
 *    By ensuring `window.ethereum` is defined if missing, `getInjectedProvider()`
 *    never attempts to access `window.top`.
 */

export function installIframeCompatShims() {
  if (typeof window === 'undefined') return;

  // 1. Polyfill writable/configurable fetch on window
  try {
    const originalFetch = window.fetch ? window.fetch.bind(window) : undefined;
    if (originalFetch) {
      let activeFetch = originalFetch;
      Object.defineProperty(window, 'fetch', {
        get() {
          return activeFetch;
        },
        set(fn) {
          if (typeof fn === 'function') {
            activeFetch = fn;
          }
        },
        configurable: true,
        enumerable: true,
      });
    }
  } catch (_e) {
    // Ignore if window.fetch cannot be redefined
  }

  // 2. Safe window.ethereum to guard cross-origin window.top access
  try {
    const win = window as any;
    if (typeof win.ethereum === 'undefined') {
      win.ethereum = {
        isMetaMask: false,
        request: async () => {
          throw new Error('No injected Ethereum provider available in iframe');
        },
        on: () => {},
        removeListener: () => {},
      };
    }
  } catch (_e) {
    // Ignore if window.ethereum cannot be defined
  }
}

// Run immediately upon evaluation
installIframeCompatShims();
