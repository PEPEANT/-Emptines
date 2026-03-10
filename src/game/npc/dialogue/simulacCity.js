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
    option("root_return", "처음으로", rootNodeId),
    option("close_dialogue", "닫기", "", { action: "close_dialogue" })
  ];
}

export function createBridgeGatekeeperDialogue() {
  const rootNodeId = "bridge_root";
  return {
    rootNodeId,
    nodes: [
      node(
        rootNodeId,
        "공의 관문",
        "이곳은 공입니다. 탄생의 현상이 시작되는 자리예요. 정면 12시 방향 계단을 오르면 시뮬라크 시티로 들어갑니다.",
        [
          "이곳은 공입니다. 로비가 아니라, 처음 선택이 시작되는 관문이에요. 시뮬라크 시티는 정면 12시 방향 계단 너머에 있습니다.",
          "공은 머무는 대기실이 아니에요. 태어나고, 방향을 정하고, 들어서는 자리예요. 계단을 오르면 선택 이후의 삶이 시작됩니다."
        ],
        ["EM WORLD_LORE", "EM WHITEPAPER"],
        [],
        { playGreetingVideo: true }
      )
    ]
  };
}

export function createCityAiGuideDialogue() {
  const rootNodeId = "city_ai_root";
  return {
    rootNodeId,
    nodes: [
      node(
        rootNodeId,
        "시뮬라크 안내",
        "무엇을 정리해드릴까요.",
        [
          "시뮬라크 시티는 선택 이후의 삶이 이어지는 도시입니다. 필요한 항목을 고르세요.",
          "여기는 시뮬라크 시티입니다. 창작, 저장, 전시, 이동이 이어지는 본체 세계예요."
        ],
        ["EM WORLD_LORE", "EM IMPLEMENTATION_CONTRACT"],
        [
          option("what_simulac", "시뮬라크 시티가 뭔가요", "what_simulac", { primary: true }),
          option("districts", "도시 구역을 알려주세요", "districts"),
          option("portal_meaning", "포탈은 무엇인가요", "portal_meaning"),
          option("world_promotion", "작업실과 실험 월드, 메인 월드는 어떻게 다른가요", "world_promotion"),
          option("creation_trace", "왜 creation과 흔적이 중요한가요", "creation_trace"),
          option("core_loop", "여기서의 코어 루프는 뭔가요", "core_loop"),
          option("ai_future", "AI NPC는 앞으로 어떤 역할을 하나요", "ai_future"),
          option("close_dialogue", "닫기", "", { action: "close_dialogue" })
        ]
      ),
      node(
        "what_simulac",
        "선택 이후의 삶",
        "시뮬라크는 공의 12시 방향 전방에 이어지는 대도시 권역입니다. 공이 탄생의 현상이라면, 시뮬라크는 그 뒤에 계속되는 삶입니다.",
        [
          "공이 태어나는 자리라면, 시뮬라크는 그 다음을 살아가는 도시입니다. 여기서는 선택이 기록으로 남고, 기록이 다시 다음 선택의 환경이 됩니다.",
          "시뮬라크는 단일 미니게임이 아닙니다. 여러 활동이 이어지고 누적되는 본체 세계예요."
        ],
        ["EM WORLD_LORE", "EM WHITEPAPER"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "districts",
        "도시 구역",
        "도시는 하나의 화면이 아니라 여러 성격의 구역으로 구성됩니다. 코어 스트리트, 네온 마켓, 프로토콜 구, 쉐도우 블록이 기본 축입니다.",
        [
          "코어 스트리트는 거래와 길드 모집, 공개 이벤트가 모이는 중심선입니다. 네온 마켓은 스킨과 장비, 외형 교환이 일어나는 상업 구역이에요.",
          "프로토콜 구는 미션과 랭크, 경쟁형 콘텐츠의 축입니다. 쉐도우 블록은 고난도 협동과 위험 보상이 걸린 깊은 구역이에요."
        ],
        ["EM WORLD_LORE"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "portal_meaning",
        "포탈의 의미",
        "포탈은 단순한 장식이 아니라 운영 경계 인터페이스입니다. 본체 세계를 지우는 장치가 아니라, 다른 모듈과 흐름을 연결하는 접점입니다.",
        [
          "포탈은 이동 버튼처럼 보일 수 있지만, 실제로는 세계 간 경계를 관리하는 인터페이스에 가깝습니다.",
          "중요한 건 포탈이 세계를 대체하지 않는다는 점입니다. 시뮬라크는 남아 있고, 포탈은 그 위에 연결을 더합니다."
        ],
        ["EM WORLD_LORE", "EM UGC RULES"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "world_promotion",
        "작업실에서 메인 월드까지",
        "정본 기준으로 창작은 작업실에서 시작하고, 실험 월드에서 검증한 뒤, 메인 월드로 승격됩니다. 바로 메인에 고정하는 구조가 아닙니다.",
        [
          "작업실은 만드는 층위, 실험 월드는 검증하는 층위, 메인 월드는 오래 남기고 전시하는 층위입니다.",
          "이 계층이 있어야 창작의 속도와 운영의 안정성을 같이 지킬 수 있습니다."
        ],
        ["EM WORLD_LORE", "EM IMPLEMENTATION_CONTRACT"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "creation_trace",
        "creation과 흔적",
        "여기서 저장의 기본 단위는 오브젝트 한 조각이 아니라 creation 또는 work입니다. 누가 만들었는지, 어떤 버전인지, 어떤 상태인지가 같이 남아야 합니다.",
        [
          "흔적은 로그 조각이 아니라 연속성 자산입니다. 닉네임, 선택, 창작 기록이 이어져야 세계가 이어진 것으로 보입니다.",
          "creation 단위로 저장해야 버전과 전시, 승격 이력까지 추적할 수 있습니다. 그래야 세계가 임시 화면이 아니라 삶의 축적으로 보입니다."
        ],
        ["EM IMPLEMENTATION_CONTRACT", "EM CONTINUITY_CONTRACT"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "core_loop",
        "배치, 저장, 전시",
        "여기서의 코어 루프는 배치하고, 저장하고, 전시하는 것입니다. 창작이 세계에 놓이고, 다시 발견되고, 다시 선택되도록 만드는 흐름이 핵심입니다.",
        [
          "만드는 것으로 끝나지 않습니다. 배치와 저장, 전시가 이어져야 창작물이 세계 안에서 실제로 살아남습니다.",
          "시뮬라크의 생활성은 이 루프에서 나옵니다. 오브젝트를 두고 끝나는 게 아니라, 세계 안에 남겨두는 것이 중요합니다."
        ],
        ["EM WHITEPAPER", "EM WORLD_LORE", "EM UGC RULES"],
        rootReturnOptions(rootNodeId)
      ),
      node(
        "ai_future",
        "AI NPC의 다음 역할",
        "AI NPC는 단순 안내문을 읽는 존재로 끝나지 않습니다. 장기적으로는 창작 코파일럿, 전시 큐레이터, 경제 액터, 기억 보조자로 확장됩니다.",
        [
          "앞으로의 AI NPC는 길만 알려주는 존재가 아닙니다. 창작을 돕고, 전시를 설명하고, 플레이어의 맥락을 이어주는 존재가 됩니다.",
          "중요한 건 자유 생성보다 정본과 연속성을 지키는 일입니다. AI가 많아져도 세계의 문법은 흔들리지 않아야 합니다."
        ],
        ["EM WHITEPAPER", "EM WORLD_LORE", "EM IMPLEMENTATION_CONTRACT"],
        rootReturnOptions(rootNodeId)
      )
    ]
  };
}
