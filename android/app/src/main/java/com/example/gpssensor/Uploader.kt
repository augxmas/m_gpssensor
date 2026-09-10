package com.example.gpssensor

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

data class StreamConfig(
    val esUrl: String,
    val index: String,
    val deviceId: String,
    val deviceName: String,
    val device: String,
    val intervalMs: Long,
    val sessionId: String,
    val startWallMs: Long,
)

/** Live upload status surfaced to the UI. */
data class UploadStatus(
    val uploaded: Int = 0,
    val failed: Int = 0,
    val lastError: String? = null,
)

/**
 * Best-effort real-time streamer: batches of samples are POSTed to the
 * Elasticsearch `_bulk` API on a background IO scope. Failures are counted but
 * never re-queued or thrown — the on-device JSON log remains the complete record,
 * this is just the live feed for the admin's Kibana map.
 */
class Uploader(private val cfg: StreamConfig) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val endpoint = cfg.esUrl.trimEnd('/') + "/" + cfg.index + "/_bulk"

    @Volatile var status = UploadStatus()
        private set

    fun flush(batch: List<Sample>) {
        if (batch.isEmpty()) return
        val body = buildBulk(batch)
        scope.launch { post(body, batch.size) }
    }

    fun close() = scope.cancel()

    private fun post(body: String, count: Int) {
        try {
            val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5000
                readTimeout = 8000
                doOutput = true
                setRequestProperty("Content-Type", "application/x-ndjson")
            }
            conn.outputStream.use { os: OutputStream -> os.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.inputStreamOrError().use { it.readBytes() }
            conn.disconnect()
            status = if (code in 200..299) {
                status.copy(uploaded = status.uploaded + count, lastError = null)
            } else {
                status.copy(failed = status.failed + count, lastError = "HTTP $code")
            }
        } catch (e: Exception) {
            status = status.copy(failed = status.failed + count, lastError = e.message ?: e.javaClass.simpleName)
        }
    }

    private fun HttpURLConnection.inputStreamOrError() =
        try { inputStream } catch (_: Exception) { errorStream ?: "".byteInputStream() }

    private fun buildBulk(batch: List<Sample>): String {
        val sb = StringBuilder(batch.size * 220)
        for (s in batch) {
            sb.append("{\"index\":{}}\n")
            sb.append("{\"@timestamp\":\"")
                .append(Instant.ofEpochMilli(cfg.startWallMs + s.t).toString()).append("\",")
                .append("\"session_id\":\"").append(esc(cfg.sessionId)).append("\",")
                .append("\"device_id\":\"").append(esc(cfg.deviceId)).append("\",")
                .append("\"device_name\":\"").append(esc(cfg.deviceName)).append("\",")
                .append("\"device\":\"").append(esc(cfg.device)).append("\",")
                .append("\"interval_ms\":").append(cfg.intervalMs).append(',')
                .append("\"t_ms\":").append(s.t).append(',')
                .append("\"alt\":").append(s.alt ?: "null").append(',')
                .append("\"gps_accuracy\":").append(s.acc ?: "null").append(',')
                .append("\"ax\":").append(s.ax).append(",\"ay\":").append(s.ay).append(",\"az\":").append(s.az).append(',')
                .append("\"gx\":").append(s.gx).append(",\"gy\":").append(s.gy).append(",\"gz\":").append(s.gz).append(',')
                .append("\"mx\":").append(s.mx).append(",\"my\":").append(s.my).append(",\"mz\":").append(s.mz)
            if (s.lat != null && s.lon != null) {
                sb.append(",\"location\":{\"lat\":").append(s.lat).append(",\"lon\":").append(s.lon).append('}')
            }
            sb.append("}\n")
        }
        return sb.toString()
    }

    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"")
}
