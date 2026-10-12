/* ที่เก็บเที่ยวเรือของ Dashboard
   เปิดใน claude.ai: ใช้ฐานข้อมูลร่วม (collection "voyages") ทุกคนที่เปิดลิงก์เห็นข้อมูลเดียวกัน
   เปิดที่อื่น (เช่น GitHub Pages): เก็บในเบราว์เซอร์เครื่องนี้ เห็นเฉพาะเครื่องนี้ */
const Store = (() => {
  const KEY = "hal-storage-voyages";
  let db = null, mode = "loading", canWrite = true, docs = [];
  const subs = [];
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } };
  const writeLocal = o => localStorage.setItem(KEY, JSON.stringify(o));   // throws when storage is blocked or full
  const emit = () => subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  const useLocal = () => { db = null; mode = "local"; docs = Object.values(readLocal()); emit(); };

  const ready = (async () => {
    if (!window.claude || !window.claude.use) { useLocal(); return; }
    try { db = await window.claude.use("db"); } catch (e) { db = null; }
    if (!db) { useLocal(); return; }
    try { const u = await window.claude.use("user"); if (u) { const c = await u.can("data.write"); if (c === false) canWrite = false; } } catch (e) {}
    db.collection("voyages").onSnapshot(snap => {
      docs = snap.docs.map(d => d.data()).filter(v => v && v.meta && v.sum);
      mode = "db"; emit();
    }, () => useLocal());
  })();

  window.addEventListener("storage", e => { if (e.key === KEY && mode === "local") { docs = Object.values(readLocal()); emit(); } });

  return {
    get mode() { return mode; },
    get canWrite() { return canWrite; },
    get docs() { return docs; },
    ready,
    onChange(f) { subs.push(f); if (mode !== "loading") f(); },
    async save(id, doc) {
      await ready;
      if (db) return db.collection("voyages").doc(id).set(doc);
      const o = readLocal(); o[id] = doc; writeLocal(o); docs = Object.values(o); emit();
    },
    async remove(id) {
      await ready;
      if (db) return db.collection("voyages").doc(id).delete();
      const o = readLocal(); delete o[id]; writeLocal(o); docs = Object.values(o); emit();
    },
  };
})();
