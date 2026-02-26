# RECLAIM FPS

Three.js 기반의 웹 3D FPS 미니게임입니다.
그래픽 에셋은 빌드 안전성을 위해 `public/assets/graphics`로 분리되어 있습니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 화면 클릭으로 시작합니다.

## 조작

- `WASD`: 이동
- `Shift`: 달리기
- `Space`: 점프
- `Mouse`: 시점 조작
- `Click`: 발사
- `R`: 재장전

## 폴더 구조

```text
.
├─ index.html
├─ netlify.toml
├─ public
│  └─ assets
│     └─ graphics
│        ├─ ui
│        │  ├─ logo.svg
│        │  ├─ menu-bg.svg
│        │  ├─ panel.svg
│        │  ├─ crosshair.svg
│        │  ├─ hitmarker.svg
│        │  └─ icons
│        │     ├─ play.svg
│        │     ├─ pause.svg
│        │     └─ reload.svg
│        └─ world
│           ├─ textures
│           │  ├─ ground.svg
│           │  ├─ concrete.svg
│           │  └─ metal.svg
│           ├─ sprites
│           │  ├─ muzzleflash.svg
│           │  └─ spark.svg
│           └─ sky
│              └─ sky.svg
├─ vercel.json
├─ vite.config.js
└─ src
   ├─ main.js
   ├─ game
   │  ├─ EnemyManager.js
   │  ├─ Game.js
   │  ├─ HUD.js
   │  └─ WeaponSystem.js
   └─ styles
      └─ main.css
```

## 그래픽 반영 내용

- 시작 화면: `menu-bg/logo/panel` 적용 + 프리로드
- HUD: `crosshair/hitmarker` 적용
- 월드: `ground/concrete/metal` 텍스처 + sky + fog + 조명 프리셋
- 전투 피드백: muzzle flash, hit spark, hitmarker 적용

## 온라인 호스팅

### Vercel
1. 저장소를 Vercel에 연결
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. `vercel.json`에 SPA rewrite 포함되어 바로 동작

### Netlify
1. 저장소를 Netlify에 연결
2. Build command: `npm run build`
3. Publish directory: `dist`
4. `netlify.toml`에 SPA redirect 포함되어 바로 동작
