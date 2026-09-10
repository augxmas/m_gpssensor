package com.example.gpssensor

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** One time-aligned measurement row. */
data class Sample(
    val t: Long,            // ms since session start
    val lat: Double?,       // null until first GPS fix
    val lon: Double?,
    val alt: Double?,
    val acc: Float?,        // horizontal accuracy (m)
    val ax: Float, val ay: Float, val az: Float,   // accelerometer m/s^2
    val gx: Float, val gy: Float, val gz: Float,   // gyroscope rad/s
    val mx: Float, val my: Float, val mz: Float     // magnetic field uT
)

/** Snapshot exposed to the UI. */
data class RecorderState(
    val recording: Boolean = false,
    val intervalMs: Long = 200,
    val sampleCount: Int = 0,
    val elapsedMs: Long = 0,
    val lat: Double? = null,
    val lon: Double? = null,
    val accuracy: Float? = null,
    val ax: Float = 0f, val ay: Float = 0f, val az: Float = 0f,
    val gx: Float = 0f, val gy: Float = 0f, val gz: Float = 0f,
    val mx: Float = 0f, val my: Float = 0f, val mz: Float = 0f,
    val hasAccel: Boolean = false,
    val hasGyro: Boolean = false,
    val hasMag: Boolean = false,
    val hasFix: Boolean = false,
    /** Most recent samples (sliding window) for live charts. */
    val recent: List<Sample> = emptyList(),
    // real-time streaming to ELK
    val streaming: Boolean = false,
    val uploaded: Int = 0,
    val uploadFailed: Int = 0,
    val uploadError: String? = null,
)

/**
 * Singleton recording engine. The foreground [LoggingService] drives start/stop;
 * the UI observes [state]. Sensor callbacks and the sampling tick run on a
 * dedicated background thread so the UI thread is never blocked.
 */
object Recorder {

    /** Sliding-window size (number of samples) kept for the live charts. */
    private const val WINDOW = 200

    /** Live-upload batching: flush when this many samples queue up, or after FLUSH_MS. */
    private const val UPLOAD_BATCH = 20
    private const val FLUSH_MS = 1500L
    private const val ES_INDEX = "gpssensor-logs"

    private val _state = MutableStateFlow(RecorderState())
    val state: StateFlow<RecorderState> = _state.asStateFlow()

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var sensorManager: SensorManager? = null
    private var locationManager: LocationManager? = null

    private val samples = ArrayList<Sample>()
    private val recentBuf = ArrayDeque<Sample>()
    private var startUptimeMs = 0L
    private var startWallMs = 0L
    private var intervalMs = 200L
    private var sessionId = ""
    private var lastDeviceId = "unknown"
    private var lastDeviceName = "android"

    // real-time upload
    private var uploader: Uploader? = null
    private val pendingUpload = ArrayList<Sample>()
    private var lastFlushMs = 0L

    // latest raw readings, written from the sensor thread
    private val accel = FloatArray(3)
    private val gyro = FloatArray(3)
    private val mag = FloatArray(3)
    private var hasAccel = false
    private var hasGyro = false
    private var hasMag = false
    @Volatile private var lastLocation: Location? = null

    fun deviceLabel(): String = "${Build.MANUFACTURER} ${Build.MODEL} / Android ${Build.VERSION.RELEASE}"

    val isRecording: Boolean get() = _state.value.recording

