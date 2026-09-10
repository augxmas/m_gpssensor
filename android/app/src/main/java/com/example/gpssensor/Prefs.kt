package com.example.gpssensor

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings

/** User-configurable settings, persisted in SharedPreferences. */
data class AppSettings(
    val deviceName: String,
    val esUrl: String,
    val streamEnabled: Boolean,
)

object Prefs {
    private const val FILE = "settings"
    private const val KEY_NAME = "device_name"
    private const val KEY_ES = "es_url"
    private const val KEY_STREAM = "stream_enabled"

    fun load(context: Context): AppSettings {
        val sp = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        return AppSettings(
            deviceName = sp.getString(KEY_NAME, null) ?: Build.MODEL ?: "android",
            esUrl = sp.getString(KEY_ES, null) ?: "http://172.30.1.96:9200",
            streamEnabled = sp.getBoolean(KEY_STREAM, false),
        )
    }

    fun save(context: Context, s: AppSettings) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putString(KEY_NAME, s.deviceName)
            .putString(KEY_ES, s.esUrl)
            .putBoolean(KEY_STREAM, s.streamEnabled)
            .apply()
    }

    /** Stable per-install identifier for this device. */
    @SuppressLint("HardwareIds")
    fun deviceId(context: Context): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
}
