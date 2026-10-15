package ar.com.mostrador.mercado

import android.app.Application
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

private const val SERVIDOR = "https://mostrador.grok.me"

data class Estado(
    val servidor: String = SERVIDOR,
    val token: String? = null,
    val perfil: String = "comprador",
    val como: String = "comprador",
    val alta: Boolean = false,
    val nombre: String = "",
    val email: String = "",
    val password: String = "",
    val telefono: String = "",
    val pais: String = "AR",
    val documento: String = "",
    val captcha: String = "",
    val error: String? = null,
    val aviso: String? = null,
    val ocupado: Boolean = false,
    val identidad: String = "pendiente",
    val panel: String = "puestos",
    val puestos: List<Puesto> = emptyList(),
    val puesto: Puesto? = null,
    val productos: List<Producto> = emptyList(),
    val busca: String = "",
    val carrito: List<Linea> = emptyList(),
    val medioPago: String = "efectivo",
    val nota: String = "",
    val comprobanteNombre: String? = null,
    val pedidos: List<Pedido> = emptyList(),
    val detalleId: String? = null,
    val elegidos: Set<String> = emptySet(),
    val cargadores: List<Cargador> = emptyList(),
    val recorridos: List<Recorrido> = emptyList(),
    val ranking: List<Rank> = emptyList(),
    val avisos: List<Aviso> = emptyList(),
    val ficha: FichaComprador? = null,
    val yoCargador: FichaCargador? = null,
    val legales: List<DocLegal> = emptyList(),
    val legalRevisado: Boolean = false,
    val calificados: Map<String, Int> = emptyMap(),
    val calificadosPuesto: Set<String> = emptySet(),
    val calificadosComprador: Set<String> = emptySet(),
    val pendiente: CheckoutPendiente? = null,
)

