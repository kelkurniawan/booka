import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// Versi bawaan shadcn menyetel state langsung di dalam useEffect, yang memicu
// render berantai dan ditolak aturan react-hooks/set-state-in-effect.
// useSyncExternalStore membaca matchMedia sebagai sumber eksternal, jadi nilai
// pertama sudah benar tanpa render tambahan.
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// Saat server render, lebar layar belum diketahui; anggap desktop supaya markup
// awal cocok dengan default sidebar.
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
