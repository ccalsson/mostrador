package ar.com.mostrador.torre

import android.app.Application
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class EstadoTorre(
    val servidor: String = "",
    val email: String = "",
    val clave: String = "",
    val token: String = "",
    val escuchar: Boolean = false,
    val pedidos: List<PedidoTorre> = emptyList(),
    val alertas: List<AlertaTorre> = emptyList(),
    val ocupado: Boolean = false,
    val error: String? = null,
)

class TorreVm(app: Application) : AndroidViewModel(app) {
    private val prefs = prefsTorre(app)
    private val _e = MutableStateFlow(EstadoTorre())
    val estado: StateFlow<EstadoTorre> = _e

    init {
        val token = prefs.getString("token", "").orEmpty()
        _e.value = EstadoTorre(
            servidor = prefs.getString("servidor", "").orEmpty(),
            email = prefs.getString("email", "").orEmpty(),
            token = token,
            escuchar = prefs.getBoolean("escuchar", false),
        )
        if (token.isNotBlank()) refrescar()
    }

    fun servidor(v: String) = edit { copy(servidor = v.trim()) }
    fun email(v: String) = edit { copy(email = v.trim()) }
    fun clave(v: String) = edit { copy(clave = v) }

    fun entrar() = correr {
        val e = _e.value
        if (e.servidor.isBlank()) throw FalloRed("Poné la dirección de la web publicada.", 400)
        val base = e.servidor.trim().trimEnd('/')
        val res = withContext(Dispatchers.IO) { Red(base).ingresar(e.email, e.clave) }
        val token = res.optString("token")
        if (token.isBlank()) throw FalloRed("El servidor no devolvió sesión.", 500)
        prefs.edit().putString("servidor", base).putString("token", token).putString("email", e.email).apply()
        edit { copy(servidor = base, token = token, clave = "", error = null) }
        cargar()
    }

    fun refrescar() = correr { cargar() }

    fun habilitar(id: String) = correr {
        val e = _e.value
        withContext(Dispatchers.IO) { Red(e.servidor).habilitar(e.token, id) }
        cargar()
    }

    fun escuchar(on: Boolean) {
        prefs.edit().putBoolean("escuchar", on).apply()
        if (!on) prefs.edit().putBoolean("sembrado", false).apply()
        val app = getApplication<Application>()
        val intent = Intent(app, Escucha::class.java)
        if (on) ContextCompat.startForegroundService(app, intent) else app.stopService(intent)
        edit { copy(escuchar = on) }
    }

    fun salir() {
        escuchar(false)
        prefs.edit().remove("token").putBoolean("sembrado", false).apply()
        val servidor = _e.value.servidor
        val email = _e.value.email
        _e.value = EstadoTorre(servidor = servidor, email = email)
    }

    private suspend fun cargar() {
        val e = _e.value
        val data = withContext(Dispatchers.IO) { Red(e.servidor).pendientes(e.token) }
        edit { copy(pedidos = data.pedidos, alertas = data.alertas, error = null) }
    }

    private fun correr(block: suspend () -> Unit) {
        viewModelScope.launch {
            edit { copy(ocupado = true, error = null) }
            try {
                block()
            } catch (error: Exception) {
                edit { copy(error = error.message ?: "No se pudo completar.") }
            } finally {
                edit { copy(ocupado = false) }
            }
        }
    }

    private inline fun edit(block: EstadoTorre.() -> EstadoTorre) {
        _e.value = _e.value.block()
    }
}
