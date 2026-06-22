import Script from "next/script";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function AnalyticsScripts() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <Script id="skilly-ga4" strategy="afterInteractive">
      {`
        (function () {
          var h = location.hostname;
          var isSuppressedHost = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.netlify.app') || h.endsWith('.netlify.live') || h.endsWith('.vercel.app');
          window.dataLayer = window.dataLayer || [];
          if (isSuppressedHost || window.__SKILLY_ANALYTICS_SUPPRESSED__ === true) {
            window.gtag = function () {};
            return;
          }
          var script = document.createElement('script');
          script.async = true;
          script.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
          document.head.appendChild(script);
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'granted'
          });
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            send_page_view: false,
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });
        })();
      `}
    </Script>
  );
}
