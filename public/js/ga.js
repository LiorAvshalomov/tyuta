(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  var id = document.head.querySelector('meta[name="ga-id"]');
  if (id && id.content) {
    gtag('config', id.content, { page_path: window.location.pathname });
  }
})();