    @SuppressLint("MissingPermission")
    fun start(
        context: Context,
        intervalMs: Long,
        deviceId: String,
        deviceName: String,
        esUrl: String?,
    ) {
        if (isRecording) return
        this.intervalMs = intervalMs.coerceIn(20L, 60_000L)
        val app = context.applicationContext

        samples.clear()
        recentBuf.clear()
        pendingUpload.clear()
        hasAccel = false; hasGyro = false; hasMag = false
        lastLocation = null
        startUptimeMs = SystemClock.uptimeMillis()
        startWallMs = System.currentTimeMillis()
        lastFlushMs = startUptimeMs
        lastDeviceId = deviceId
        lastDeviceName = deviceName
        sessionId = "session_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date(startWallMs))

        uploader = if (!esUrl.isNullOrBlank()) {
            Uploader(
                StreamConfig(
                    esUrl = esUrl,
                    index = ES_INDEX,
                    deviceId = deviceId,
                    deviceName = deviceName,
                    device = deviceLabel(),
                    intervalMs = this.intervalMs,
                    sessionId = sessionId,
                    startWallMs = startWallMs,
                )
            )
        } else null

        val ht = HandlerThread("recorder").apply { start() }
        thread = ht
        val h = Handler(ht.looper)
        handler = h

        val sm = app.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sensorManager = sm
        registerSensor(sm, Sensor.TYPE_ACCELEROMETER, h)
        registerSensor(sm, Sensor.TYPE_GYROSCOPE, h)
        registerSensor(sm, Sensor.TYPE_MAGNETIC_FIELD, h)

        val lm = app.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationManager = lm
        val locMin = this.intervalMs.coerceAtMost(1000L)
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, locMin, 0f, locationListener, ht.looper)
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, locMin, 0f, locationListener, ht.looper)
            }
        } catch (_: SecurityException) {
            // permission missing: keep logging sensors without location
        }

        _state.value = RecorderState(recording = true, intervalMs = this.intervalMs, streaming = uploader != null)
        h.post(tick)
    }

    /** Stops recording and returns the captured samples + metadata, or null if nothing was active. */
    fun stop(): Pair<SessionMeta, List<Sample>>? {
        if (!isRecording) return null
        handler?.removeCallbacks(tick)
        try { sensorManager?.unregisterListener(sensorListener) } catch (_: Exception) {}
        try { locationManager?.removeUpdates(locationListener) } catch (_: Exception) {}
        thread?.quitSafely()
        thread = null; handler = null; sensorManager = null; locationManager = null

        // flush any remaining buffered samples, then tear the uploader down
        uploader?.let { up ->
            if (pendingUpload.isNotEmpty()) { up.flush(ArrayList(pendingUpload)); pendingUpload.clear() }
            up.close()
        }
        uploader = null

        val captured = ArrayList(samples)
        val meta = SessionMeta(
            id = sessionId,
            startedAt = startWallMs,
            intervalMs = intervalMs,
            device = deviceLabel(),
            deviceId = lastDeviceId,
            deviceName = lastDeviceName,
            sampleCount = captured.size,
            durationMs = captured.lastOrNull()?.t ?: 0L,
        )
        _state.value = RecorderState(recording = false, intervalMs = intervalMs)
        return meta to captured
    }

    private fun registerSensor(sm: SensorManager, type: Int, h: Handler) {
        sm.getDefaultSensor(type)?.let {
            sm.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_GAME, h)
        }
    }

    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            when (e.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> { System.arraycopy(e.values, 0, accel, 0, 3); hasAccel = true }
                Sensor.TYPE_GYROSCOPE -> { System.arraycopy(e.values, 0, gyro, 0, 3); hasGyro = true }
                Sensor.TYPE_MAGNETIC_FIELD -> { System.arraycopy(e.values, 0, mag, 0, 3); hasMag = true }
            }
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    private val locationListener = LocationListener { loc ->
        val prev = lastLocation
        if (prev == null || loc.time >= prev.time) lastLocation = loc
    }

    /** Runs on the recorder thread every [intervalMs]; appends one aligned sample. */
    private val tick = object : Runnable {
        override fun run() {
            val t = SystemClock.uptimeMillis() - startUptimeMs
            val loc = lastLocation
            val s = Sample(
                t = t,
                lat = loc?.latitude,
                lon = loc?.longitude,
                alt = if (loc?.hasAltitude() == true) loc.altitude else null,
                acc = if (loc?.hasAccuracy() == true) loc.accuracy else null,
                ax = accel[0], ay = accel[1], az = accel[2],
                gx = gyro[0], gy = gyro[1], gz = gyro[2],
                mx = mag[0], my = mag[1], mz = mag[2],
            )
            samples.add(s)
            recentBuf.addLast(s)
            while (recentBuf.size > WINDOW) recentBuf.removeFirst()

            // live stream: batch & flush to ELK
            val up = uploader
            if (up != null) {
                pendingUpload.add(s)
                val now = SystemClock.uptimeMillis()
                if (pendingUpload.size >= UPLOAD_BATCH || now - lastFlushMs >= FLUSH_MS) {
                    up.flush(ArrayList(pendingUpload))
                    pendingUpload.clear()
                    lastFlushMs = now
                }
            }
            val st = up?.status

            _state.value = _state.value.copy(
                sampleCount = samples.size,
                elapsedMs = t,
                lat = loc?.latitude, lon = loc?.longitude,
                accuracy = if (loc?.hasAccuracy() == true) loc.accuracy else null,
                ax = accel[0], ay = accel[1], az = accel[2],
                gx = gyro[0], gy = gyro[1], gz = gyro[2],
                mx = mag[0], my = mag[1], mz = mag[2],
                hasAccel = hasAccel, hasGyro = hasGyro, hasMag = hasMag,
                hasFix = loc != null,
                recent = recentBuf.toList(),
                uploaded = st?.uploaded ?: 0,
                uploadFailed = st?.failed ?: 0,
                uploadError = st?.lastError,
            )
            handler?.postDelayed(this, intervalMs)
        }
    }
}
