package com.example.gpssensor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the [Recorder] running while the screen is off
 * or the app is backgrounded. Started/stopped from [MainActivity].
 */
class LoggingService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val interval = intent.getLongExtra(EXTRA_INTERVAL_MS, 200L)
                val settings = Prefs.load(this)
                startForegroundCompat()
                Recorder.start(
                    context = this,
                    intervalMs = interval,
                    deviceId = Prefs.deviceId(this),
                    deviceName = settings.deviceName,
                    esUrl = if (settings.streamEnabled) settings.esUrl else null,
                )
            }
            ACTION_STOP -> {
                val result = Recorder.stop()
                if (result != null) {
                    SessionStore.save(this, result.first, result.second)
                }
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "logging"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(channelId, getString(R.string.notif_channel_name), NotificationManager.IMPORTANCE_LOW)
            nm.createNotificationChannel(ch)
        }
        val openIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification: Notification = Notification.Builder(this, channelId)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Recording sensors & location…")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    companion object {
        const val ACTION_START = "com.example.gpssensor.START"
        const val ACTION_STOP = "com.example.gpssensor.STOP"
        const val EXTRA_INTERVAL_MS = "interval_ms"
        private const val NOTIF_ID = 1001

        fun start(context: Context, intervalMs: Long) {
            val i = Intent(context, LoggingService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_INTERVAL_MS, intervalMs)
            }
            context.startForegroundService(i)
        }

        fun stop(context: Context) {
            val i = Intent(context, LoggingService::class.java).apply { action = ACTION_STOP }
            context.startService(i)
        }
    }
}
