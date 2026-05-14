export function registerTokenCombatHooks({
  hooks = globalThis.Hooks,
  tokenCombatHooks = null,
  clearResolvedActorDocumentCaches = () => {},
  syncNpcDeadStatusToZeroPvFromActiveEffect = async () => {}
} = {}) {
  if (!hooks || typeof hooks.on !== "function" || !tokenCombatHooks) return [];

  const registrations = [
    ["preCreateToken", tokenCombatHooks.onPreCreateToken],
    ["drawToken", tokenCombatHooks.onDrawToken],
    ["refreshToken", tokenCombatHooks.onRefreshToken],
    ["createToken", tokenCombatHooks.onCreateToken],
    ["deleteToken", tokenCombatHooks.onDeleteToken],
    ["createToken", clearResolvedActorDocumentCaches],
    ["updateToken", clearResolvedActorDocumentCaches],
    ["deleteToken", clearResolvedActorDocumentCaches],
    ["preCreateCombatant", tokenCombatHooks.onPreCreateCombatant],
    ["updateCombat", tokenCombatHooks.onUpdateCombat],
    ["combatTurnChange", tokenCombatHooks.onCombatTurnChange],
    ["combatStart", tokenCombatHooks.onCombatStart],
    ["deleteCombat", tokenCombatHooks.onDeleteCombat],
    ["preUpdateToken", tokenCombatHooks.onPreUpdateToken],
    ["updateToken", tokenCombatHooks.onUpdateToken],
    ["createActiveEffect", async effectDoc => {
      await syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc);
    }],
    ["updateActiveEffect", async effectDoc => {
      await syncNpcDeadStatusToZeroPvFromActiveEffect(effectDoc);
    }]
  ];

  const registeredHooks = [];
  for (const [hookName, handler] of registrations) {
    if (typeof handler !== "function") continue;
    hooks.on(hookName, handler);
    registeredHooks.push(hookName);
  }
  return registeredHooks;
}
