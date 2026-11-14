/**
 * Preset child of **Custom prompt 模式**.
 *
 * Runs inside the `custom-prompt` preset scope, where a section registered here
 * shadows the global `deployment:persona-prefix` slot — that name identity is
 * what makes this a REPLACEMENT of the deployment persona rather than a second,
 * duplicate one.
 *
 * `complete: true` is the whole point: after the cooperative waterfall settles,
 * assembly restores this section as the SOLE prompt section, so no DSH-owned
 * prompt text survives. It does not touch `tools` — tool schemas come from the
 * layer's tool providers, not from sections — so this mode still has the
 * 极简模式 tool set.
 *
 * `text` is a FUNCTION, re-evaluated on every assembly, so a prompt edited in
 * the settings page applies on the next turn with no restart. `interpolate` is
 * false because user-authored prose may contain `{{…}}` that is not a variable,
 * which would otherwise throw while rendering.
 */
export const inject = ['systemPrompt', 'customPromptMode'];

/** The slot the shipped persona plugin also names — identity is the contract. */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix';

/**
 * Register the complete prompt section and drop the optional runtime contexts.
 *
 * @param ctx - the preset child context.
 */
export function apply(ctx) {
  const prompt = ctx.customPromptMode;

  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_PREFIX_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    text: () => prompt.text,
    interpolate: false,
    complete: true,
  }), 'custom-prompt-mode: prompt section');

  /* Without this, the sandbox / approval / delegation snapshots would survive
     as optional contexts and contradict the user's own prompt. */
  ctx.systemPrompt.suppressRuntimeContext();

  /* Suppression alone is not enough: `dsh-working-directory` registers
     `working-directory:current` with `required: true`, and assembly keeps every
     required context alive after the filter. Naming the same context here
     shadows it inside this scope, so the runtime snapshot renders empty. */
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'working-directory:current',
    order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
    required: false,
    interpolate: false,
    text: '',
  }), 'custom-prompt-mode: working-directory context');
}
