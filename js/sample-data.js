/**
 * 데모용 샘플 데이터 — 빈 상태에서 "샘플 데이터 불러오기"로 주입.
 * 메모의 태그/성향은 주입 시 규칙 기반 태거로 자동 추출한다.
 */

const SAMPLE_HCPS = [
  {
    name: "김민준", hospital: "서울중앙병원", department: "내분비내과", title: "교수",
    schedule: "화오전, 목오전 · 본관 304호", memo: "",
    notes: [
      "신약 효과는 인정하지만 약가가 부담된다고 함. 환자 본인부담금 비교 자료 요청.",
      "CVOT 데이터 중 신장 보호 서브그룹 분석에 관심. NEJM 논문 리프린트 보내달라고 하심.",
      "저혈당 부작용 때문에 고령 환자에는 신중하게 쓰고 있다고 함. 안전성 데이터 궁금해함.",
      "1일 1회 복용으로 바뀐 뒤 환자 순응도가 좋아졌다는 피드백. 복약순응도 개선 데이터 있으면 공유 요청.",
    ],
  },
  {
    name: "이서연", hospital: "서울중앙병원", department: "내분비내과", title: "부교수",
    schedule: "월오후, 수오전", memo: "",
    notes: [
      "급여 인정기준이 까다로워 삭감 걱정. 심평원 고시 변경 사항 정리해서 전달 요청.",
      "가이드라인 개정에서 권고 등급이 올라간 부분을 강의 자료에 넣고 싶다고 함.",
    ],
  },
  {
    name: "박지훈", hospital: "서울중앙병원", department: "순환기내과", title: "교수",
    memo: "학회 좌장 다수",
    notes: [
      "심부전 HFpEF 환자에서 병용요법 데이터에 관심 많음. 최근 RCT 결과 논의함.",
      "다음 달 심포지엄 좌장 예정. 강연 슬라이드용 MACE 데이터 요청.",
      "신약은 데이터가 충분히 쌓이기 전에는 잘 바꾸지 않는 편이라고 함. 보수적.",
    ],
  },
  {
    name: "최예린", hospital: "한강대학교병원", department: "신장내과", title: "조교수",
    memo: "",
    notes: [
      "CKD 환자 eGFR 구간별 용량 조절 기준 문의. 신기능 용량 가이드 카드 전달함.",
      "단백뇨 감소 데이터에 관심. 리얼월드 데이터 연구 참여 의향 있음.",
    ],
  },
  {
    name: "정도현", hospital: "한강대학교병원", department: "가정의학과", title: "과장",
    memo: "오후 외래만",
    notes: [
      "환자 교육 리플렛 반응이 좋았다고 함. 복약지도 자료 추가 요청.",
      "비만 동반 당뇨 환자 체중 감량 효과 비교 자료 궁금해함. 환자 입장에서 부담 없는 옵션 선호.",
    ],
  },
];

function loadSampleData() {
  for (const s of SAMPLE_HCPS) {
    const hcp = Store.addHcp(s);
    // 오래된 메모부터 추가해 최신 메모가 위로 오게 함
    s.notes.slice().reverse().forEach((text, i) => {
      const { tags, traits } = Tagger.extract(text);
      const note = Store.addNote(hcp.id, { text, tags, traits });
      // 날짜를 과거로 분산시켜 타임라인처럼 보이게 함
      const d = new Date();
      d.setDate(d.getDate() - (s.notes.length - i) * 9);
      note.date = d.toISOString();
    });
  }
  Store.save();
}
