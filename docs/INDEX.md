# Docs Index

이 문서는 `Emptines` 저장소에서 사람이든 AI든 가장 먼저 보는 문서다.
목적은 문서 역할과 우선순위를 고정해서, 같은 개념을 문서마다 다르게 해석하지 않게 만드는 것이다.

## 먼저 읽는 순서

1. `docs/INDEX.md`
2. `CANONICAL_DOCS.md`
3. `WHITEPAPER.md`
4. `WORLD_LORE.md`
5. `C:\Users\rneet\OneDrive\Desktop\DIS\EM\CONTINUITY_CONTRACT.md`
6. `C:\Users\rneet\OneDrive\Desktop\DIS\EM\IMPLEMENTATION_CONTRACT.md`
7. `C:\Users\rneet\OneDrive\Desktop\UGC\AGENTS.md`
8. `C:\Users\rneet\OneDrive\Desktop\UGC\ugc-rules.yaml`
9. `README.md`

주의:
- `docs/ugc`만 단독으로 읽고 판단하지 않는다.
- `README.md`만 보고 세계관이나 운영 철학을 결정하지 않는다.
- 이 저장소는 런타임 구현 저장소이므로, 상위 철학을 새로 정의하지 않는다.

## 문서 역할

- `AGENTS.md`
  - 이 저장소에서 작업할 때의 해석 순서와 판단 기준을 고정한다.
- `CANONICAL_DOCS.md`
  - 어떤 문서가 어디의 정본인지, 소유권과 우선순위가 어디에 있는지 고정한다.
- `WHITEPAPER.md`
  - 장기 비전, 핵심 정의, 철학, 설계 원칙을 담는다.
- `WORLD_LORE.md`
  - 공간 의미, 구역 역할, 포탈 의미, 운영 세계관을 담는다.
- `C:\Users\rneet\OneDrive\Desktop\DIS\EM\CONTINUITY_CONTRACT.md`
  - 포털, 닉네임, 작품, 세션의 연속성 목표를 담는다.
- `C:\Users\rneet\OneDrive\Desktop\DIS\EM\IMPLEMENTATION_CONTRACT.md`
  - 목표 시스템과 현재 구현 상태를 구분하는 규칙을 담는다.
- `C:\Users\rneet\OneDrive\Desktop\UGC\AGENTS.md`
  - UGC 제작과 운영 판단 기준을 담는다.
- `C:\Users\rneet\OneDrive\Desktop\UGC\ugc-rules.yaml`
  - UGC 세부 규칙과 제한을 담는다.
- `README.md`
  - 런타임 실행, 배포, 검증, 개발 흐름을 설명한다.
- `docs/CORE_MEMORY_STATUS.md`
  - 공개 `main` 기준의 코어 메모리 현재 구현과 목표 모델을 고정한다.

## 해석 우선순위

문서가 충돌하면 아래 순서를 따른다.

1. `EM` 정본 철학과 정의
2. `EM` 정본 미러인 `WHITEPAPER.md`, `WORLD_LORE.md`
3. `UGC` 정본 규칙
4. 이 저장소의 구현 문서

즉:
- 백서/세계관 정의가 구현 편의보다 우선이다.
- UGC 규칙은 백서와 세계관 위에서 동작하는 운영 규칙이다.
- 구현 문서가 상위 정의와 충돌하면 구현 문서를 맞춘다.

## 절대 흔들리면 안 되는 핵심 문장

- `공`은 로비가 아니라 시작 관문이다.
- `시뮬라크`는 단일 미니게임이 아니라 본체 세계다.
- 포탈은 교체 가능한 모듈 연결 장치다.
- 닉네임, 흔적, 선택 경험은 장기적으로 이어져야 할 자산이다.

## AI 작업 원칙

- 같은 뜻의 반복은 줄여도 된다.
- 핵심 정의 문장은 함부로 바꾸지 않는다.
- 문서 역할이 겹치면 삭제보다 역할 분리를 먼저 한다.
- 애매하면 런타임 해석을 만들지 말고, 상위 정본 쪽 표현에 맞춘다.

## 추천 정리 방식

문서 정리를 요청할 때는 아래 기준으로 처리한다.

- `충돌 제거`
- `같은 뜻 반복 축소`
- `문서 역할 분리`
- `우선순위 명시`

권장 요청 문구:

```md
EM 정본 기준으로 문서 중복/충돌 정리해줘.
핵심 정의 문장은 유지하고, 같은 뜻의 반복은 줄이고,
WHITEPAPER / WORLD_LORE / UGC / 구현 문서의 역할 경계를 명확히 나눠줘.
```

## 현재 구현 상태 메모

- `docs/CORE_MEMORY_STATUS.md`
  - `gray_block` 코어 승격의 현재 공개 구현과 목표 모델을 운영/AI 관점에서 짧게 고정한다.
