# Core Memory Status

이 문서는 공개 `main` 기준의 코어 메모리 구현 상태와 목표 모델을 짧게 고정한다.
목적은 운영자와 AI가 현재 구현과 목표 구조를 혼동하지 않게 만드는 것이다.

## Current Implementation

- `coreMemorySchemaVersion=1`은 기능 버전이 아니라 운영자용 저장 계약 버전이다.
- `gray_block@v1, tier=core`는 공개 구현으로 설명 가능하다.
- `surface_paint@v1, tier=core`도 공개 구현으로 설명 가능하다.
- `hostCustomBlocks`가 `gray_block` 코어 저장 필드다.
- `surfacePaintCore`가 `surface_paint` 코어 저장 필드다.
- 레거시 `objectPositions`에서는 `host_custom_block_*` subset만 마이그레이션한다.
- 레거시 `surfaces`는 `surfacePaintCore`로 마이그레이션한다.
- `/health`, `/status`, 서버 시작 로그, 클라이언트 runtime policy가 `gray_block`와 `surface_paint` 코어 영속성 상태를 노출한다.

## Target Model

- 완전한 코어 메모리 스키마는 `authored type`과 `schema version`을 분리해서 설명한다.
- 목표 모델의 초기 형태는 아래와 같다.
  - `gray_block@v1, tier=core`
  - `surface_paint@v1, tier=core`
- 이후 `mesh_ugc` 같은 새로운 authored type은 필요할 때 추가하되, UI 기능 버전과 저장 계약 버전을 섞지 않는다.

## State Note

- 현재 공개 구현은 `gray_block`와 `surface_paint`를 코어 메모리로 다루는 단계까지 올라왔다.
- 다만 이후 authored type 확장은 같은 파일에 얹지 말고, 타입별 계약과 마이그레이션을 따로 유지해야 한다.
- 현재 가장 중요한 검증 대상은 `surface_paint` 코어가 실제 운영 배포와 재시작을 지나도 유지되는지 여부다.
