// "Deduction unlocked" toasts: one at a time in the corner #toasts region (role="status"),
// about four seconds each, queued, never focusable. Reduced motion is handled in CSS.
export function createToaster({document: doc = globalThis.document, duration = 4000, schedule = setTimeout} = {}) {
  const queue = [];
  let showing = false;
  function next() {
    const deduction = queue.shift(), region = doc.getElementById('toasts');
    showing = !!deduction && !!region;
    if (!showing) return;
    const toast = doc.createElement('div'), title = doc.createElement('b'), text = doc.createElement('span');
    toast.className = 'toast';
    title.textContent = 'Deduction unlocked';
    text.textContent = deduction.text;
    toast.append(title, text);
    region.append(toast);
    schedule(() => { toast.remove(); next(); }, duration);
  }
  return {
    showUnlocked(deductions) {
      for (const d of deductions ?? []) if (d?.text) queue.push(d);
      if (!showing) next();
    },
  };
}

let shared;
export function showUnlocked(deductions) { (shared ??= createToaster()).showUnlocked(deductions); }

// Deductions in `next` that `previous` did not have, for the same room and player. Nothing on
// first load, after a reload or when switching rooms: only unlocks that happen while watching.
export function freshDeductions(previous, next) {
  if (!previous?.me || !next?.me || previous.code !== next.code || previous.me.id !== next.me.id) return [];
  const known = new Set(previous.me.deductions.map(d => d.id));
  return next.me.deductions.filter(d => !known.has(d.id));
}
