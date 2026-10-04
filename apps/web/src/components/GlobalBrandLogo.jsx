import { useEffect, useState } from "react";

const hostOrigin =
  import.meta.env.VITE_AGRINEXUS_SESSION === "true"
    ? location.origin
    : "https://agrinexus.digitalpalm.ai";
const brandingUrl = hostOrigin + "/api/public/settings/global-branding";
const cacheKey = "estate-atlas-minor-logo:" + hostOrigin;

// AgriNexus Global Branding stores uploads as FilePath/BaseUrl objects.
function minorLogoUrl(payload) {
  const value = payload?.data?.Value || payload?.Value || payload || {};
  let file = value.minorLogo || value.MinorLogo || value.minorLogoFile;
  if (Array.isArray(file)) file = file[0];
  const path =
    typeof file === "string" ? file : file?.Url || file?.url || file?.FilePath;
  if (!path) return "";
  try {
    const base = new URL(
      file?.BaseUrl || value.baseUrl || "/media/",
      hostOrigin
    );
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const url = new URL(path, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export default function GlobalBrandLogo() {
  const [url, setUrl] = useState(() => {
    try {
      return minorLogoUrl({ minorLogo: localStorage.getItem(cacheKey) });
    } catch {
      return "";
    }
  });
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => {
    let controller;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 10000);
      try {
        // Public branding needs no estate session token or credentials.
        const response = await fetch(brandingUrl, {
          credentials: "omit",
          signal: request.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const next = minorLogoUrl(await response.json());
        if (request.signal.aborted) return;
        setUrl(next);
        setFailedUrl("");
        try {
          localStorage.setItem(cacheKey, next);
        } catch {
          /* Storage may be disabled. */
        }
      } catch {
        /* Keep the last configured logo when offline. */
      } finally {
        clearTimeout(timeout);
      }
    };
    const onStorage = (event) => {
      if (event.key === "digitalPalmGlobalBranding") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("digitalPalmGlobalBrandingChanged", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("digitalPalmGlobalBrandingChanged", refresh);
    };
  }, []);
  if (!url || failedUrl === url) return null;
  return (
    <a
      className="global-brand"
      href={hostOrigin + "/"}
      aria-label="AgriNexus home"
    >
      <img src={url} alt="AgriNexus logo" onError={() => setFailedUrl(url)} />
    </a>
  );
}
