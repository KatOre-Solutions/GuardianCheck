/**
 * The placeholder a route gate shows while it decides whether to render.
 *
 * There are three gates on an authenticated route — the tenant layout, the
 * permission check and the policy check — and each used to own a copy of the
 * same spinner. The copies were byte-identical but not equivalent: one rendered
 * outside `<Layout>` (so the nav bar disappeared) and the others inside it, so
 * the "same" spinner jumped position as the gates handed over. Routing all
 * three through one component is what makes the handover invisible.
 *
 * Every caller must render this *inside* `<Layout>`, so the header stays put
 * for the whole load.
 */
export function PageLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

export default PageLoading;
