/** preload가 window.masil 로 노출하는 API 타입 (renderer와 공유) */
export interface MasilApi {
  platform: string
}

declare global {
  interface Window {
    masil: MasilApi
  }
}
