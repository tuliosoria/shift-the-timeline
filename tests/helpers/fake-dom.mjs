// A minimal DOM for unit-testing client modules without a browser: enough HTML parsing,
// selectors, events and focus for the markup the views produce. Not a general-purpose DOM.
const VOID = new Set(['img', 'input', 'br', 'meta', 'link', 'hr']);
const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'"};
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e]);
const encode = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

class Text {
  constructor(doc, data) { this.ownerDocument = doc; this.data = data; this.parentNode = null; this.nodeType = 3; }
  get textContent() { return this.data; }
  remove() { this.parentNode?._detach(this); }
}

// Compound selectors only ("tag.class#id[attr=value]"), joined by descendant spaces or commas.
function parseCompound(text) {
  const part = {tag: null, id: null, classes: [], attrs: []};
  for (const m of text.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]|([#.]?)([\w-]+)/g)) {
    if (m[1]) part.attrs.push([m[1], m[2]]);
    else if (m[3] === '#') part.id = m[4];
    else if (m[3] === '.') part.classes.push(m[4]);
    else part.tag = m[4].toLowerCase();
  }
  return part;
}
function matchesCompound(el, p) {
  return (!p.tag || el.localName === p.tag) && (!p.id || el.id === p.id) && p.classes.every(c => el.classList.contains(c))
    && p.attrs.every(([n, v]) => el.hasAttribute(n) && (v === undefined || el.getAttribute(n) === v));
}
function matches(el, selector) {
  return selector.split(',').some(alt => {
    const parts = alt.trim().split(/\s+/).map(parseCompound);
    if (!matchesCompound(el, parts.at(-1))) return false;
    let node = el.parentNode, i = parts.length - 2;
    while (i >= 0 && node?.nodeType === 1) { if (matchesCompound(node, parts[i])) i--; node = node.parentNode; }
    return i < 0;
  });
}

class Element {
  constructor(doc, tag) {
    Object.assign(this, {ownerDocument: doc, localName: tag.toLowerCase(), childNodes: [], parentNode: null, nodeType: 1, listeners: {}, _attrs: new Map(), _value: null, scrollTop: 0, scrollHeight: 1000, clientHeight: 300, selectionStart: 0, selectionEnd: 0});
    const props = new Map();
    this.style = {setProperty: (k, v) => props.set(k, String(v)), getPropertyValue: k => props.get(k) ?? '', removeProperty: k => props.delete(k)};
  }
  get tagName() { return this.localName.toUpperCase(); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  setAttribute(n, v) { this._attrs.set(n, String(v)); }
  removeAttribute(n) { this._attrs.delete(n); }
  hasAttribute(n) { return this._attrs.has(n); }
  toggleAttribute(n, force) { const on = force ?? !this.hasAttribute(n); if (on) this.setAttribute(n, ''); else this.removeAttribute(n); return on; }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() {
    const list = () => this.className.split(/\s+/).filter(Boolean), save = l => this.setAttribute('class', l.join(' '));
    return {contains: c => list().includes(c), add: (...c) => save([...new Set([...list(), ...c])]), remove: (...c) => save(list().filter(x => !c.includes(x))),
      toggle: (c, force) => { const on = force ?? !list().includes(c); if (on) save([...new Set([...list(), c])]); else save(list().filter(x => x !== c)); return on; }};
  }
  get dataset() {
    const el = this, key = k => 'data-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    return new Proxy({}, {get: (_, k) => el.getAttribute(key(k)) ?? undefined, set: (_, k, v) => { el.setAttribute(key(k), v); return true; }});
  }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get readOnly() { return this.hasAttribute('readonly'); }
  set readOnly(v) { this.toggleAttribute('readonly', !!v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { this.toggleAttribute('hidden', !!v); }
  get type() { return this.getAttribute('type') ?? (this.localName === 'button' ? 'submit' : 'text'); }
  get value() { return this._value ?? (this.localName === 'textarea' ? this.textContent : this.getAttribute('value') ?? ''); }
  set value(v) { this._value = String(v); this.selectionStart = this.selectionEnd = this._value.length; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this._clear(); if (v !== '') this.append(String(v)); }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  set innerHTML(html) { this._clear(); for (const n of parse(this.ownerDocument, html)) this._adopt(n); }
  get outerHTML() { return serialize(this); }
  _clear() { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; if (this.ownerDocument.activeElement && !this.ownerDocument.body.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body; }
  _adopt(n) { n.parentNode?._detach(n); n.parentNode = this; this.childNodes.push(n); }
  _detach(n) { this.childNodes = this.childNodes.filter(c => c !== n); n.parentNode = null; }
  append(...nodes) { for (const n of nodes) this._adopt(typeof n === 'string' ? new Text(this.ownerDocument, n) : n); }
  appendChild(n) { this._adopt(n); return n; }
  remove() { const doc = this.ownerDocument; this.parentNode?._detach(this); if (this.contains(doc.activeElement)) doc.activeElement = doc.body; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  *_descendants() { for (const c of this.children) { yield c; yield* c._descendants(); } }
  querySelectorAll(sel) { return [...this._descendants()].filter(el => matches(el, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  matches(sel) { return matches(this, sel); }
  closest(sel) { for (let x = this; x?.nodeType === 1; x = x.parentNode) if (matches(x, sel)) return x; return null; }
  focus() {
    const doc = this.ownerDocument, before = doc.activeElement;
    if (before === this) return;
    doc.activeElement = this;
    if (before && before !== doc.body) fire(before, 'focusout');
    fire(this, 'focusin');
  }
  blur() { const doc = this.ownerDocument; if (doc.activeElement === this) { doc.activeElement = doc.body; fire(this, 'focusout'); } }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn); }
  dispatchEvent(event) {
    event.target ??= this;
    for (let x = this; x && !event.cancelBubble; x = x.parentNode ?? (x === x.ownerDocument?.documentElement ? x.ownerDocument : null)) {
      event.currentTarget = x;
      for (const fn of [...(x.listeners?.[event.type] ?? [])]) fn.call(x, event);
    }
    return !event.defaultPrevented;
  }
}

function serialize(n) {
  if (n.nodeType === 3) return encode(n.data);
  const attrs = [...n._attrs].map(([k, v]) => v === '' ? ` ${k}` : ` ${k}="${encode(v)}"`).join('');
  return VOID.has(n.localName) ? `<${n.localName}${attrs}>` : `<${n.localName}${attrs}>${n.childNodes.map(serialize).join('')}</${n.localName}>`;
}

function parse(doc, html) {
  const root = new Element(doc, 'template'), stack = [root];
  for (const [token, close, open, attrs, text] of String(html).matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g)) {
    if (token.startsWith('<!--')) continue;
    if (text !== undefined) { stack.at(-1).append(decode(text)); continue; }
    if (close) { const i = stack.findLastIndex(el => el.localName === close.toLowerCase()); if (i > 0) stack.length = i; continue; }
    const el = new Element(doc, open);
    for (const [, name, dq, sq, bare] of (attrs ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.setAttribute(name, decode(dq ?? sq ?? bare ?? ''));
    stack.at(-1)._adopt(el);
    if (!VOID.has(el.localName)) stack.push(el);
  }
  const nodes = [...root.childNodes];
  for (const n of nodes) n.parentNode = null;
  return nodes;
}

export function createDocument(html = '') {
  const doc = {listeners: {}, nodeType: 9, defaultView: null};
  doc.createElement = tag => new Element(doc, tag);
  doc.createTextNode = data => new Text(doc, data);
  doc.documentElement = new Element(doc, 'html');
  doc.body = new Element(doc, 'body');
  doc.documentElement.append(doc.body);
  doc.activeElement = doc.body;
  doc.body.innerHTML = html;
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel);
  doc.addEventListener = (type, fn) => (doc.listeners[type] ??= []).push(fn);
  doc.removeEventListener = (type, fn) => { doc.listeners[type] = (doc.listeners[type] ?? []).filter(f => f !== fn); };
  return doc;
}

// Dispatches a bubbling event with the given properties (key, shiftKey, ...).
export function fire(el, type, props = {}) {
  const event = {type, bubbles: true, defaultPrevented: false, cancelBubble: false, ...props,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }};
  el.dispatchEvent(event);
  return event;
}

// A window-ish event target (for visualViewport and resize).
export function fakeTarget(props = {}) {
  const listeners = {};
  return Object.assign({
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter(f => f !== fn); },
    emit: type => { for (const fn of [...(listeners[type] ?? [])]) fn({type}); },
    listenerCount: type => (listeners[type] ?? []).length,
  }, props);
}
