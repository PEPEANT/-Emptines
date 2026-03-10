function option(id, label, nextNodeId = "", overrides = {}) {
  return {
    id,
    label,
    nextNodeId,
    ...overrides
  };
}

function node(id, title, prompt, replies, sources, optionsList, overrides = {}) {
  return {
    id,
    topicId: overrides.topicId ?? id,
    title,
    prompt,
    replies,
    sources,
    options: optionsList,
    ...overrides
  };
}

function rootReturnOptions(rootNodeId) {
  return [
    option("root_return", "처음 질문으로 돌아가기", rootNodeId),
    option("close_dialogue", "대화 닫기", "", { action: "close_dialogue" })
  ];
}

export function createBridgeGatekeeperDialogue() {
  const rootNodeId = "bridge_root";
  return {
    rootNodeId,
    nodes: [
      node(
        rootNodeId,
        "시작 관문",
        "무엇부터 확인할지 골라봐. 여기서는 방향을 잡고, 시티 안으로 들어갈 준비를 하면 된다.",
        [
          "처음 들어왔다면 급하게 뛰어들 필요 없다. 여기는 공의 입구이고, 질문을 정리하고 방향을 고르는 자리다.",
          "좋아. 여기서는 선택을 서두르지 않아도 된다. 공은 로비가 아니라 시작 관문이다."
        ],
        ["WORLD_LORE", "WHITEPAPER"],
        [
          option("nickname_gate", "임시 닉네임 정하기", "", { action: "open_nickname_gate", primary: true }),
          option("what_city", "시뮬라크 시티가 뭐야", "what_city"),
          option("gong_vs_city", "공이랑 시티는 뭐가 달라", "gong_vs_city"),
          option("portal_meaning", "포탈은 어떤 장치야", "portal_meaning"),
          option("first_steps", "처음 들어오면 뭘 보면 돼", "first_steps"),
          option("deep_bridge", "조금 더 깊게 설명해줘", "deep_bridge")
        ],
        { playGreetingVideo: true }
      ),
      node(
        "what_city",
        "시뮬라크 시티",
        "시뮬라크 시티는 단일 미니게임이 아니라, 창작과 전시와 이동이 이어지는 본체 세계다.",
        [
          "시뮬라크 시티는 3D UGC를 만들고 놓고 보고 이동시키는 루프가 모이는 본체 세계다.",
          "여긴 이벤트 홀 하나가 아니다. 사용자의 선택과 흔적이 쌓이고, 다시 이어지는 메인 공간이다."
        ],
        ["WHITEPAPER", "WORLD_LORE", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "gong_vs_city",
        "공과 시티의 차이",
        "공은 시작 관문이고, 시티는 오래 머물며 창작과 전시를 이어가는 본체 공간이다.",
        [
          "공은 방향을 고르는 관문이다. 시티는 그 다음에 실제로 머물고 만들고 배치하는 생활권이다.",
          "공이 로비처럼 보일 수는 있지만 정의는 다르다. 공은 시작 장치이고, 시티가 본체 세계다."
        ],
        ["WORLD_LORE"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "portal_meaning",
        "포탈의 의미",
        "포탈은 세계 자체가 아니라, 다른 모듈과 흐름을 연결하는 교체 가능한 장치다.",
        [
          "포탈은 본체 세계를 대체하지 않는다. 외부 모듈이나 다른 흐름을 연결하는 인터페이스에 가깝다.",
          "포탈이 바뀌어도 세계의 정체성은 유지된다. 포탈은 연결 장치이고, 세계는 그보다 오래 남는다."
        ],
        ["WORLD_LORE", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "first_steps",
        "처음 들어오면",
        "처음에는 도시를 한 바퀴 읽고, 포탈과 공연장과 전시 동선을 먼저 보는 쪽이 좋다.",
        [
          "처음에는 빠르게 소비하기보다 동선을 읽는 편이 낫다. 어디가 포탈이고 어디가 전시 축인지 먼저 보면 세계가 풀린다.",
          "가장 좋은 첫 행동은 둘러보기다. 포탈 위치, 공연장 톤, NPC 역할, 오브젝트 설치 가능 영역을 먼저 읽어라."
        ],
        ["WORLD_LORE", "WHITEPAPER"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "deep_bridge",
        "심화 안내",
        "조금 더 구조적으로 보자. 아래 주제 중 하나를 고르면 된다.",
        [
          "좋다. 여기서부터는 시티의 구조와 운영 기준을 더 깊게 본다.",
          "좋아. 심화 설명으로 들어간다. 필요한 층위만 골라서 열면 된다."
        ],
        ["WHITEPAPER", "WORLD_LORE", "UGC rules"],
        [
          option("ugc_meaning", "UGC는 여기서 뭘 의미해", "ugc_meaning"),
          option("world_tiers", "작업실, 실험 월드, 메인 월드는 뭐야", "world_tiers"),
          option("object_entity_ai", "오브젝트, 엔티티, AI 모듈 차이는 뭐야", "object_entity_ai"),
          option("continuity", "왜 닉네임과 흔적이 이어져야 해", "continuity"),
          option("close_dialogue", "대화 닫기", "", { action: "close_dialogue" })
        ]
      ),
      node(
        "ugc_meaning",
        "UGC의 의미",
        "UGC는 단순 배치 기능이 아니라, 세계 안에 남고 이어지는 창작 구조 전체를 뜻한다.",
        [
          "여기서 UGC는 브러시 하나를 뜻하지 않는다. 소유, 수정, 전시, 복구까지 포함한 creation 구조를 뜻한다.",
          "배치만으로는 부족하다. 남고 이어지고 다시 읽히는 구조까지 있어야 UGC가 된다."
        ],
        ["UGC AGENTS", "UGC rules", "WHITEPAPER"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "world_tiers",
        "월드 계층",
        "작업실에서 만들고, 실험 월드에서 검증하고, 메인 월드에서 오래 전시하는 흐름이 기준이다.",
        [
          "작업실은 제작, 실험 월드는 검증, 메인 월드는 장기 노출과 축적의 층위다.",
          "중요한 건 층위 분리다. 바로 메인 월드로 던지는 게 아니라, 만들고 검증하고 남기는 단계가 나뉜다."
        ],
        ["WORLD_LORE", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "object_entity_ai",
        "오브젝트, 엔티티, AI",
        "오브젝트는 재료와 흔적이고, 엔티티는 행동하는 존재이며, AI 모듈은 그 엔티티에 붙는 지능 레이어다.",
        [
          "오브젝트는 놓이는 재료다. 엔티티는 상태와 행동을 가진 존재고, AI 모듈은 그 존재가 말하고 반응하는 레이어다.",
          "이 구분이 무너지면 시스템이 섞여버린다. 재료와 존재와 지능은 따로 다뤄야 커질 수 있다."
        ],
        ["IMPLEMENTATION_CONTRACT", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "continuity",
        "연속성",
        "닉네임과 선택, 흔적과 창작 기록은 임시 UX가 아니라 장기적으로 이어져야 하는 자산이다.",
        [
          "포탈 이동이 재시작이 아니라 상태 전환으로 보이려면, 닉네임과 흔적과 선택 기록이 이어져야 한다.",
          "세계가 세계처럼 보이려면 예전 선택이 사라지지 않아야 한다. 연속성은 장식이 아니라 기반이다."
        ],
        ["CONTINUITY_CONTRACT", "WORLD_LORE"],
        rootReturnOptions(rootNodeId)
      )
    ]
  };
}

export function createCityArchivistDialogue() {
  const rootNodeId = "archivist_root";
  return {
    rootNodeId,
    nodes: [
      node(
        rootNodeId,
        "기록 안내",
        "시티의 구조와 기록 방식 중 무엇이 궁금한지 골라봐.",
        [
          "나는 아카이비스트 윤이다. 여기서는 세계가 어떻게 남는지, 어떤 단위로 관리되는지 설명한다.",
          "좋다. 시티는 보이는 장면보다 기록 구조가 더 중요하다. 필요한 항목을 골라라."
        ],
        ["UGC rules", "CONTINUITY_CONTRACT"],
        [
          option("creation_unit", "creation 단위가 뭐야", "creation_unit", { primary: true }),
          option("trace_policy", "왜 흔적이 자산이야", "trace_policy"),
          option("world_tiers_archivist", "작업실과 실험 월드는 왜 나뉘어", "world_tiers_archivist"),
          option("exhibit_meaning", "전시는 왜 중요한가", "exhibit_meaning"),
          option("close_dialogue", "대화 닫기", "", { action: "close_dialogue" })
        ]
      ),
      node(
        "creation_unit",
        "creation 단위",
        "여기서 기본 단위는 개별 블록보다 creation에 가깝다. owner, version, status, objects가 함께 관리된다.",
        [
          "기본 단위는 흩어진 오브젝트 묶음보다 creation에 가깝다. 누가 만들었고 어떤 상태인지 같이 따라다닌다.",
          "개별 조각만 저장하면 복구와 전시가 약해진다. creation 단위로 봐야 버전과 상태가 같이 유지된다."
        ],
        ["UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "trace_policy",
        "흔적 정책",
        "흔적은 지워지는 메모가 아니라, 관리 가능한 세계 자산으로 남아야 한다.",
        [
          "흔적은 로그 조각이 아니라 복구 가능한 상태와 이력이다. 그래서 임시 파일처럼 다루지 않는다.",
          "세계 안에 놓인 것은 그냥 소비되지 않는다. 수정과 복원과 전시 가능성까지 포함해 자산이 된다."
        ],
        ["UGC rules", "CONTINUITY_CONTRACT"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "world_tiers_archivist",
        "검증 단계",
        "작업실과 실험 월드와 메인 월드를 나누는 이유는 창작 속도와 안정성을 동시에 지키기 위해서다.",
        [
          "실험 월드는 실패해도 되는 층위고, 메인 월드는 오래 남는 층위다. 둘을 섞으면 운영이 무너진다.",
          "단계가 있어야 창작이 빨라지고, 동시에 메인 월드의 안정성도 유지된다."
        ],
        ["WORLD_LORE", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "exhibit_meaning",
        "전시의 의미",
        "전시는 단순 노출이 아니라, 창작물이 세계 안에서 읽히고 다시 선택될 수 있게 만드는 상태다.",
        [
          "전시는 장식이 아니다. 만들어진 것이 다른 플레이어의 동선 안에서 다시 발견되게 만드는 상태다.",
          "배치와 저장만으로 끝나지 않는다. 전시가 붙어야 창작이 세계의 일부가 된다."
        ],
        ["WHITEPAPER", "UGC rules"],
        rootReturnOptions(rootNodeId)
      )
    ]
  };
}

export function createCityCuratorDialogue() {
  const rootNodeId = "curator_root";
  return {
    rootNodeId,
    nodes: [
      node(
        rootNodeId,
        "큐레이터 루프",
        "나는 큐레이터 노바다. 시티를 천천히 순회하면서 창작과 전시의 흐름을 정리한다. 궁금한 주제를 골라라.",
        [
          "나는 큐레이터 노바다. 도시를 돌아다니는 이유는 전시와 동선이 살아 있는지 보기 위해서다.",
          "좋아. 시티는 그냥 예쁜 배경이 아니라 창작물이 읽히는 무대다. 원하는 주제를 열어라."
        ],
        ["WHITEPAPER", "WORLD_LORE", "UGC rules"],
        [
          option("why_place_save_exhibit", "왜 배치하고 저장하고 전시하는 루프가 핵심이야", "why_place_save_exhibit", {
            primary: true
          }),
          option("why_dreamlike_city", "왜 시티가 몽환적이어야 해", "why_dreamlike_city"),
          option("what_to_do_first", "처음 들어온 플레이어는 뭘 하면 돼", "what_to_do_first"),
          option("ai_future_role", "AI NPC는 앞으로 어떻게 커져", "ai_future_role"),
          option("object_vs_entity_curator", "오브젝트랑 엔티티 차이를 다시 설명해줘", "object_vs_entity_curator"),
          option("close_dialogue", "대화 닫기", "", { action: "close_dialogue" })
        ]
      ),
      node(
        "why_place_save_exhibit",
        "배치-저장-전시 루프",
        "이 세계의 초기 정체성은 3D UGC 창작과 전시에 있으니, 배치하고 저장하고 다시 읽히게 만드는 루프가 먼저다.",
        [
          "이 세계는 먼저 만들고, 놓고, 저장하고, 다시 읽히게 만드는 루프를 가져야 한다. 미니게임은 그 위에 붙는다.",
          "코어는 create, place, save, exhibit다. 이 루프가 있어야 나중에 어떤 모듈이 올라와도 세계가 흐트러지지 않는다."
        ],
        ["WHITEPAPER", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "why_dreamlike_city",
        "몽환적인 도시",
        "몽환적이라는 건 판타지 톤을 과하게 밀자는 뜻이 아니라, 현실보다 한 단계 더 기억에 남는 공기와 깊이를 만들자는 뜻이다.",
        [
          "시티가 몽환적으로 보여야 하는 이유는 세계가 기억에 남아야 하기 때문이다. 다만 규칙 없는 환상으로 흐르면 안 된다.",
          "좋은 몽환성은 저채도 공기, 깊이감, 느린 reveal, 선택의 여백에서 나온다. 보라색을 덮는다고 해결되진 않는다."
        ],
        ["WORLD_LORE", "WHITEPAPER"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "what_to_do_first",
        "처음 해야 할 일",
        "처음 온 플레이어는 전부 소비하려 하지 말고, 한 바퀴 둘러보고 자신이 무엇을 만들지부터 고르는 편이 좋다.",
        [
          "좋은 첫 행동은 속도를 늦추는 것이다. 동선과 포탈과 전시 축을 읽은 다음, 내가 무엇을 남길지 정하는 쪽이 맞다.",
          "처음에는 관람자가 되어도 된다. 급하게 설치하기보다 도시가 어떻게 읽히는지부터 보는 것이 더 중요하다."
        ],
        ["WORLD_LORE", "UGC rules"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "ai_future_role",
        "AI NPC의 다음 단계",
        "AI NPC는 단순 안내를 넘어서 창작 보조, 전시 큐레이션, 경제적 흐름 설명, 장기 기억 보조로 커질 수 있다.",
        [
          "지금은 선택지형 안내지만, 앞으로는 창작 보조와 큐레이션, 장기 기억을 연결하는 존재로 커질 수 있다.",
          "중요한 건 자유 생성보다 기준 문서를 지키는 것이다. AI가 커질수록 정본과 가드레일이 더 중요해진다."
        ],
        ["IMPLEMENTATION_CONTRACT", "UGC rules", "WORLD_LORE"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "object_vs_entity_curator",
        "오브젝트와 엔티티",
        "오브젝트는 놓이는 재료이고, 엔티티는 스스로 반응하고 상태를 가지는 존재다. AI는 그 위에 붙는 별도 레이어다.",
        [
          "오브젝트를 많이 만든다고 곧바로 존재가 되지는 않는다. 상태와 반응과 기억이 붙어야 엔티티가 된다.",
          "앞으로 규모가 커질수록 이 구분은 더 중요해진다. 재료와 존재와 지능을 섞으면 유지보수가 무너진다."
        ],
        ["IMPLEMENTATION_CONTRACT", "UGC rules"],
        rootReturnOptions(rootNodeId)
      )
    ]
  };
}
