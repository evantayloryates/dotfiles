export const nutritionRecipe = {
  name: 'coach-client-nutrition-roundtrip', version: 1,
  scope: 'Synthetic local development only. Two real product UIs; no mutation replay.',
  tools: ['ios_doctor', 'ios_stack_ensure', 'ios_workflow', 'ios_begin', 'ios_native', 'ios_react', 'ios_verify', 'ios_end'],
  steps: [
    {step: 'prerequisites', action: 'Call ios_doctor. Use ios_stack_ensure only at idle if local dependencies need recovery. Never reset the database.'},
    {step: 'baseline', action: 'ios_workflow action=capture, optionally selecting clientId. It validates exact local DB identity, all four false coach-admin flags, synthetic ownership and exact pairing, and returns a connection-owned baselineId. Capture before any edit.'},
    {step: 'authenticate', action: 'Use the existing guarded dev-paired-login helper from WORKFLOWS.md for normal single-use credentials in a private file. It does not seed or reassign. Independently match the coach browser and phone client IDs to the captured pair. Credentials are not returned or stored by this MCP workflow.'},
    {step: 'coach-write', action: 'In the normal coach nutrition settings UI, change Target Daily Calories to a distinct synthetic value once and blur. ios_workflow action=assert stage=coach-write with expected confirms the exact local row. Acknowledgment/HTTP 200 alone does not establish persistence.'},
    {step: 'phone-read', action: 'ios_begin once, verify ready, then use fresh native targets to navigate Nutrition/settings. ios_verify route expected=NutritionSettings; inspect the TargetCalories component using ios_react and independently match its client ID and targetDailyCalories. Use normal revisit/refetch if needed; never inject query payloads.'},
    {step: 'phone-write', action: 'Through the real bottom sheet: focus, ios_native text mode=replace, then one native Save. ios_workflow action=assert stage=client-write checks the expected persisted value. Reload the coach browser and independently check its rendered value.'},
    {step: 'restore', action: 'Before restoring through product UI, assert the last test value still occupies the exact row; stop on a collision. Restore the baseline (including null through a blank coach field). ios_workflow action=restore-check verifies current DB identity/pair and exact original nullable value. Revisit/refetch both UIs and independently verify their rendering. This tool never writes or claims a UI assertion.'},
    {step: 'cleanup', action: 'Restore the initial phone route and network state. Always ios_end in finally; its native/host idle receipt must pass. Retire private auth tokens/files per WORKFLOWS.md. If cleanup is unconfirmed, report it rather than repeating a mutation.'},
  ],
  evidence: {historicalPhysicalRoundtrip: 'passed on dated installed runtime; see WORKFLOWS.md',
    currentReadback: 'New MCP snapshot/assert receipts prove local persistence only; browser and phone rendering remain independent gates.'},
  limitations: ['No automatic product input or restoration writes.', 'A read-before-UI-restore is not an atomic compare-and-swap. A concurrent change must stop restoration; use a separately guarded CAS helper only when needed.',
    'No whole-workflow completion claim is generated from persistence checks alone.', 'Baseline IDs cannot be transferred between MCP connections; capture and complete on the same connection.']
};
