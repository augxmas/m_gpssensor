package com.example.gpssensor

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppScreen()
                }
            }
        }
    }
}

private val INTERVALS = listOf(50L, 100L, 200L, 500L, 1000L)

private val COLOR_X = Color(0xFF2F81F7)
private val COLOR_Y = Color(0xFF3FB950)
private val COLOR_Z = Color(0xFFF0883E)
private val GRID = Color(0x33FFFFFF)

private class Channel(val label: String, val color: Color, val extract: (Sample) -> Float)

@Composable
private fun AppScreen() {
    val context = LocalContext.current
    val state by Recorder.state.collectAsStateWithLifecycle()

    var interval by remember { mutableStateOf(200L) }
    var settings by remember { mutableStateOf(Prefs.load(context)) }
    var sessions by remember { mutableStateOf(SessionStore.list(context)) }
    fun refresh() { sessions = SessionStore.list(context) }
    fun update(s: AppSettings) { settings = s; Prefs.save(context, s) }

    fun locationGranted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    // A foreground service with foregroundServiceType=location must NOT be started
    // until location permission is granted (Android 14+ throws otherwise).
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        if (locationGranted()) LoggingService.start(context, interval)
    }

    fun ensurePermissionsThenStart() {
        val needed = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isEmpty()) {
            LoggingService.start(context, interval)
        } else {
            permLauncher.launch(needed.toTypedArray())
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("GPS Sensor Logger", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)

        Text("Sampling interval", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            INTERVALS.forEach { ms ->
                FilterChip(
                    selected = interval == ms,
                    onClick = { if (!state.recording) interval = ms },
                    label = { Text(if (ms >= 1000) "${ms / 1000}s" else "${ms}ms") },
                    enabled = !state.recording,
                )
            }
        }

        SettingsCard(
            settings = settings,
            deviceId = Prefs.deviceId(context),
            enabled = !state.recording,
            onChange = { update(it) },
        )

        if (!state.recording) {
            Button(onClick = { ensurePermissionsThenStart() }, modifier = Modifier.fillMaxWidth()) {
                Text("Start recording")
            }
        } else {
            Button(
                onClick = { LoggingService.stop(context); refresh() },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Stop & save") }
        }

        StatusCard(state)

        // Live graphs — one per sensor, x/y/z drawn as colored lines.
        LiveChart(
            title = "Accelerometer", unit = "m/s²", available = state.hasAccel, samples = state.recent,
            channels = listOf(
                Channel("x", COLOR_X) { it.ax }, Channel("y", COLOR_Y) { it.ay }, Channel("z", COLOR_Z) { it.az },
            ),
        )
        LiveChart(
            title = "Gyroscope", unit = "rad/s", available = state.hasGyro, samples = state.recent,
            channels = listOf(
                Channel("x", COLOR_X) { it.gx }, Channel("y", COLOR_Y) { it.gy }, Channel("z", COLOR_Z) { it.gz },
            ),
        )
        LiveChart(
            title = "Magnetometer", unit = "µT", available = state.hasMag, samples = state.recent,
            channels = listOf(
                Channel("x", COLOR_X) { it.mx }, Channel("y", COLOR_Y) { it.my }, Channel("z", COLOR_Z) { it.mz },
            ),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Saved logs (${sessions.size})", style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = { refresh() }) { Text("Refresh") }
        }

        if (sessions.isEmpty()) {
            Text("No logs yet. Record one, then Share the .json file to your computer.",
                style = MaterialTheme.typography.bodyMedium)
        } else {
            // Rendered inline (not a nested LazyColumn) so each row — including the
            // Share/Delete buttons — is always fully visible.
            sessions.forEach { s ->
                SessionRow(
                    session = s,
                    onShare = { SessionStore.share(context, s) },
                    onDelete = { SessionStore.delete(s); refresh() },
                )
            }
        }
    }
}