class MercadoVm(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("mercado", 0)
    private val _e = MutableStateFlow(Estado())
    val estado = _e.asStateFlow()
    private var comprobante: Pair<String, String>? = null
    private var fotoData: String? = null
    private var doc64: String? = null
    private var selfie64: String? = null
    private var escucha: Job? = null

    init {
        val token = prefs.getString("token", null)
        val perfil = prefs.getString("perfil", "comprador") ?: "comprador"
        _e.value = _e.value.copy(servidor = SERVIDOR, token = token, perfil = perfil, pendiente = leerCheckout())
        if (!token.isNullOrBlank()) {
            viewModelScope.launch(Dispatchers.IO) {
                try {
                    entrarSesion(token)
                } catch (error: Exception) {
                    edit { copy(error = error.message, legalRevisado = true) }
                }
            }
        }
        escucharPedidos()
    }

    private fun edit(block: Estado.() -> Estado) { _e.value = _e.value.block() }
    private fun red() = Red(SERVIDOR)

    private fun escucharPedidos() {
        if (escucha?.isActive == true) return
        escucha = viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(8_000)
                val e = _e.value
                val token = e.token
                if (token.isNullOrBlank() || e.perfil != "comprador" || e.ocupado) continue
                val vivos = e.pedidos.isEmpty() || e.pedidos.any { it.estado != "entregado" && it.estado != "cancelado" }
                if (!vivos) continue
                runCatching { sincronizarPedidos(token) }
            }
        }
    }

    private suspend fun sincronizarPedidos(token: String) {
        val antes = _e.value.pedidos.associate { it.id to it.pagoEstado }
        val pedidos = red().pedidos(token)
        val nuevo = pedidos.any { pedido ->
            val previo = antes[pedido.id] ?: return@any false
            habilitaCargador(pedido.formaPago, pedido.pagoEstado) && !pedido.tieneCargador && previo != "habilitado"
        }
        val cargadores = if (pedidos.any { habilitaCargador(it.formaPago, it.pagoEstado) && !it.tieneCargador }) {
            runCatching { red().cargadores(token) }.getOrDefault(_e.value.cargadores)
        } else {
            _e.value.cargadores
        }
        val recorridos = runCatching { red().recorridos(token) }.getOrDefault(_e.value.recorridos)
        edit {
            copy(
                pedidos = pedidos,
                cargadores = cargadores,
                recorridos = recorridos,
                aviso = if (nuevo) "Ya podés elegir el cargador." else aviso,
                panel = if (nuevo) "pedidos" else panel,
            )
        }
    }

    fun como(v: String) = edit { copy(como = v) }
    fun alta(v: Boolean) = edit { copy(alta = v, error = null) }
    fun nombre(v: String) = edit { copy(nombre = v) }
    fun email(v: String) = edit { copy(email = v) }
    fun password(v: String) = edit { copy(password = v) }
    fun telefono(v: String) = edit { copy(telefono = v) }
    fun pais(v: String) = edit { copy(pais = v) }
    fun documento(v: String) = edit { copy(documento = v) }
    fun captcha(v: String) = edit { copy(captcha = v) }
    fun busca(v: String) = edit { copy(busca = v) }
    fun refrescar() = correr {
        if (_e.value.perfil == "cargador") cargarRecorridos() else cargarPedidos()
    }
    fun panel(v: String) {
        edit { copy(panel = v, error = null) }
        if (v == "pedidos") correr { cargarPedidos() }
    }

    fun ingresar() = correr {
        val e = _e.value
        val data = if (e.alta && e.como == "cargador") red().registrarCargador(e.nombre, e.email, e.password, e.telefono, e.captcha)
        else if (e.alta) red().registrarComprador(e.nombre, e.email, e.password, e.telefono, e.pais, e.documento, e.captcha)
        else red().ingresar(e.email, e.password, e.como)
        if (e.alta && (data.optBoolean("pendiente") || data.txt("token").isBlank())) {
            val aviso = data.txt("aviso").ifBlank { "Confirmá el correo antes de entrar." }
            val enlace = data.txt("enlace")
            edit { copy(aviso = if (enlace.isBlank()) aviso else "$aviso $enlace", alta = true) }
            return@correr
        }
        val token = data.txt("token")
        val perfil = if (e.alta) e.como else data.txt("perfil").ifBlank { e.como }
        prefs.edit().putString("token", token).putString("perfil", perfil).apply()
        edit { copy(token = token, perfil = perfil, identidad = data.optJSONObject("comprador")?.txt("identidadEstado") ?: identidad) }
        entrarSesion(token)
    }

    fun urlGoogle(): String {
        val perfil = if (_e.value.como == "cargador") "cargador" else "comprador"
        return "$SERVIDOR/api/mercado/v1/auth/google/ir?perfil=$perfil"
    }

    fun entrarConGoogle(token: String) {
        if (token.isBlank() || _e.value.token == token) return
        correr {
            prefs.edit().putString("token", token).apply()
            edit { copy(token = token, alta = false) }
            entrarSesion(token)
            prefs.edit().putString("perfil", _e.value.perfil).apply()
        }
    }

    fun salir() {
        val token = _e.value.token
        if (token != null) viewModelScope.launch(Dispatchers.IO) { runCatching { red().salir(token) } }
        prefs.edit().remove("token").remove("perfil").apply()
        comprobante = null
        edit { Estado() }
    }

    fun archivo(tipo: String, nombre: String, bytes: ByteArray, mime: String) {
        if (bytes.size > 700_000 && tipo == "comprobante") {
            edit { copy(error = "El comprobante tiene que pesar menos de 700 KB.") }
            return
        }
        if (bytes.size > 1_400_000) {
            edit { copy(error = "La foto es muy pesada.") }
            return
        }
        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        when (tipo) {
            "comprobante" -> {
                comprobante = nombre to "data:$mime;base64,$b64"
                edit { copy(comprobanteNombre = nombre, error = null) }
            }
            "doc" -> doc64 = b64
            "selfie" -> selfie64 = b64
            "foto" -> {
                fotoData = "data:$mime;base64,$b64"
                edit { copy(comprobanteNombre = nombre, error = null) }
            }
        }
    }

    fun guardarIdentidad() = correr {
        val doc = doc64 ?: throw FalloRed("Falta la foto del documento.", 400)
        val selfie = selfie64 ?: throw FalloRed("Falta la selfie.", 400)
        val e = _e.value
        val data = red().identidad(e.token!!, e.pais, e.documento, doc, selfie)
        edit { copy(identidad = data.optJSONObject("comprador")?.txt("identidadEstado") ?: "documentacion_cargada", ficha = red().fichaComprador(data) ?: ficha) }
    }

    fun abrirPuesto(item: Puesto) = correr {
        edit { copy(puesto = item, busca = "", productos = emptyList(), error = null) }
        val lista = red().productos(_e.value.token!!, item.id)
        edit { copy(productos = lista) }
    }

    fun cerrarPuesto() = edit { copy(puesto = null, productos = emptyList(), busca = "") }

    fun ajustar(producto: Producto, delta: Int) {
        val puesto = _e.value.puesto ?: return
        val previa = _e.value.carrito.find { it.tenantId == puesto.id && it.productoId == producto.id }
        if (previa == null) {
            if (delta > 0) aplicar(_e.value.carrito + Linea(puesto.id, puesto.nombre, producto.id, producto.nombre, 1, producto.precio, producto.unidad, producto.unidadLabel))
        } else cambiar(previa, delta)
    }

    fun cambiar(linea: Linea, delta: Int) {
        if (_e.value.ocupado) return
        aplicar(_e.value.carrito.flatMap {
            if (it.tenantId != linea.tenantId || it.productoId != linea.productoId) listOf(it)
            else {
                val n = it.cantidad + delta
                if (n > 0) listOf(it.copy(cantidad = n)) else emptyList()
            }
        })
    }

    fun quitar(linea: Linea) {
        if (_e.value.ocupado) return
        aplicar(_e.value.carrito.filter { it.tenantId != linea.tenantId || it.productoId != linea.productoId })
    }

    fun pago(valor: String) {
        if (_e.value.ocupado) return
        if (valor == "cuenta_corriente" && (_e.value.carrito.isEmpty() || !_e.value.carrito.all { tieneCuenta(it.tenantId) })) return
        edit { copy(medioPago = valor) }
        invalidar(cuerpoCheckout(_e.value.carrito, valor, _e.value.nota))
    }

    fun nota(valor: String) {
        if (_e.value.ocupado) return
        val corta = notaDePedido(valor)
        edit { copy(nota = corta) }
        invalidar(cuerpoCheckout(_e.value.carrito, _e.value.medioPago, corta))
    }

    fun actualizarPrecios() = correr {
        val token = _e.value.token!!
        val mapas = mutableMapOf<String, Producto>()
        _e.value.carrito.map { it.tenantId }.distinct().forEach { id ->
            red().productos(token, id).forEach { mapas["$id:${it.id}"] = it }
        }
        edit {
            copy(carrito = carrito.map { linea ->
                val fresco = mapas["${linea.tenantId}:${linea.productoId}"] ?: return@map linea
                linea.copy(precio = fresco.precio, unidad = fresco.unidad, unidadLabel = fresco.unidadLabel)
            })
        }
    }

    fun pagar() = correr {
        val e = _e.value
        if (e.medioPago == "transferencia" && comprobante == null) throw FalloRed("Subí el comprobante para pagar.", 400)
        val cuerpo = cuerpoCheckout(e.carrito, e.medioPago, e.nota)
        if (cuerpo.items.isEmpty()) return@correr
        val guardado = leerCheckout()
        val mismo = guardado != null && firmaCheckout(guardado.cuerpo) == firmaCheckout(cuerpo)
        val envio = if (mismo) guardado!! else CheckoutPendiente(UUID.randomUUID().toString(), cuerpo)
        if (guardado != null && !mismo) {
            edit { copy(aviso = "Se descartó el envío anterior porque cambió el pedido. Si ya había salido, está en Pedidos.") }
            runCatching { cargarPedidos() }
        }
        enviar(envio, true)
    }

    fun reintentar() = correr {
        val envio = leerCheckout() ?: return@correr
        val mismo = firmaCheckout(envio.cuerpo) == firmaCheckout(cuerpoCheckout(_e.value.carrito, _e.value.medioPago, _e.value.nota))
        enviar(envio, mismo)
    }

    fun verPedido(id: String) = correr {
        val pedido = red().pedido(_e.value.token!!, id)
        edit { copy(detalleId = id, pedidos = pedidos.map { if (it.id == id) pedido else it }) }
    }

    fun cancelar(id: String) = correr {
        red().cancelar(_e.value.token!!, id)
        cargarPedidos()
    }

    fun subirComprobante(id: String) = correr {
        val archivo = comprobante ?: throw FalloRed("Elegí el comprobante.", 400)
        red().comprobante(_e.value.token!!, id, archivo.first, archivo.second)
        comprobante = null
        edit { copy(comprobanteNombre = null, aviso = "Comprobante cargado.") }
        cargarPedidos()
    }

    fun elegirPedido(id: String, on: Boolean) = edit { copy(elegidos = if (on) elegidos + id else elegidos - id) }

    fun asignar(pedidoIds: List<String>, cargadorId: String) = correr {
        if (pedidoIds.isEmpty() || cargadorId.isBlank()) return@correr
        red().elegir(_e.value.token!!, UUID.randomUUID().toString(), cargadorId, pedidoIds)
        edit { copy(elegidos = emptySet(), aviso = "Cargador asignado.") }
        cargarPedidos()
    }

    fun calificar(ruta: String, claveMapa: String, estrellas: Int, comentario: String) = correr {
        try {
            red().calificar(_e.value.token!!, ruta, estrellas, comentario)
        } catch (error: FalloRed) {
            if (claveMapa.startsWith("r:") && error.message?.contains("ya fue calificada") == true) {
                edit { copy(calificados = calificados + (claveMapa.removePrefix("r:") to (calificados[claveMapa.removePrefix("r:")] ?: 0))) }
            }
            throw error
        }
        when {
            claveMapa.startsWith("r:") -> edit { copy(calificados = calificados + (claveMapa.removePrefix("r:") to estrellas)) }
            claveMapa.startsWith("p:") -> edit { copy(calificadosPuesto = calificadosPuesto + claveMapa.removePrefix("p:")) }
            claveMapa.startsWith("c:") -> edit { copy(calificadosComprador = calificadosComprador + claveMapa.removePrefix("c:")) }
        }
        if (_e.value.perfil == "comprador") {
            cargarPedidos()
            edit { copy(ranking = runCatching { red().ranking() }.getOrDefault(ranking)) }
        } else cargarRecorridos()
    }

    fun disponibilidad(valor: String) = correr {
        val ficha = red().disponibilidad(_e.value.token!!, valor)
        edit { copy(yoCargador = ficha) }
    }

    fun guardarPerfil(nombre: String, telefono: String) = correr {
        val foto = fotoData
        val ficha = red().perfilCargador(_e.value.token!!, nombre, telefono, foto)
        fotoData = null
        edit { copy(yoCargador = ficha, comprobanteNombre = null, aviso = "Perfil guardado.") }
    }

    fun accion(id: String, accion: String, pedidoId: String?) = correr {
        red().accion(_e.value.token!!, UUID.randomUUID().toString(), id, accion, pedidoId)
        if (_e.value.perfil == "cargador") cargarRecorridos() else cargarPedidos()
    }

    fun aceptarLegal(id: String) = correr {
        red().aceptarLegal(_e.value.token!!, id)
        val docs = red().legales(_e.value.token!!)
        edit { copy(legales = docs, legalRevisado = true) }
    }

    fun reintentarLegal() = correr {
        val docs = red().legales(_e.value.token!!)
        edit { copy(legales = docs, legalRevisado = true) }
    }

    private suspend fun entrarSesion(token: String) {
        try {
        val yo = red().yo(token)
        val perfil = yo.txt("perfil").ifBlank { _e.value.perfil }
        val comprador = red().fichaComprador(yo)
        val cargador = red().fichaCargadorDe(yo)
        edit { copy(perfil = perfil, ficha = comprador, yoCargador = cargador, identidad = comprador?.identidadEstado ?: "documentacion_cargada") }
        val docs = runCatching { red().legales(token) }.getOrElse {
            edit { copy(error = it.message) }
            emptyList()
        }
        edit { copy(legales = docs, legalRevisado = true) }
        if (perfil == "cargador") cargarRecorridos()
        else {
            val puestos = runCatching { red().puestos(token) }.getOrDefault(emptyList())
            val avisos = runCatching { red().avisos() }.getOrDefault(emptyList())
            edit { copy(puestos = puestos, avisos = avisos) }
        }
        } finally {
            edit { copy(legalRevisado = true) }
        }
    }

    private suspend fun cargarPedidos() {
        val token = _e.value.token ?: return
        val pedidos = red().pedidos(token)
        val cargadores = runCatching { red().cargadores(token) }.getOrDefault(emptyList())
        val recorridos = runCatching { red().recorridos(token) }.getOrDefault(emptyList())
        val ranking = runCatching { red().ranking() }.getOrDefault(emptyList())
        edit { copy(pedidos = pedidos, cargadores = cargadores, recorridos = recorridos, ranking = ranking) }
    }

    private suspend fun cargarRecorridos() {
        val token = _e.value.token ?: return
        val data = red().recorridos(token)
        val yo = red().yo(token)
        edit { copy(recorridos = data, yoCargador = red().fichaCargadorDe(yo) ?: yoCargador) }
    }

    private suspend fun enviar(envio: CheckoutPendiente, limpiar: Boolean) {
        if (_e.value.identidad == "pendiente" || _e.value.identidad == "rechazada") {
            throw FalloRed("Antes tenés que cargar el documento y la selfie.", 400)
        }
        guardarCheckout(envio)
        val creados = try {
            red().pedidosCrear(_e.value.token!!, envio.clave, envio.cuerpo)
        } catch (error: FalloRed) {
            if (ambiguo(error.status)) throw FalloRed("No sabemos si el pedido salió. Reintentá el mismo envío: no se duplica.", error.status)
            borrarCheckout()
            throw error
        }
        borrarCheckout()
        var aviso: String? = null
        val archivo = comprobante
        if (envio.cuerpo.medioPago == "transferencia" && archivo != null) {
            aviso = try {
                creados.forEach { red().comprobante(_e.value.token!!, it.id, archivo.first, archivo.second) }
                comprobante = null
                edit { copy(comprobanteNombre = null) }
                "El comprobante quedó cargado. Cuando caja o el puesto cobren, podés elegir el cargador."
            } catch (error: FalloRed) {
                "El pedido salió. ${error.message}"
            }
        }
        if (limpiar) edit { copy(carrito = emptyList(), nota = "") }
        edit { copy(aviso = aviso, panel = "pedidos") }
        cargarPedidos()
    }

    private fun aplicar(siguiente: List<Linea>) {
        val sigue = siguiente.isNotEmpty() && siguiente.all { tieneCuenta(it.tenantId) }
        val pago = if (_e.value.medioPago == "cuenta_corriente" && !sigue) "efectivo" else _e.value.medioPago
        edit { copy(carrito = siguiente, medioPago = pago) }
        invalidar(cuerpoCheckout(siguiente, pago, _e.value.nota))
    }

    private fun tieneCuenta(tenantId: String) = _e.value.puestos.any { it.id == tenantId && it.cuentaCorriente }

    private fun invalidar(cuerpo: CuerpoCheckout) {
        val guardado = leerCheckout() ?: return
        if (firmaCheckout(guardado.cuerpo) == firmaCheckout(cuerpo)) return
        borrarCheckout()
        edit { copy(aviso = "Se descartó el envío anterior porque cambió el pedido. Si ya había salido, está en Pedidos.") }
    }

    private fun guardarCheckout(valor: CheckoutPendiente) {
        val json = JSONObject().put("clave", valor.clave).put("cuerpo", JSONObject().put("medioPago", valor.cuerpo.medioPago).put("nota", valor.cuerpo.nota).put("items", JSONArray().apply {
            valor.cuerpo.items.forEach { put(JSONObject().put("tenantId", it.tenantId).put("productoId", it.productoId).put("cantidad", it.cantidad)) }
        }))
        prefs.edit().putString("checkout", json.toString()).apply()
        edit { copy(pendiente = valor) }
    }

    private fun borrarCheckout() {
        prefs.edit().remove("checkout").apply()
        edit { copy(pendiente = null) }
    }

    private fun leerCheckout(): CheckoutPendiente? {
        val crudo = prefs.getString("checkout", null) ?: return null
        return try {
            val o = JSONObject(crudo)
            val c = o.getJSONObject("cuerpo")
            val medio = c.txt("medioPago")
            if (medio != "efectivo" && medio != "transferencia" && medio != "cuenta_corriente") return null
            val items = c.arr("items").let { a -> (0 until a.length()).map { i -> a.getJSONObject(i) }.map { ItemCheckout(it.txt("tenantId"), it.txt("productoId"), it.ent("cantidad")) } }
            CheckoutPendiente(o.txt("clave"), CuerpoCheckout(medio, c.txt("nota"), items))
        } catch (_: Exception) {
            null
        }
    }

    private fun correr(block: suspend () -> Unit) {
        if (_e.value.ocupado) return
        edit { copy(ocupado = true, error = null) }
        viewModelScope.launch(Dispatchers.IO) {
            try {
                block()
            } catch (error: Exception) {
                edit { copy(error = error.message ?: "No se pudo completar.") }
            } finally {
                edit { copy(ocupado = false) }
            }
        }
    }
}
