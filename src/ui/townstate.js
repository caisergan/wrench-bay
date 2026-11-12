// Read-only view of the town state for the UI. Everything goes through core/state.js when it provides the helper
// (TOWN.md section 5) and falls back to state.town / the config when it does not yet, so the UI works before and
// after the core agent lands. `setMock()` is for ?uitest only: it overrides the answers with sample data.
import * as S from '../core/state.js';
import * as C from '../config.js';
import { events } from '../core/events.js';

const { state } = S;
let mock = null;
export function setMock(m) { mock = m; }
export const isMock = () => !!mock;

const town = () => state.town || {};
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const shopMult = () => (S.shopMult ? S.shopMult() : 1);

export const T = {
  props: C.PROPERTIES || {},
  services: C.SERVICES || {},

  townOpen() {
    if (mock) return !!mock.townOpen;
    return !!(S.townOpen ? S.townOpen() : town().open);
  },
  garageDone() {
    if (mock) return !!mock.garageDone;
    try { const p = S.progress(); return p.total > 0 && p.done >= p.total; } catch { return false; }
  },
  fameLevel() {
    if (mock) return mock.fame.level;
    return num(S.fameLevel ? S.fameLevel() : town().fameXp != null ? T.fameProgress().level : 0);
  },
  fameProgress() {
    if (mock) return mock.fame;
    const f = S.fameProgress && S.fameProgress();
    if (f) return f;
    const xp = num(town().fameXp);
    return { level: 0, xp, need: C.FAME ? Math.round(C.FAME.base) : 20, frac: 0 };
  },
  fameMult() { return mock ? 1 + 0.03 * mock.fame.level : (S.fameMult ? S.fameMult() : 1 + (C.FAME ? C.FAME.pricePerLevel : 0.03) * T.fameLevel()); },
  collectionMult() { return mock ? 1 + 0.02 * mock.classics.length : (S.collectionMult ? S.collectionMult() : 1); },
  districtOpen(id) {
    if (mock) return id === 'harbor' ? !!mock.townOpen : !!(mock.districts && mock.districts[id]);
    if (S.districtOpen) return !!S.districtOpen(id);
    return !!(town().districts || []).includes(id);
  },
  propLevel(id) {
    if (mock) return (mock.props && mock.props[id]) || 0;
    if (S.propLevel) return num(S.propLevel(id));
    return num(town().props && town().props[id]);
  },
  /** { price, fame, label } | null (price already scaled by shopMult) */
  nextPropLevel(id) {
    if (!mock && S.nextPropLevel) return S.nextPropLevel(id);
    const p = T.props[id], lv = T.propLevel(id);
    const l = p && p.levels[lv];
    if (!l) return null;
    const reason = T.fameLevel() < (l.fame || 0) ? 'fame' : p.requiresAll && !T.ownsAll() ? 'all' : null;
    return { level: lv + 1, price: Math.round(l.price * shopMult()), fame: l.fame || 0, label: l.label || null, locked: !!reason, reason };
  },
  owns: (id) => T.propLevel(id) > 0,
  ownsAll() {
    if (!mock && S.ownsAllProperties) return S.ownsAllProperties();
    for (const id in T.props) if (!T.props[id].requiresAll && !T.owns(id)) return false;
    return T.garageDone();
  },
  townProgress() {
    if (mock) return mock.progress;
    if (S.townProgress) return S.townProgress();
    let done = 0, total = 0;
    for (const id in T.props) { total += T.props[id].levels.length; done += Math.min(T.propLevel(id), T.props[id].levels.length); }
    return { done, total, next: null };
  },
  stat(key) { return mock ? (mock.stats && mock.stats[key]) || 0 : num(town().stats && town().stats[key]); },
  classics() { return mock ? mock.classics : (town().classics || []); },
  wrenches() { return mock ? mock.wrenches : (town().wrenches || []); },
  tills() { return mock ? mock.tills || {} : (town().tills || {}); },
  managers() { return mock ? mock.managers || [] : (town().managers || []); },
  proLevel(key) { return mock ? (mock.pro && mock.pro[key]) || 0 : num(town().pro && town().pro[key]); },
  proCost(key) {
    if (!mock && S.proCost) return S.proCost(key);
    const u = C.PRO_UPGRADES[key], l = T.proLevel(key);
    return l >= u.max ? Infinity : Math.round(u.base * Math.pow(u.growth, l) * shopMult());
  },
  buyPro(key) {
    if (mock) { const c = T.proCost(key); if (!Number.isFinite(c) || !S.trySpend(c)) return false; mock.pro[key] = T.proLevel(key) + 1; return true; }
    return S.buyPro ? !!S.buyPro(key) : false;
  },
  /** Hire a floor manager. Uses the core helper when it exists; otherwise a plain state change. */
  hireManager(id) {
    const m = C.MANAGERS[id];
    if (!m || T.managers().includes(id)) return false;
    if (T.fameLevel() < m.fame) return false;
    const price = Math.round(m.price * shopMult());
    if (mock) { if (!S.trySpend(price)) return false; mock.managers.push(id); return true; }
    const fn = S.buyManager || S.hireManager;
    if (fn) return !!fn(id);
    if (!state.town || !S.trySpend(price)) return false;
    (state.town.managers ||= []).push(id);
    S.save();
    events.emit('manager:hired', { id });
    return true;
  },
};
