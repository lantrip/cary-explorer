// Privacy text for the Credits & privacy dialog. Hand-written on purpose: it must match what the app actually does.
// Facts were checked by searching src/ for geolocation, localStorage, sessionStorage, cookie, analytics, sendBeacon, XMLHttpRequest, WebSocket, fetch( and navigator.
// localStorage is used only by src/features/favorites/favoritesStore.ts (saved place ids).
// If any of these change (analytics, saved settings, a new third-party request), update this text.
export function PrivacyNotice({ headingId }: { headingId: string }) {
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="font-display text-lg font-semibold text-ink">
        Privacy
      </h3>
      <ul className="list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-ink-soft">
        <li>There are no accounts, no cookies and no analytics or advertising trackers.</li>
        <li>
          If you save places, their IDs are stored in this browser only (local storage). They are never sent anywhere.
          Clear them by unsaving or clearing site data. The app saves nothing else in your browser.
        </li>
        <li>
          Location is optional and only requested when you press &quot;Near me&quot;. It is used in your browser to sort
          places, measure straight-line distances and show a &quot;you are here&quot; marker on the map. It is never sent to this site or anyone else, never stored, and never
          put in the link. Turning &quot;Near me&quot; off forgets it.
        </li>
        <li>
          Your browser loads this site&apos;s own data files (places, map layers and these credits) and map tiles from
          OpenStreetMap&apos;s tile servers. The tile servers can see your IP address and which map tiles you view, like any
          web request. Fonts are served from this site.
        </li>
        <li>
          The address in your browser holds the place you have selected, your filters, any search text, the town, an open collection, the map
          position and zoom, and whether this dialog is open. If you share or bookmark that link, it includes those details,
          and opening it sends them to this site&apos;s host like any page address. Avoid typing private information into search.
        </li>
        <li>The host of this site may keep routine server logs, as web servers usually do. This app adds nothing to them.</li>
        <li>
          &quot;Copy link&quot; writes the current address to your clipboard only when you press it. Links to other sites
          (such as source pages) leave this app, and those sites have their own policies.
        </li>
      </ul>
    </section>
  )
}