@Composable
private fun SettingsCard(
    settings: AppSettings,
    deviceId: String,
    enabled: Boolean,
    onChange: (AppSettings) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Device & streaming", fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = settings.deviceName,
                onValueChange = { onChange(settings.copy(deviceName = it)) },
                label = { Text("Device name (shown on the map)") },
                singleLine = true, enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            )
            Text("Device ID: $deviceId", fontFamily = FontFamily.Monospace, fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = settings.esUrl,
                onValueChange = { onChange(settings.copy(esUrl = it)) },
                label = { Text("ELK (Elasticsearch) URL") },
                placeholder = { Text("http://172.30.1.96:9200") },
                singleLine = true, enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Stream to ELK in real-time")
                Switch(
                    checked = settings.streamEnabled,
                    onCheckedChange = { onChange(settings.copy(streamEnabled = it)) },
                    enabled = enabled,
                )
            }
        }
    }
}

@Composable
private fun StatusCard(state: RecorderState) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val status = if (state.recording) "● RECORDING" else "Idle"
            Text(status, fontWeight = FontWeight.Bold,
                color = if (state.recording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            Text("Samples: ${state.sampleCount}    Elapsed: ${formatElapsed(state.elapsedMs)}", fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            val loc = if (state.lat != null && state.lon != null)
                "%.6f, %.6f  ±%.0fm".format(state.lat, state.lon, state.accuracy ?: 0f)
            else "waiting for GPS fix…"
            Text("GPS: $loc", fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            if (state.streaming) {
                val err = state.uploadError
                val line = "ELK: sent ${state.uploaded}" +
                    (if (state.uploadFailed > 0) "  failed ${state.uploadFailed}" else "") +
                    (if (err != null) "  ($err)" else "")
                Text(line, fontFamily = FontFamily.Monospace, fontSize = 13.sp,
                    color = if (err != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun LiveChart(
    title: String,
    unit: String,
    available: Boolean,
    samples: List<Sample>,
    channels: List<Channel>,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(unit, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            // legend + live current values
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                channels.forEach { ch ->
                    val cur = samples.lastOrNull()?.let(ch.extract)
                    Text(
                        "${ch.label} ${cur?.let { "%+.3f".format(it) } ?: "—"}",
                        color = ch.color, fontSize = 12.sp, fontFamily = FontFamily.Monospace,
                    )
                }
            }
            Canvas(modifier = Modifier.fillMaxWidth().height(110.dp)) {
                if (!available || samples.size < 2) return@Canvas

                var mn = Float.POSITIVE_INFINITY
                var mx = Float.NEGATIVE_INFINITY
                for (s in samples) for (ch in channels) {
                    val v = ch.extract(s)
                    if (v < mn) mn = v
                    if (v > mx) mx = v
                }
                if (!mn.isFinite() || !mx.isFinite()) return@Canvas
                if (mn == mx) { mn -= 1f; mx += 1f }
                val pad = (mx - mn) * 0.12f
                mn -= pad; mx += pad

                val w = size.width
                val h = size.height
                val n = samples.size
                val span = mx - mn

                // zero baseline if it falls within range
                if (mn < 0f && mx > 0f) {
                    val zy = h - (0f - mn) / span * h
                    drawLine(GRID, Offset(0f, zy), Offset(w, zy), strokeWidth = 1f)
                }

                val stroke = Stroke(width = 2.dp.toPx())
                for (ch in channels) {
                    val path = Path()
                    for (i in samples.indices) {
                        val px = if (n == 1) 0f else w * i / (n - 1)
                        val py = h - (ch.extract(samples[i]) - mn) / span * h
                        if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
                    }
                    drawPath(path, ch.color, style = stroke)
                }
            }
            if (!available) {
                Text("sensor not available / no data yet",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun SessionRow(session: SavedSession, onShare: () -> Unit, onDelete: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(session.id, fontWeight = FontWeight.Medium)
            val when_ = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(session.modified))
            Text("$when_  •  ${session.sizeBytes / 1024} KB", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onShare) { Text("Share") }
                OutlinedButton(onClick = onDelete) { Text("Delete") }
            }
        }
    }
}

private fun formatElapsed(ms: Long): String {
    val totalSec = ms / 1000
    val m = totalSec / 60
    val s = totalSec % 60
    return "%02d:%02d".format(m, s)
}
