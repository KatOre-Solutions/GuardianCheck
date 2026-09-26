import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {MARKETING_ROUTES} from './src/constants/appRoutes';
import {APP_HOSTNAME, APP_SITE_URL, DOMAIN_SPLIT_PHASE, MARKETING_HOSTNAMES, MARKETING_URL} from './src/constants/site';

/**
 * Sends a page load on the wrong host of the domain split (#14) to the right
 * one before any bundle downloads: a marketing page opened on the app host goes
 * back to the apex, and once the phase is "live" anything but a marketing page
 * on the apex goes to the app host. Path, query string and hash are kept, so
 * invite tokens and payment results survive the move.
 *
 * A fallback, not the mechanism. The redirects that matter are 308s in
 * vercel.json, generated from these same constants, so a crawler, an unfurler
 * or a monitor with no JavaScript is told the page has moved rather than
 * handed 200 and an app shell. This catches anything the edge rule does not:
 * a stale cached HTML document, or a host the `has` conditions do not name. It
 * only ever fires on the production hostnames, so previews and localhost are
 * untouched.
 *
 * It is the same decision src/lib/siteMode.ts makes for in-app navigation,
 * built from the same constants, and tests/domain-split.test.ts holds the
 * three of them to the same answer.
 */
function domainSplitRedirect(): Plugin {
  const code =
    '(function(){' +
    'var l=location,h=l.hostname,p=l.pathname.length>1?l.pathname.replace(/\\/+$/,""):l.pathname,' +
    `m=${JSON.stringify(MARKETING_ROUTES)},to="";` +
    `if(h===${JSON.stringify(APP_HOSTNAME)}&&p!=="/"&&m.indexOf(p)!==-1)to=${JSON.stringify(MARKETING_URL)};` +
    `else if(${JSON.stringify(DOMAIN_SPLIT_PHASE === 'live')}&&${JSON.stringify(MARKETING_HOSTNAMES)}.indexOf(h)!==-1&&m.indexOf(p)===-1)to=${JSON.stringify(APP_SITE_URL)};` +
    'if(to)l.replace(to+p+l.search+l.hash);' +
    '})();';
  return {
    name: 'domain-split-redirect',
    transformIndexHtml() {
      return [{tag: 'script', children: code, injectTo: 'head-prepend'}];
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [domainSplitRedirect(), react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_PAYFAST_SANDBOX': JSON.stringify(env.VITE_PAYFAST_SANDBOX || 'true'),
      'import.meta.env.VITE_DEV_MODE': JSON.stringify(env.VITE_DEV_MODE || 'false'),
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || env.APP_URL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Escape hatch for environments where file watching causes flickering
      // (agent-driven editing, some container filesystems): set DISABLE_HMR=true.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
