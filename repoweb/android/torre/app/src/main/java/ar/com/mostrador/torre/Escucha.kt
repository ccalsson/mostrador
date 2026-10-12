package ar.com.mostrador.torre

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
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private const val CANAL = "torre"
private const val ESCUCHA_ID = 7

fun prefsTorre(context: Context) = context.getSharedPreferences("torre", Context.MODE_PRIVATE)

fun canalTorre(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CANAL) != null) return
    val canal = NotificationChannel(CANAL, "Torre", NotificationManager.IMPORTANCE_HIGH)
    canal.description = "Avisos para habilitar o resolver"
    manager.createNotificationChannel(canal)
}

private fun abrirTorre(context: Context): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

private fun base(context: Context) = NotificationCompat.Builder(context, CANAL)
    .setSmallIcon(R.drawable.ic_aviso)
    .setContentIntent(abrirTorre(context))

class Escucha : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        canalTorre(this)
        val aviso = base(this)
            .setContentTitle("Torre en escucha")
            .setContentText("Avisa si hay algo para habilitar o resolver.")
            .setOngoing(true)
            .setSilent(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(ESCUCHA_ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(ESCUCHA_ID, aviso)
        }
        if (loop?.isActive != true) {
            loop = scope.launch {
                while (isActive) {
                    if (!revisar()) break
                    delay(45_000)
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun revisar(): Boolean {
        val prefs = prefsTorre(this)
        val servidor = prefs.getString("servidor", "").orEmpty()
        val token = prefs.getString("token", "").orEmpty()
        if (!prefs.getBoolean("escuchar", false) || servidor.isBlank() || token.isBlank()) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return false
        }
        val data = try {
            Red(servidor).pendientes(token)
        } catch (_: Exception) {
            return true
        }
        val ids = (data.pedidos.map { it.id } + data.alertas.map { it.id }).toSet()
        if (!prefs.getBoolean("sembrado", false)) {
            prefs.edit().putStringSet("vistos", ids).putBoolean("sembrado", true).apply()
            return true
        }
        val vistos = prefs.getStringSet("vistos", emptySet()) ?: emptySet()
        val nuevos = ids - vistos
        val manager = getSystemService(NotificationManager::class.java)
        for (pedido in data.pedidos) {
            if (pedido.id !in nuevos) continue
            manager.notify(notaId(pedido.id), avisoDe("Hay que habilitar", "${pedido.tenant} pidió ${pedido.product}."))
        }
        for (alerta in data.alertas) {
            if (alerta.id !in nuevos) continue
            manager.notify(notaId(alerta.id), avisoDe("Hay que resolver", alerta.texto))
        }
        prefs.edit().putStringSet("vistos", ids).apply()
        return true
    }

    private fun avisoDe(titulo: String, cuerpo: String): Notification =
        base(this).setContentTitle(titulo).setContentText(cuerpo).setAutoCancel(true).build()

    private fun notaId(id: String) = 1000 + (id.hashCode() and 0xffff)
}
