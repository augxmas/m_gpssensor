# GPS Sensor Logger (MVP)

An Android app that logs **GPS location + accelerometer + gyroscope + magnetometer**
at a fixed time interval, plus a **TypeScript web app** that visualizes the logs
(map track linked to time-series charts) and lets you **download the Android app**.

```
m_gpssensor/
├── android/   # Native Kotlin app (Jetpack Compose) — records sensors, exports JSON/CSV
└── web/       # Vite + React + TypeScript — visualize logs + serve the APK for download
```

No backend. The phone records a log, you **Share** the `.json` file to your computer,
and drop it into the web app.

---

## 1. Android app (`android/`)

Native Kotlin, `minSdk 26` / `targetSdk 35`. A foreground service samples the latest
sensor + location values every *N* ms onto one time-aligned row, so every sample has
the same timestamp axis.

### Build the APK

The repo is pre-configured for this machine (Gradle 8.13, JDK 21 from Android Studio's
JBR — see `android/gradle.properties` if your paths differ).

```bash
cd android
./gradlew assembleDebug        # Windows: .\gradlew.bat assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

It's an **unsigned debug build** — fine for MVP sideloading, not a Play Store release.

### Use it

1. Install the APK on a phone (see the web app's *Get the app* tab for the QR flow).
2. Grant **Location** + **Notifications**, pick a sampling interval (50 ms – 1 s), tap **Start**.
3. Walk around. Tap **Stop & save**.
4. Tap **Share** on the saved log and send the `.json` (and `.csv`) to your computer.

Logs are saved to the app's external files dir: `Android/data/com.example.gpssensor/files/sessions/`.

---

## 2. Web app (`web/`)

```bash
cd web
npm install
npm run sync-apk     # copies the built APK into public/downloads/ (build the APK first)
npm run make-sample  # optional: writes public/sample-log.json to try without a phone
npm run dev -- --host   # serve on your LAN so a phone can reach it
```

Open the printed URL.

- **Visualize** tab — drop a `.json` (or `.csv`) log. You get:
  - a **map** with the GPS track (start = green, end = red),
  - **three time-series charts** (accel / gyro / magneto), x-axis = time.
  - **Linked cursor**: hover a chart to move a marker along the map track; hover the
    map track to drop a reference line on all three charts.
- **Get the app** tab — a QR code + download button for `app-debug.apk`. Scan it from a
  phone on the same network to sideload.

> The QR points at this machine's URL, so run `npm run dev -- --host` (or `npm run build`
> then `npm run preview -- --host`) and make sure the phone is on the same Wi-Fi.

### Download troubleshooting

- **It downloads as a `.zip` / won't install:** the dev server now serves `.apk` with the
  correct `application/vnd.android.package-archive` MIME type (see the `apkMime` plugin in
  `vite.config.ts`), so Android treats it as an installable app. If you serve the APK from
  some other static server, set that MIME type there too.
- **Opened inside an in-app browser (KakaoTalk / Instagram / Naver):** those can save the
  file as a non-installable `.zip`. Open the link in **Chrome** (⋮ → *Open in Chrome*).
- **"This zip contains source code":** it doesn't — an APK *is* a ZIP archive. A zip viewer
  shows `res/`, `lib/`, `classes.dex`, `AndroidManifest.xml`; that's the compiled app, not
  source. Install it directly, don't unzip.
- After re-running `npm run sync-apk`, a `vite preview` needs `npm run build` again to pick
  up the new APK (`preview` serves `dist/`); `npm run dev` serves `public/` live.

### Add the `make-sample` script (optional convenience)

`npm run make-sample` is wired via `node scripts/make-sample.mjs`. If it's missing from
`package.json` scripts, run the file directly: `node scripts/make-sample.mjs`.

---

## Log format (`gpssensor-log` v1)

```jsonc
{
  "format": "gpssensor-log",
  "version": 1,
  "session": { "id", "startedAt", "intervalMs", "device", "sampleCount", "durationMs" },
  "samples": [
    { "t": 0,            // ms since session start
      "lat": 37.5, "lon": 127.0, "alt": 40.0, "acc": 5.0,   // null until first GPS fix
      "ax": 0.0, "ay": 0.0, "az": 9.81,   // accelerometer m/s²
      "gx": 0.0, "gy": 0.0, "gz": 0.0,   // gyroscope rad/s
      "mx": 25.0, "my": -8.0, "mz": -42.0 // magnetometer µT
    }
  ]
}
```

The CSV export has the same columns: `t_ms,lat,lon,alt,acc,ax,ay,az,gx,gy,gz,mx,my,mz`.

---

## End-to-end flow

```
[Phone app] record → Share .json
        │
        ▼
[Your computer] web app → Visualize tab → drop .json → map + linked charts
        ▲
        │  (first time) Get the app tab → scan QR → install APK
```
