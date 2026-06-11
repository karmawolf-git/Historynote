/**
 * 데이터 저장소 — localStorage 기반.
 * 구조: { hcps: [...], settings: { apiKey } }
 * hcp: { id, name, hospital, department, title, memo, schedule, manualTags: [],
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
      schedule: (data.schedule || "").trim(),
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
      schedule: (data.schedule || "").trim(),
    });
    save();
    return hcp;
  }

  /**
   * Hospital TimeTable에서 복사한 행들을 일괄 반영.
   * 같은 병원에 동명 의사가 있으면 일정/과만 갱신, 없으면 새로 등록.
   * rows: [{ name, department, schedule, room, notes }]
   */
  function upsertSchedule(hospital, rows) {
    let added = 0, updated = 0;
    for (const r of rows) {
      const schedule = [r.schedule, r.room].filter(Boolean).join(" · ");
      const existing = state.hcps.find(
        (h) => h.hospital === hospital && h.name === r.name &&
          (!r.department || h.department === r.department)
      );
      if (existing) {
        if (schedule) existing.schedule = schedule;
        if (r.department) existing.department = r.department;
        if (r.notes && !existing.memo) existing.memo = r.notes;
        updated++;
      } else {
        addHcp({
          name: r.name,
          hospital,
          department: r.department || "미지정",
          title: "교수",
          memo: r.notes || "",
          schedule,
        });
        added++;
      }
    }
    save();
    return { added, updated };
  }

  function deleteHcp(id) {
    state.hcps = state.hcps.filter((h) => h.id !== id);
    save();
  }

  // 병원 전체 삭제 — 해당 병원 소속 의사 모두 제거
  function deleteHospital(hospital) {
    state.hcps = state.hcps.filter((h) => h.hospital !== hospital);
    save();
  }

  // 특정 병원의 진료과 삭제 — 해당 과 소속 의사 모두 제거
  function deleteDepartment(hospital, department) {
    state.hcps = state.hcps.filter(
      (h) => !(h.hospital === hospital && h.department === department)
    );
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
    load, save, addHcp, updateHcp, deleteHcp, deleteHospital, deleteDepartment, getHcp,
    addNote, deleteNote, exportJson, importJson, upsertSchedule,
    get hcps() { return state.hcps; },
    get settings() { return state.settings; },
  };
})();
