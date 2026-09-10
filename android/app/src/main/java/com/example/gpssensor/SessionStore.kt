package com.example.gpssensor

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SessionMeta(
    val id: String,
    val startedAt: Long,
    val intervalMs: Long,
    val device: String,
    val deviceId: String,
    val deviceName: String,
    val sampleCount: Int,
    val durationMs: Long,
)

/** A log file already saved on disk. */
data class SavedSession(
    val id: String,
    val jsonFile: File,
    val csvFile: File,
    val sizeBytes: Long,
    val modified: Long,
)

object SessionStore {

    private fun dir(context: Context): File =
        File(context.getExternalFilesDir(null), "sessions").apply { mkdirs() }

    /** Writes both a JSON file (consumed by the web app) and a CSV file. Returns the JSON file. */
    fun save(context: Context, meta: SessionMeta, samples: List<Sample>): File {
        val id = meta.id.ifBlank {
            "session_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date(meta.startedAt))
        }
        val dir = dir(context)
        val json = File(dir, "$id.json")
        val csv = File(dir, "$id.csv")
        json.writeText(buildJson(id, meta, samples))
        csv.writeText(buildCsv(samples))
        return json
    }

    fun list(context: Context): List<SavedSession> {
        val dir = dir(context)
        val jsons = dir.listFiles { f -> f.extension == "json" } ?: return emptyList()
        return jsons.sortedByDescending { it.lastModified() }.map { j ->
            val id = j.nameWithoutExtension
            SavedSession(
                id = id,
                jsonFile = j,
                csvFile = File(dir, "$id.csv"),
                sizeBytes = j.length(),
                modified = j.lastModified(),
            )
        }
    }

    fun delete(session: SavedSession) {
        session.jsonFile.delete()
        if (session.csvFile.exists()) session.csvFile.delete()
    }

    /** Opens the system share sheet for the session's JSON + CSV files. */
    fun share(context: Context, session: SavedSession) {
        val authority = "${context.packageName}.fileprovider"
        val uris = ArrayList<Uri>()
        uris.add(FileProvider.getUriForFile(context, authority, session.jsonFile))
        if (session.csvFile.exists()) uris.add(FileProvider.getUriForFile(context, authority, session.csvFile))
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "application/octet-stream"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share log").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ---- serialization ----

    private fun num(v: Double?): String = v?.toString() ?: "null"
    private fun num(v: Float?): String = v?.toString() ?: "null"

    private fun buildJson(id: String, meta: SessionMeta, samples: List<Sample>): String {
        val sb = StringBuilder(samples.size * 96 + 256)
        sb.append("{\"format\":\"gpssensor-log\",\"version\":1,")
        sb.append("\"session\":{")
        sb.append("\"id\":\"").append(id).append("\",")
        sb.append("\"startedAt\":").append(meta.startedAt).append(',')
        sb.append("\"intervalMs\":").append(meta.intervalMs).append(',')
        sb.append("\"device\":\"").append(escape(meta.device)).append("\",")
        sb.append("\"deviceId\":\"").append(escape(meta.deviceId)).append("\",")
        sb.append("\"deviceName\":\"").append(escape(meta.deviceName)).append("\",")
        sb.append("\"sampleCount\":").append(meta.sampleCount).append(',')
        sb.append("\"durationMs\":").append(meta.durationMs)
        sb.append("},\"samples\":[")
        for (i in samples.indices) {
            val s = samples[i]
            if (i > 0) sb.append(',')
            sb.append("{\"t\":").append(s.t)
                .append(",\"lat\":").append(num(s.lat))
                .append(",\"lon\":").append(num(s.lon))
                .append(",\"alt\":").append(num(s.alt))
                .append(",\"acc\":").append(num(s.acc))
                .append(",\"ax\":").append(s.ax).append(",\"ay\":").append(s.ay).append(",\"az\":").append(s.az)
                .append(",\"gx\":").append(s.gx).append(",\"gy\":").append(s.gy).append(",\"gz\":").append(s.gz)
                .append(",\"mx\":").append(s.mx).append(",\"my\":").append(s.my).append(",\"mz\":").append(s.mz)
                .append('}')
        }
        sb.append("]}")
        return sb.toString()
    }

    private fun buildCsv(samples: List<Sample>): String {
        val sb = StringBuilder(samples.size * 80 + 64)
        sb.append("t_ms,lat,lon,alt,acc,ax,ay,az,gx,gy,gz,mx,my,mz\n")
        for (s in samples) {
            sb.append(s.t).append(',')
                .append(s.lat ?: "").append(',')
                .append(s.lon ?: "").append(',')
                .append(s.alt ?: "").append(',')
                .append(s.acc ?: "").append(',')
                .append(s.ax).append(',').append(s.ay).append(',').append(s.az).append(',')
                .append(s.gx).append(',').append(s.gy).append(',').append(s.gz).append(',')
                .append(s.mx).append(',').append(s.my).append(',').append(s.mz).append('\n')
        }
        return sb.toString()
    }

    private fun escape(s: String): String =
        s.replace("\\", "\\\\").replace("\"", "\\\"")
}
