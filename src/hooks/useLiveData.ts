/**
 * Firestore subscriptions that say what state they are in.
 *
 * `subscribeToCollection` hands back an array and nothing else, so an empty
 * array means either "this church has no rooms" or "the query has not answered
 * yet" — and the dashboard could not tell the difference. That is the whole
 * cause of the false states the admin page was rendering: a "Getting Started
 * Checklist" telling an established church to create its first room, a setup
 * wizard opening over a church that was set up years ago. Both were the page
 * reading `[]` and `null` as facts.
 *
 * So these hooks report three states, and callers must distinguish them:
 *
 *   loading  — no answer yet. Show a skeleton.
 *   ready    — answered. `data` is the truth, including when it is empty, so an
 *              empty state may finally be rendered.
 *   error    — the query failed and will never answer. Show an error, never a
 *              skeleton: a rules denial or a missing composite index produces no
 *              snapshot at all, and a section waiting for one would sit in a
 *              placeholder forever. A permanent skeleton hides a broken
 *              subscription instead of surfacing it.
 *
 * A *missing document* is `ready`, not `error` — `subscribeToDocument` calls
 * back with `null` for a document that does not exist, which is an answer.
 */

import { useEffect, useMemo, useState } from "react";
import { where, type QueryConstraint } from "firebase/firestore";
import { subscribeToCollection, subscribeToDocument } from "../lib/firestore";

export type LiveStatus = "loading" | "ready" | "error";

export interface Live<T> {
  data: T;
  status: LiveStatus;
  /** Convenience for the common `status !== "loading"` test. */
  loaded: boolean;
  error: unknown;
}

/**
 * Live collection.
 *
 * `build` must be stable across renders — a fresh constraint array on every render
 * would tear the listener down and reopen it every time. Prefer
 * `useChurchCollection` below, which removes the hazard entirely by taking a
 * plain string.
 */
export function useLiveCollection(
  path: string,
  build: (() => QueryConstraint[]) | null,
): Live<any[]> {
  const [state, setState] = useState<Live<any[]>>({
    data: [],
    status: "loading",
    loaded: false,
    error: null,
  });

  useEffect(() => {
    if (!build) {
      setState({ data: [], status: "loading", loaded: false, error: null });
      return;
    }

    let alive = true;
    const unsubscribe = subscribeToCollection(
      path,
      build(),
      (data) => {
        if (alive) setState({ data, status: "ready", loaded: true, error: null });
      },
      (error) => {
        if (alive) setState((prev) => ({ data: prev.data, status: "error", loaded: true, error }));
      },
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [path, build]);

  return state;
}

/**
 * The shape this app actually uses: one collection, scoped to one church.
 *
 * Taking `churchId` as a string rather than a constraint array is deliberate.
 * Every collection on the admin dashboard uses the identical
 * `where("churchId", "==", churchId)` clause, and a `where(...)` object is
 * opaque — there is no documented, stable way to key an effect on one, and a
 * wrong key means either a listener that never updates or one that reopens on
 * every render. A string has neither problem.
 *
 * Pass `enabled: false` to hold off until the caller is allowed to read.
 */
export function useChurchCollection(
  path: string,
  churchId: string | null | undefined,
  enabled = true,
): Live<any[]> {
  const build = useMemo(
    () => (enabled && churchId ? () => [where("churchId", "==", churchId)] : null),
    [enabled, churchId],
  );
  return useLiveCollection(path, build);
}

/** Live document. `data` is `null` for a document that does not exist. */
export function useLiveDocument(path: string, id: string | null | undefined): Live<any> {
  const [state, setState] = useState<Live<any>>({
    data: null,
    status: "loading",
    loaded: false,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setState({ data: null, status: "loading", loaded: false, error: null });
      return;
    }

    let alive = true;
    const unsubscribe = subscribeToDocument(
      path,
      id,
      (data) => {
        if (alive) setState({ data, status: "ready", loaded: true, error: null });
      },
      (error) => {
        console.error(`${path}/${id} subscription error:`, error);
        if (alive) setState({ data: null, status: "error", loaded: true, error });
      },
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [path, id]);

  return state;
}
