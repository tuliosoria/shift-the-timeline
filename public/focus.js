// Snapshot semantic identity before replacing UI markup. Never key controls by position:
// another agent joining or a new result appearing must not redirect a keyboard action.
const actions = ['data-action', 'data-tab', 'data-entry'];
function identity(element) {
  if (element.id) return ['id', element.id];
  for (const attribute of actions) if (element.hasAttribute(attribute)) return [attribute, element.getAttribute(attribute)];
  return null;
}
export function captureFocus(root) {
  const element = root.ownerDocument.activeElement;
  if (!root.contains(element)) return null;
  return {element, identity: identity(element), tag: element.tagName,
    selection: typeof element.selectionStart === 'number' ? [element.selectionStart, element.selectionEnd, element.selectionDirection] : null};
}
export function restoreFocus(root, saved, {fallback = null, match = true} = {}) {
  if (!saved) return;
  const document = root.ownerDocument, active = document.activeElement;
  // Do not disturb retained inputs/carets, deliberate focus moves, or an open modal.
  const dialog = active?.closest?.('dialog');
  if (active && active !== document.body && document.documentElement.contains(active) && (!dialog || dialog.open)) return;
  const candidates = match && saved.identity
    ? [root, ...root.querySelectorAll('[id], button')].filter(element => element.tagName === saved.tag && element.getAttribute(saved.identity[0]) === saved.identity[1]) : [];
  const target = candidates.length === 1 && !candidates[0].disabled && !candidates[0].closest('[hidden], [inert]') ? candidates[0] : fallback;
  target?.focus({preventScroll: true});
  if (target === candidates[0] && saved.selection) {
    try { target.setSelectionRange(...saved.selection); } catch {} // Non-text input types have no caret API.
  }
}
