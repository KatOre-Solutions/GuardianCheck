import { useEffect } from "react";

/**
 * Injects a `<script type="application/ld+json">` tag into the document head
 * and removes it again on unmount.
 *
 * The document head is shared mutable state across routes (see `Seo.tsx`), so
 * a schema block a page adds must also be the one that takes it away —
 * otherwise navigating off a page that renders `<JsonLd>` would leave a stale
 * schema block describing the wrong page for whichever route comes next.
 *
 * `data` is compared by its serialised form, not by reference, so passing a
 * fresh object literal on every render does not thrash the DOM.
 */
export function JsonLd({ id, data }: { id: string; data: object }) {
  const json = JSON.stringify(data);

  useEffect(() => {
    let tag = document.getElementById(id) as HTMLScriptElement | null;

    if (!tag) {
      tag = document.createElement("script");
      tag.id = id;
      tag.type = "application/ld+json";
      document.head.appendChild(tag);
    }

    tag.textContent = json;

    return () => {
      document.getElementById(id)?.remove();
    };
  }, [id, json]);

  return null;
}
