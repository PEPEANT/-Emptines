# Asset Drop Guide

아래 경로/파일명으로 에셋을 넣고, `asset-manifest.json`의 각 `source` 값을 채우면 `app.js`가 자동 로드합니다.

## 1) 텍스처

- `assets/textures/stage/stage_color.jpg`
- `assets/textures/stage/stage_normal.jpg`
- `assets/textures/stage/stage_roughness.jpg`
- `assets/textures/stage/speaker_grille.jpg`
- `assets/textures/hall/floor_color.jpg`
- `assets/textures/hall/floor_normal.jpg`
- `assets/textures/hall/floor_roughness.jpg`
- `assets/textures/seat/fabric_color.jpg`

## 2) 비디오

- `assets/video/stage-loop.mp4`

## 3) 오디오

- `assets/audio/ambient-loop.mp3`

## Notes

- 기본 상태(`source: null`)에서는 에셋 요청을 하지 않습니다.
- `source` 입력 예시:
  - `screen_video_loop.source = "./assets/video/stage-loop.mp4"`
  - `stage_floor_texture_set.source = { "baseColor": "...", "normal": "...", "roughness": "..." }`
- 현재 리포지토리 기준으로는 OX 폴더의 샘플 텍스처/영상을 복사해 둔 상태입니다.
- 비디오가 없으면 기본 emissive 스크린 컬러 애니메이션으로 동작합니다.
- 오디오는 첫 사용자 클릭 이후 재생 시도됩니다.
