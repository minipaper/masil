import { mount } from 'svelte'
import '@fontsource-variable/hahmlet'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import '@fontsource/gamja-flower'
import './styles/tokens.css'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app 요소가 없습니다')

export default mount(App, { target })
