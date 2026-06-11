/**
 * 데이터 저장소 — localStorage 기반.
 * 구조: { hcps: [...], settings: { apiKey } }
 * hcp: { id, name, hospital, department, title, memo, manualTags: [],
 *        notes: [{ id, date, text, tags: [], traits: [] }], aiSummary, aiSummaryAt }
 */

const Store = (() => {
  const STORAGE_KEY = "historynote.v1";

  let state = { hcps: [], settings: { apiKey: "" } };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = {
          hcps: Array.isArray(parsed.hcps) ? parsed.hcps : [],
          settings: { apiKey: "", ...(parsed.settings || {}) },
        };
      }
    } catch (e) {
      console.error("저장 데이터를 읽지 못했습니다:", e);
    }
    return state;
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addHcp(data) {
    const hcp = {
      id: uid(),
      name: data.name.trim(),
      hospital: data.hospital.trim(),
      department: data.department.trim(),
      title: data.title || "교수",
      memo: (data.memo || "").trim(),
      manualTags: [],
      notes: [],
      aiSummary: "",
      aiSummaryAt: "",
    };
    state.hcps.push(hcp);
    save();
    return hcp;
  }

  function updateHcp(id, data) {
    const hcp = getHcp(id);
    if (!hcp) return null;
    Object.assign(hcp, {
      name: data.name.trim(),
      hospital: data.hospital.trim(),
      department: data.department.trim(),
      title: data.title || hcp.title,
      memo: (data.memo || "").trim(),
    });
    save();
    return hcp;
  }

  function deleteHcp(id) {
    state.hcps = state.hcps.filter((h) => h.id !== id);
    save();
  }

  function getHcp(id) {
    return state.hcps.find((h) => h.id === id) || null;
  }

  function addNote(hcpId, { text, tags, traits }) {
    const hcp = getHcp(hcpId);
    if (!hcp) return null;
    const note = {
      id: uid(),
      date: new Date().toISOString(),
      text: text.trim(),
      tags: tags || [],
      traits: traits || [],
    };
    hcp.notes.unshift(note);
    save();
    return note;
  }

  function deleteNote(hcpId, noteId) {
    const hcp = getHcp(hcpId);
    if (!hcp) return;
    hcp.notes = hcp.notes.filter((n) => n.id !== noteId);
    save();
  }

  function exportJson() {
    return JSON.stringify({ hcps: state.hcps }, null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.hcps)) throw new Error("hcps 배열이 없는 파일입니다.");
    state.hcps = parsed.hcps;
    save();
  }

  return {
    load, save, addHcp, updateHcp, deleteHcp, getHcp,
    addNote, deleteNote, exportJson, importJson,
    get hcps() { return state.hcps; },
    get settings() { return state.settings; },
  };
})();
