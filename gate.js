/**
 * The tool gate — the preset child that makes the tool switches actually bite.
 *
 * Why this exists: this profile mounts a large tool surface **globally** (from
 * `@deepseek-ai/dsh-base` and the other bundles). A preset only *adds* a layer;
 * a scoped registration can shadow a global tool but nothing in a preset can
 * *remove* one. The single sanctioned way to take a globally registered tool
 * away from one mode is `tools.restrict()`, and it only works from a scoped
 * context — which a preset child has, because the registry mounts every preset
 * into `createScope(...)`.
 *
 * So: the host half hands this row the list of tool names the user ticked, and
 * we deny every other tool the runtime currently knows about. Denying by name
 * (rather than allowing) is deliberate — `restrict()` throws on a name it
 * cannot find, so we only ever name tools we just read out of the registry.
 *
 * The registry is live: a plugin loaded after this preset (a lazily activated
 * bundle, a third-party tool) adds names that the restriction computed at mount
 * time never saw. `tools/change` fires for exactly that, so the restriction is
 * recomputed there and swapped in place — the previous one is disposed first so
 * the layers do not accumulate stale filters.
 *
 * Names registered by sibling preset rows (persistent shell, terminal, …) are
 * not in the inherited view, which is fine: those rows exist only when their
 * switch is on, so their visibility is already switch-driven.
 */
export const inject = ['tools'];

/** Reserved PTC transport; `restrict()` refuses to name it. */
const RESERVED = 'run_code';

/**
 * Deny every globally visible tool that is not in `allow`.
 *
 * @param ctx - the preset-scoped context.
 * @param config - `{ allow: string[] }` — tool names the user selected.
 */
export function apply(ctx, config) {
  if (ctx === undefined || ctx.tools === undefined) return;
  const allow = new Set(Array.isArray(config?.allow) ? config.allow : []);

  /** Current restriction disposer, replaced on every recompute. */
  let release;
  /** Signature of the deny list currently installed. */
  let installed;

  const reconcile = () => {
    let visible = [];
    try {
      visible = ctx.tools.schemas().map((schema) => schema.name);
    } catch (error) {
      console.error('[custom-prompt-mode] tool scan failed:', error);
      return;
    }
    const deny = visible.filter((name) => name !== RESERVED && !allow.has(name));
    const signature = deny.slice().sort().join('\n');
    if (signature === installed) return;
    installed = signature;

    if (release !== undefined) {
      const previous = release;
      release = undefined;
      try {
        previous();
      } catch (error) {
        console.error('[custom-prompt-mode] tool gate release failed:', error);
      }
    }
    if (deny.length === 0) return;
    try {
      release = ctx.tools.restrict({ deny });
    } catch (error) {
      console.error('[custom-prompt-mode] tool gate failed:', error);
    }
  };

  ctx.effect(() => {
    reconcile();
    /* An own-layer restriction bump also emits `tools/change`; the signature
       check above turns that into a no-op instead of a loop. */
    const off = ctx.on('tools/change', reconcile);
    return () => {
      off();
      if (release !== undefined) {
        const previous = release;
        release = undefined;
        previous();
      }
    };
  }, 'custom-prompt-mode: tool gate');
}
