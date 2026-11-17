/**
 * 네이버 블로그 WebContentsView에 주입하는 preload (M2에서 구현).
 * nodeIntegrationInSubFrames로 mainFrame iframe 안에서도 실행된다.
 *
 * 절대 원칙:
 *  - 공감/댓글 "등록" 버튼을 프로그램이 클릭하지 않는다. (click(), dispatchEvent 등 금지)
 *  - 입력칸 채우기까지만 한다.
 *  - 등록 클릭은 capture 리스너로 "감지"만 하고, 기본 동작을 막지 않는다.
 */
export {}
