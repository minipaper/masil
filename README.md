# 마실

네이버 블로그 이웃집을 한 바퀴 도는 데스크톱 앱이에요.

이웃의 새 글을 모아서 보여주고, 글을 앱 안에서 열어 읽게 해 줘요. 댓글은 내 말투를 닮은 초안 세 개를 써서 댓글창에 채워 줍니다. **등록 버튼은 항상 내가 직접 눌러요.**

> 지금은 개발 초기(v0.1.0 준비 중)예요. 진행 상황은 [결정 기록](docs/DECISIONS.md)의 마일스톤을 참고하세요.

## 할 수 있는 일

- **이웃 출석부**: 이웃 블로그 ID를 등록하면 RSS로 새 글을 확인해요. 새 글이 오면 트레이 알림을 띄우고, 읽음·공감·댓글 여부를 출석부처럼 표시해요.
- **앱 안에서 글 읽기**: 네이버 블로그를 앱 안 웹뷰로 열어요. 로그인은 처음 한 번만 웹뷰에서 직접 하면 유지돼요.
- **댓글 초안**: 본문을 읽고 다정한 공감, 짧고 가볍게, 질문으로 잇기 세 가지 톤으로 초안을 써요. 고른 초안을 댓글 입력칸에 채워 줘요.
- **내 말투 학습**: 실제로 등록한 댓글과 초안을 고친 흔적을 모아서 "내 댓글 스타일 가이드"를 다듬어요. 가이드는 직접 고칠 수도 있어요.
- **지난 댓글**: 그 이웃에게 예전에 남긴 댓글을 옆에서 함께 보여줘요.
- **마실 모드**: 새 글을 오래된 순서대로 하나씩 열어 주니까 한 바퀴 돌기만 하면 돼요.

## 약속

- 공감이나 댓글 "등록" 버튼을 앱이 대신 누르지 않아요.
- 네이버 서버에 부담을 주지 않아요. 새 글 확인은 최소 10분 간격이고, 이웃 사이에는 몇 초씩 쉬면서 하나씩 확인해요.
- 네이버 비밀번호를 저장하거나 다루지 않아요. 로그인은 웹뷰에서 직접 해요.
- 내 데이터(이웃, 댓글, 스타일 가이드)는 내 PC의 SQLite 파일에만 저장돼요. 외부로 나가는 요청은 네이버, 내가 설정한 AI 서버, 업데이트 확인용 GitHub뿐이에요.

## 설치 (Windows)

[Releases](https://github.com/minipaper/masil/releases)에서 최신 `마실-Setup-x.y.z.exe`를 받아 실행하세요. 코드 서명을 하지 않은 앱이라 처음 실행할 때 "Windows의 PC 보호" 창이 뜰 수 있어요. 그때는 **추가 정보 → 실행**을 누르면 돼요. 이후 업데이트는 앱이 알아서 받아요.

## AI 설정

설정 화면에 OpenAI 호환 API 정보를 넣으면 돼요.

| 서비스 | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama (로컬) | `http://localhost:11434/v1` |

모델명은 각 서비스에서 쓸 수 있는 이름을 그대로 넣으면 돼요. 한국어를 잘 쓰는 모델일수록 초안이 자연스러워요. API 키는 Windows 자격 증명 보호(DPAPI)로 암호화해서 저장해요.

## 개발

Node.js 22 이상이 필요해요.

```bash
npm install      # 의존성 설치 (better-sqlite3를 Electron용으로 다시 빌드)
npm run dev      # 개발 모드 실행
npm test         # 테스트
npm run typecheck
```

- 기술 스택: Electron, electron-vite, Svelte 5, TypeScript, better-sqlite3
- 디자인 시안: `design/mockups/` (C "출석부 공책" 방향으로 진행)
- 기여하거나 AI 에이전트로 작업할 때는 [CLAUDE.md](CLAUDE.md)의 절대 원칙을 먼저 읽어 주세요.

### 릴리스

```bash
npm version patch          # 버전 올리고 v* 태그 생성
git push --follow-tags     # GitHub Actions가 Windows 설치 파일을 만들어 Releases에 올림
```

## 라이선스

[MIT](LICENSE). 포함된 폰트(함렡, IBM Plex Sans KR, 감자꽃)는 SIL Open Font License 1.1을 따라요.
