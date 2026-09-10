import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const APK_PATH = "/downloads/app-debug.apk";

export default function DownloadPage() {
  const [status, setStatus] = useState<"checking" | "ok" | "missing">("checking");
  const [sizeMb, setSizeMb] = useState<string>("");

  const apkUrl = window.location.origin + APK_PATH;

  useEffect(() => {
    fetch(APK_PATH, { method: "HEAD" })
      .then((r) => {
        if (!r.ok) { setStatus("missing"); return; }
        const len = r.headers.get("content-length");
        if (len) setSizeMb((Number(len) / 1024 / 1024).toFixed(1));
        setStatus("ok");
      })
      .catch(() => setStatus("missing"));
  }, []);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Install the Android app</h2>

      {status === "missing" && (
        <p className="warn">
          ⚠ APK not found at <code>{APK_PATH}</code>. Build it and copy it into the web app:
          run <code>npm run sync-apk</code> in <code>web/</code> (see README).
        </p>
      )}

      <div className="download-wrap">
        <div className="qr-box">
          <QRCodeSVG value={apkUrl} size={180} />
        </div>
        <div>
          <p className="steps">
            <strong>On your Android phone:</strong><br />
            1. Scan the QR code, then <strong>open the link in Chrome</strong>
            (or paste <code>{apkUrl}</code> into Chrome).<br />
            2. Download the APK{sizeMb && ` (${sizeMb} MB)`}.<br />
            3. When prompted, allow <em>“Install unknown apps”</em> for Chrome.<br />
            4. Open the file to install, then launch <strong>GPS Sensor Logger</strong>.<br />
            5. Grant Location + Notification permissions, pick an interval, tap <em>Start</em>.<br />
            6. Tap <em>Stop &amp; save</em>, then <em>Share</em> the <code>.json</code> to your computer.<br />
            7. Back here, open the <strong>Visualize</strong> tab and drop that file in.
          </p>
          <a className="dl-btn" href={APK_PATH} download="GpsSensorLogger.apk">
            ⬇ Download APK
          </a>
          <p className="warn small" style={{ marginTop: 12 }}>
            ⚠ <strong>Don’t use an in-app browser.</strong> If the QR opens inside KakaoTalk,
            Instagram, Naver, etc., the download may be saved as a <code>.zip</code> that can’t be
            installed. Tap the “⋮” menu → <em>Open in Chrome</em> (or a real browser) first.
          </p>
          <p className="muted small" style={{ marginTop: 8 }}>
            An APK is technically a ZIP archive, so a file/zip viewer will show folders like
            <code> res/</code>, <code>lib/</code>, <code>AndroidManifest.xml</code> inside — that’s
            normal, it is <em>not</em> source code. Just install it directly; don’t unzip it.
          </p>
          <p className="muted small" style={{ marginTop: 8 }}>
            This is an unsigned debug build for MVP testing — not a Play Store release.
            The phone must reach this URL, so serve on your LAN
            (<code>npm run dev -- --host</code>) and keep the phone on the same Wi-Fi.
          </p>
        </div>
      </div>
    </div>
  );
}
