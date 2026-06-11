/**
 * 태깅 엔진.
 * - 규칙 기반: dictionary.js의 사전으로 즉시 태그/성향 추출 (오프라인 기본 동작)
 * - AI 기반: Anthropic API 키 설정 시 Claude(claude-opus-4-8)로 분석·요약
 */

const Tagger = (() => {
  // ---------- 규칙 기반 ----------

  function extract(text) {
    const lower = text.toLowerCase();
    const tags = TAG_DICTIONARY
      .filter((e) => e.patterns.some((p) => lower.includes(p)))
      .map((e) => e.tag);
    const traits = TRAIT_RULES
      .filter((e) => e.patterns.some((p) => lower.includes(p)))
      .map((e) => e.trait);
    return { tags, traits };
  }

  // HCP의 모든 메모 + 수동 태그를 합산해 { tagCounts, traitCounts } 반환
  function aggregate(hcp) {
    const tagCounts = {};
    const traitCounts = {};
    for (const note of hcp.notes) {
      for (const t of note.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
      for (const t of note.traits) traitCounts[t] = (traitCounts[t] || 0) + 1;
    }
    for (const t of hcp.manualTags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    return { tagCounts, traitCounts };
  }

  function sortedEntries(counts) {
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  // 규칙 기반 성향 요약문 생성
  function buildSummary(hcp) {
    const { tagCounts, traitCounts } = aggregate(hcp);
    const traits = sortedEntries(traitCounts);
    const tags = sortedEntries(tagCounts);

    if (!traits.length && !tags.length) {
      return "아직 분석할 메모가 없습니다. 대화 후 메모를 남기면 성향 요약이 자동 생성됩니다.";
    }

    const lines = [];

    // 대비가 뚜렷한 성향 쌍은 비교 문장으로 표현
    const ev = traitCounts["근거 중시"] || 0;
    const price = traitCounts["약가 민감"] || 0;
    if (ev > price && ev >= 2) lines.push("약가보다 근거 수준에 민감합니다.");
    else if (price > ev && price >= 2) lines.push("임상 근거보다 약가·비용에 더 민감합니다.");

    if (traits.length) {
      const top = traits.slice(0, 3).map(([t, c]) => `${t}(${c}회)`).join(", ");
      lines.push(`두드러진 성향: ${top}`);
    }
    if (tags.length) {
      const top = tags.slice(0, 4).map(([t]) => t).join(", ");
      lines.push(`주요 관심 주제: ${top}`);
    }
    if (traits.length && TRAIT_STRATEGIES[traits[0][0]]) {
      lines.push(`다음 방문 팁: ${TRAIT_STRATEGIES[traits[0][0]]}`);
    }
    return lines.join("\n");
  }

  // 태그 겹침 점수로 자료 추천 (상위 4개)
  function recommendMaterials(hcp) {
    const { tagCounts } = aggregate(hcp);
    return MATERIALS
      .map((m) => ({
        ...m,
        score: m.tags.reduce((s, t) => s + (tagCounts[t] || 0), 0),
        matched: m.tags.filter((t) => tagCounts[t]),
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }

  // ---------- AI 기반 (Anthropic API) ----------

  let anthropicClientPromise = null;

  function getClient(apiKey) {
    if (!anthropicClientPromise) {
      // SDK는 AI 기능 사용 시점에만 동적 로드 — 오프라인에서도 앱 자체는 동작
      anthropicClientPromise = import("https://esm.sh/@anthropic-ai/sdk@latest")
        .then(({ default: Anthropic }) =>
          new Anthropic({ apiKey, dangerouslyAllowBrowser: true }));
    }
    return anthropicClientPromise;
  }

  function resetClient() {
    anthropicClientPromise = null;
  }

  const KNOWN_TAGS = TAG_DICTIONARY.map((e) => e.tag);
  const KNOWN_TRAITS = TRAIT_RULES.map((e) => e.trait);

  // 메모 1건을 Claude로 분석 → { tags, traits }. 실패 시 규칙 기반으로 폴백.
  async function aiExtract(apiKey, text) {
    try {
      const client = await getClient(apiKey);
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system:
          "당신은 제약영업(MR) CRM의 메모 분석기입니다. 의사와의 대화 메모에서 " +
          "관심 주제 태그와 의사의 성향을 추출합니다. 태그는 가능하면 다음 표준 목록에서 고르고, " +
          "목록에 없는 중요한 주제는 짧은 한국어 명사구로 새로 만들 수 있습니다.\n" +
          `표준 태그: ${KNOWN_TAGS.join(", ")}\n` +
          `표준 성향: ${KNOWN_TRAITS.join(", ")}\n` +
          "메모에 실제 근거가 있는 항목만 추출하세요.",
        messages: [{ role: "user", content: `다음 메모를 분석하세요:\n\n${text}` }],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                tags: { type: "array", items: { type: "string" } },
                traits: { type: "array", items: { type: "string" } },
              },
              required: ["tags", "traits"],
              additionalProperties: false,
            },
          },
        },
      });
      if (response.stop_reason === "refusal") throw new Error("AI가 분석을 거부했습니다.");
      const textBlock = response.content.find((b) => b.type === "text");
      const parsed = JSON.parse(textBlock.text);
      // 규칙 기반 결과와 합집합 — AI가 놓친 사전 키워드도 보존
      const rule = extract(text);
      return {
        tags: [...new Set([...parsed.tags, ...rule.tags])],
        traits: [...new Set([...parsed.traits, ...rule.traits])],
      };
    } catch (e) {
      console.warn("AI 분석 실패, 규칙 기반으로 대체:", e);
      return { ...extract(text), aiFailed: true };
    }
  }

  // 전체 메모를 Claude로 요약 → 성향 요약 텍스트
  async function aiSummarize(apiKey, hcp) {
    const client = await getClient(apiKey);
    const notesText = hcp.notes
      .slice()
      .reverse()
      .map((n) => `[${n.date.slice(0, 10)}] ${n.text}`)
      .join("\n");
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "당신은 제약영업(MR) CRM의 분석가입니다. 의사와의 대화 메모 이력을 보고 " +
        "이 의사의 성향과 관심사를 3~5문장으로 요약하세요. " +
        "반드시 포함: (1) 핵심 성향 — 예: '약가보다 근거 수준에 민감함', " +
        "(2) 주요 관심 질환/주제, (3) 다음 방문 시 구체적인 접근 전략 1가지. " +
        "메모에 근거 없는 추측은 하지 마세요. 한국어 평문으로만 답하세요.",
      messages: [{
        role: "user",
        content: `의사: ${hcp.name} (${hcp.hospital} ${hcp.department} ${hcp.title})\n\n메모 이력:\n${notesText}`,
      }],
    });
    if (response.stop_reason === "refusal") throw new Error("AI가 요약을 거부했습니다.");
    return response.content.find((b) => b.type === "text").text.trim();
  }

  return {
    extract, aggregate, sortedEntries, buildSummary, recommendMaterials,
    aiExtract, aiSummarize, resetClient,
  };
})();
