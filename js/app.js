/**
 * UI 렌더링 및 이벤트 처리.
 * 사이드바: 병원 → 진료과 → 의사 트리 / 메인: 선택한 의사 상세.
 */

(() => {
  Store.load();

  let selectedId = null;
  let searchQuery = "";
  let editingId = null; // 의사 모달이 수정 모드일 때의 id

  const $ = (sel) => document.querySelector(sel);
  const sidebar = $("#sidebar");
  const detail = $("#detail");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---------- 검색 필터 ----------

  function matchesSearch(hcp) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if ([hcp.name, hcp.hospital, hcp.department, hcp.title].some((f) => f.toLowerCase().includes(q))) return true;
    const { tagCounts, traitCounts } = Tagger.aggregate(hcp);
    return [...Object.keys(tagCounts), ...Object.keys(traitCounts)]
      .some((t) => t.toLowerCase().includes(q));
  }

  // ---------- 사이드바: 병원 > 과 > 의사 ----------

  function renderSidebar() {
    const visible = Store.hcps.filter(matchesSearch);

    if (!Store.hcps.length) {
      sidebar.innerHTML = `
        <div class="empty-side">
          <p>등록된 의사가 없습니다.</p>
          <button class="btn btn-primary" id="btn-sample">샘플 데이터 불러오기</button>
        </div>`;
      $("#btn-sample").addEventListener("click", () => {
        loadSampleData();
        render();
      });
      return;
    }

    // 병원 → 과 → [hcp] 그룹핑 (가나다순)
    const tree = {};
    for (const h of visible) {
      (tree[h.hospital] ??= {});
      (tree[h.hospital][h.department] ??= []).push(h);
    }

    const hospitals = Object.keys(tree).sort((a, b) => a.localeCompare(b, "ko"));
    let html = "";
    for (const hosp of hospitals) {
      const depts = Object.keys(tree[hosp]).sort((a, b) => a.localeCompare(b, "ko"));
      const hospCount = depts.reduce((s, d) => s + tree[hosp][d].length, 0);
      html += `<details open class="tree-hospital"><summary>🏥 ${esc(hosp)} <span class="count">${hospCount}</span></summary>`;
      for (const dept of depts) {
        const docs = tree[hosp][dept].sort((a, b) => a.name.localeCompare(b.name, "ko"));
        html += `<details open class="tree-dept"><summary>${esc(dept)} <span class="count">${docs.length}</span></summary><ul>`;
        for (const doc of docs) {
          const { tagCounts } = Tagger.aggregate(doc);
          const topTags = Tagger.sortedEntries(tagCounts).slice(0, 2).map(([t]) => t);
          html += `
            <li class="tree-doc ${doc.id === selectedId ? "selected" : ""}" data-id="${doc.id}">
              <span class="doc-name">${esc(doc.name)} <small>${esc(doc.title)}</small></span>
              ${topTags.length ? `<span class="doc-tags">${topTags.map((t) => `<span class="mini-tag">${esc(t)}</span>`).join("")}</span>` : ""}
            </li>`;
        }
        html += `</ul></details>`;
      }
      html += `</details>`;
    }

    if (!visible.length) html = `<div class="empty-side"><p>검색 결과가 없습니다.</p></div>`;
    sidebar.innerHTML = html;

    sidebar.querySelectorAll(".tree-doc").forEach((el) => {
      el.addEventListener("click", () => {
        selectedId = el.dataset.id;
        render();
      });
    });
  }

  // ---------- 상세 패널 ----------

  function renderDetail() {
    const hcp = Store.getHcp(selectedId);
    if (!hcp) {
      detail.innerHTML = `
        <div class="empty-detail">
          <p>👈 왼쪽 목록에서 의사를 선택하세요.</p>
          <p class="hint">대화 후 메모를 입력하면 관심 키워드와 성향이 자동으로 태깅됩니다.</p>
        </div>`;
      return;
    }

    const { tagCounts, traitCounts } = Tagger.aggregate(hcp);
    const tags = Tagger.sortedEntries(tagCounts);
    const traits = Tagger.sortedEntries(traitCounts);
    const materials = Tagger.recommendMaterials(hcp);
    const hasApiKey = !!Store.settings.apiKey;

    detail.innerHTML = `
      <div class="profile-card">
        <div class="profile-head">
          <div>
            <h2>${esc(hcp.name)} <span class="title-badge">${esc(hcp.title)}</span></h2>
            <p class="affil">🏥 ${esc(hcp.hospital)} · ${esc(hcp.department)}${hcp.memo ? ` · ${esc(hcp.memo)}` : ""}</p>
          </div>
          <div class="profile-actions">
            <button class="btn btn-sm" id="btn-edit-hcp">수정</button>
            <button class="btn btn-sm btn-danger" id="btn-delete-hcp">삭제</button>
          </div>
        </div>
      </div>

      <div class="grid-2col">
        <section class="card">
          <h3>🏷️ 관심 키워드</h3>
          <div class="tag-cloud">
            ${tags.length
              ? tags.map(([t, c]) => `
                  <span class="tag ${hcp.manualTags.includes(t) ? "manual" : ""}" data-tag="${esc(t)}">
                    ${esc(t)} <b>${c}</b>${hcp.manualTags.includes(t) ? `<button class="tag-x" data-remove-tag="${esc(t)}" title="수동 태그 삭제">×</button>` : ""}
                  </span>`).join("")
              : `<p class="hint">메모를 입력하면 키워드가 자동 추출됩니다.</p>`}
          </div>
          <form id="manual-tag-form" class="inline-form">
            <input name="tag" list="known-tags" placeholder="태그 직접 추가 (예: 당뇨)" />
            <datalist id="known-tags">${TAG_DICTIONARY.map((e) => `<option value="${esc(e.tag)}">`).join("")}</datalist>
            <button class="btn btn-sm" type="submit">추가</button>
          </form>
        </section>

        <section class="card">
          <h3>🧭 성향 요약</h3>
          ${traits.length ? `<div class="trait-row">${traits.map(([t, c]) => `<span class="trait">${esc(t)} <b>${c}</b></span>`).join("")}</div>` : ""}
          <div class="summary-box" id="summary-box">${
            hcp.aiSummary
              ? `<p class="summary-text">${esc(hcp.aiSummary)}</p><p class="summary-meta">🤖 AI 요약 · ${fmtDate(hcp.aiSummaryAt)}</p>`
              : `<p class="summary-text">${esc(Tagger.buildSummary(hcp)).replace(/\n/g, "<br>")}</p><p class="summary-meta">내장 규칙 기반 요약</p>`
          }</div>
          <button class="btn btn-sm" id="btn-ai-summary" ${hasApiKey ? "" : "disabled title='설정에서 API 키를 입력하면 사용할 수 있습니다'"}>
            🤖 AI 성향 요약 ${hcp.aiSummary ? "다시 " : ""}생성
          </button>
        </section>
      </div>

      <section class="card">
        <h3>📚 관심사 기반 자료 추천</h3>
        ${materials.length
          ? `<ul class="materials">${materials.map((m) => `
              <li>
                <div><strong>${esc(m.title)}</strong><p>${esc(m.desc)}</p></div>
                <span class="match">${m.matched.map((t) => esc(t)).join(" · ")}</span>
              </li>`).join("")}</ul>`
          : `<p class="hint">관심 키워드가 쌓이면 맞춤 자료가 추천됩니다.</p>`}
      </section>

      <section class="card">
        <h3>✍️ 대화 메모 <small class="hint-inline">${hasApiKey ? "저장 시 Claude AI가 태그를 추출합니다" : "저장 시 내장 사전으로 태그를 추출합니다"}</small></h3>
        <form id="note-form">
          <textarea name="text" rows="3" placeholder="예: 신약 효과는 인정하지만 약가가 부담된다고 함. CVOT 논문 리프린트 요청." required></textarea>
          <div class="note-form-actions">
            <span id="note-status" class="hint-inline"></span>
            <button class="btn btn-primary" type="submit" id="btn-save-note">메모 저장 + 자동 태그</button>
          </div>
        </form>
        <ul class="timeline">
          ${hcp.notes.map((n) => `
            <li>
              <div class="note-head">
                <time>${fmtDate(n.date)}</time>
                <button class="btn-link" data-del-note="${n.id}">삭제</button>
              </div>
              <p class="note-text">${esc(n.text)}</p>
              <div class="note-tags">
                ${n.tags.map((t) => `<span class="mini-tag">${esc(t)}</span>`).join("")}
                ${n.traits.map((t) => `<span class="mini-tag trait-tag">${esc(t)}</span>`).join("")}
              </div>
            </li>`).join("")}
        </ul>
        ${!hcp.notes.length ? `<p class="hint">아직 메모가 없습니다.</p>` : ""}
      </section>
    `;

    bindDetailEvents(hcp);
  }

  function bindDetailEvents(hcp) {
    $("#btn-edit-hcp").addEventListener("click", () => openHcpDialog(hcp));
    $("#btn-delete-hcp").addEventListener("click", () => {
      if (confirm(`'${hcp.name}' 의사와 메모 ${hcp.notes.length}건을 삭제할까요?`)) {
        Store.deleteHcp(hcp.id);
        selectedId = null;
        render();
      }
    });

    $("#manual-tag-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const tag = e.target.tag.value.trim();
      if (tag && !hcp.manualTags.includes(tag)) {
        hcp.manualTags.push(tag);
        Store.save();
        render();
      }
    });

    detail.querySelectorAll("[data-remove-tag]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        hcp.manualTags = hcp.manualTags.filter((t) => t !== btn.dataset.removeTag);
        Store.save();
        render();
      });
    });

    detail.querySelectorAll("[data-del-note]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("이 메모를 삭제할까요?")) {
          Store.deleteNote(hcp.id, btn.dataset.delNote);
          render();
        }
      });
    });

    $("#note-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (!text) return;
      const status = $("#note-status");
      const saveBtn = $("#btn-save-note");
      const apiKey = Store.settings.apiKey;

      saveBtn.disabled = true;
      let result;
      if (apiKey) {
        status.textContent = "🤖 AI 분석 중...";
        result = await Tagger.aiExtract(apiKey, text);
        if (result.aiFailed) status.textContent = "AI 실패 — 내장 사전으로 태깅했습니다.";
      } else {
        result = Tagger.extract(text);
      }
      Store.addNote(hcp.id, { text, tags: result.tags, traits: result.traits });
      saveBtn.disabled = false;
      render();
    });

    const aiBtn = $("#btn-ai-summary");
    aiBtn.addEventListener("click", async () => {
      const apiKey = Store.settings.apiKey;
      if (!apiKey) return;
      if (!hcp.notes.length) { alert("요약할 메모가 없습니다."); return; }
      aiBtn.disabled = true;
      aiBtn.textContent = "🤖 요약 생성 중...";
      try {
        hcp.aiSummary = await Tagger.aiSummarize(apiKey, hcp);
        hcp.aiSummaryAt = new Date().toISOString();
        Store.save();
      } catch (err) {
        alert("AI 요약에 실패했습니다: " + err.message);
      }
      render();
    });
  }

  // ---------- 의사 추가/수정 모달 ----------

  const hcpDialog = $("#hcp-dialog");
  const hcpForm = $("#hcp-form");

  function openHcpDialog(hcp) {
    editingId = hcp ? hcp.id : null;
    $("#hcp-dialog-title").textContent = hcp ? "의사 정보 수정" : "의사 추가";
    hcpForm.name.value = hcp?.name || "";
    hcpForm.hospital.value = hcp?.hospital || "";
    hcpForm.department.value = hcp?.department || "";
    hcpForm.title.value = hcp?.title || "교수";
    hcpForm.memo.value = hcp?.memo || "";
    // 기존 병원/과를 자동완성으로 제안
    $("#hospital-list").innerHTML = [...new Set(Store.hcps.map((h) => h.hospital))]
      .map((h) => `<option value="${esc(h)}">`).join("");
    $("#department-list").innerHTML = [...new Set(Store.hcps.map((h) => h.department))]
      .map((d) => `<option value="${esc(d)}">`).join("");
    hcpDialog.showModal();
  }

  hcpForm.addEventListener("submit", () => {
    const data = Object.fromEntries(new FormData(hcpForm));
    if (editingId) {
      Store.updateHcp(editingId, data);
    } else {
      const hcp = Store.addHcp(data);
      selectedId = hcp.id;
    }
    render();
  });
  $("#hcp-cancel").addEventListener("click", () => hcpDialog.close());

  // ---------- 설정 모달 ----------

  const settingsDialog = $("#settings-dialog");
  const settingsForm = $("#settings-form");

  $("#btn-settings").addEventListener("click", () => {
    settingsForm.apiKey.value = Store.settings.apiKey || "";
    settingsDialog.showModal();
  });
  settingsForm.addEventListener("submit", () => {
    Store.settings.apiKey = settingsForm.apiKey.value.trim();
    Store.save();
    Tagger.resetClient();
    render();
  });
  $("#settings-cancel").addEventListener("click", () => settingsDialog.close());

  // ---------- 헤더 이벤트 ----------

  $("#btn-add-hcp").addEventListener("click", () => openHcpDialog(null));

  $("#search-input").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderSidebar();
  });

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([Store.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `historynote-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (Store.hcps.length && !confirm("기존 데이터를 가져온 데이터로 교체합니다. 계속할까요?")) {
      e.target.value = "";
      return;
    }
    try {
      Store.importJson(await file.text());
      selectedId = null;
      render();
    } catch (err) {
      alert("가져오기에 실패했습니다: " + err.message);
    }
    e.target.value = "";
  });

  // ---------- 렌더 ----------

  function render() {
    renderSidebar();
    renderDetail();
  }

  render();
})();
