/**
 * `React.lazy` that survives a deploy, and can be started before it renders.
 *
 * ## Surviving a deploy
 *
 * Route chunks are content-hashed and each deployment replaces them: Vercel
 * stops serving the previous build's files, and `public/sw.js` calls
 * `skipWaiting` and evicts the previous build's cache as soon as a new worker
 * installs. A tab that loaded build A -- a volunteer dashboard left open through
 * a service, say -- then navigates to a route it hasn't loaded yet asks for a
 * build-A chunk that no longer exists anywhere, and the import rejects.
 *
 * Reloading fixes that: the navigation fetches the current `index.html`, which
 * references the current chunks. So a failed import reloads the page once.
 *
 * It must not loop. A reload is attempted only when the last one was more than
 * `RETRY_WINDOW_MS` ago (remembered in sessionStorage, which survives the
 * reload), only when storage works (without it there is no way to know a reload
 * already happened), and only while online (offline, a reload serves the same
 * cached shell and fails the same way). Otherwise the error propagates to the
 * nearest error boundary, which is an honest failure rather than a flicker.
 *
 * ## Preloading
 *
 * `preload()` starts the import early. That alone is not enough: `React.lazy`
 * suspends on its first render even when the module has already arrived, and
 * React throttles revealing suspended content by ~300ms -- measured as a
 * ~350-450ms gap between the route guard opening and the dashboard rendering,
 * with the chunk already fetched. So a mount that finds the module loaded
 * renders it directly and never suspends. Which path a mount takes is decided
 * once, at mount: switching element types between renders would remount the
 * page and lose its state.
 */

import { createElement, lazy, useState, type ComponentProps, type ComponentType } from "react";

const RELOAD_KEY = "gc.chunkReloadAt";
const RETRY_WINDOW_MS = 10_000;

function mayReload(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (Date.now() - last < RETRY_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  let loaded: T | null = null;
  let pending: Promise<{ default: T }> | null = null;

  const load = () => {
    pending ??= factory().then((module) => {
      loaded = module.default;
      return module;
    });
    return pending;
  };

  const Lazy = lazy(async () => {
    try {
      return await load();
    } catch (error) {
      if (!mayReload()) throw error;
      window.location.reload();
      // Stay suspended until the reload replaces the page, rather than
      // flashing the error boundary for the frames in between.
      return new Promise<never>(() => {});
    }
  });

  function Route(props: ComponentProps<T>) {
    const [direct] = useState(() => loaded);
    return createElement(direct ?? Lazy, props);
  }

  return Object.assign(Route, {
    /** Start downloading the chunk now; the render reuses the same request.
     *  A failure is left for that render to handle, reload guard and all. */
    preload: () => {
      load().catch(() => {});
    },
  });
}
