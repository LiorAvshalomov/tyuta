/* Tyuta theme init — runs synchronously before first paint to prevent flash of wrong theme.
   Reads 'tyuta:theme' from localStorage ('light'|'dark'|'system').
   Falls back to prefers-color-scheme, then light. No external deps. */
(function () {
  try {
    var s = localStorage.getItem('tyuta:theme')
    var d =
      s === 'dark' ||
      (s !== 'light' && window.matchMedia('(prefers-color-scheme:dark)').matches)
    document.documentElement.classList.toggle('dark', d)
    document.documentElement.style.colorScheme = d ? 'dark' : 'light'
  } catch (e) {}
})()
