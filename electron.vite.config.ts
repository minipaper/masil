import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // 두 preload 모두 sandbox에서 돌기 때문에 각자 단일 CJS 파일이어야 한다.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          // 앱 화면(Svelte)용 브리지
          index: resolve('src/preload/index.ts'),
          // 네이버 블로그 WebContentsView용 (mainFrame iframe 포함 모든 프레임에 주입)
          naver: resolve('src/preload/naver.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [svelte()]
  }
})
