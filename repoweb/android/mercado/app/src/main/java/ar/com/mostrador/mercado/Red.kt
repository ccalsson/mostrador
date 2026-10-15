package ar.com.mostrador.mercado

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.roundToLong

data class Linea(
    val tenantId: String,
    val tenantNombre: String,
    val productoId: String,
    val nombre: String,
    val cantidad: Int,
    val precio: Double,
    val unidad: String,
    val unidadLabel: String,
)

data class Producto(
    val id: String,
    val nombre: String,
    val precio: Double,
    val disponible: Double,
    val unidad: String,
    val unidadLabel: String,
)

data class Puesto(
    val id: String,
    val nombre: String,
    val bajada: String?,
    val tier: String,
    val cuentaCorriente: Boolean,
)

data class ItemPedido(val nombre: String, val cantidad: Double, val precio: Double, val unidad: String)

data class Pedido(
    val id: String,
    val tenantNombre: String,
    val estado: String,
    val total: Double,
    val bultos: Int,
    val pagoEstado: String,
    val formaPago: String?,
    val nota: String?,
    val tieneComprobante: Boolean,
    val tieneCargador: Boolean,
    val creadoEn: String?,
    val items: List<ItemPedido>,
    val hitos: Map<String, String?>,
    val tiempos: Map<String, Int?>,
)

data class ItemParada(val nombre: String, val cantidad: Double, val unidad: String)
data class Parada(
    val pedidoId: String,
    val puesto: String,
    val estado: String,
    val bultos: Int,
    val preparado: Boolean,
    val items: List<ItemParada>,
)

data class Recorrido(
    val id: String,
    val estado: String,
    val bultos: Int,
    val cargador: String,
    val comprador: String,
    val telefono: String?,
    val creadoEn: String?,
    val paradas: List<Parada>,
)

data class Cargador(
    val id: String,
    val nombre: String,
    val nivel: String,
    val calificacion: Double?,
    val recorridosCompletados: Int,
)

data class FichaCargador(
    val nombre: String,
    val telefono: String?,
    val disponibilidad: String,
    val puntos: Int,
    val nivel: String,
    val score: Double,
    val recorridosCompletados: Int,
    val cancelaciones: Int,
    val entregasATiempo: Int,
    val entregasDemoradas: Int,
    val calificacion: Double?,
    val calificaciones: Int,
)

data class FichaComprador(
    val nombre: String,
    val telefono: String?,
    val pais: String?,
    val tipoDocumento: String?,
    val numeroDocumento: String?,
    val identidadEstado: String,
)

data class Aviso(
    val id: String,
    val tenantNombre: String,
    val titulo: String,
    val detalle: String,
    val precio: Double?,
    val unidadLabel: String?,
    val endsOn: String,
)

data class Rank(val puesto: Int, val nombre: String, val nivel: String, val puntos: Int, val score: Double)
data class DocLegal(val id: String, val title: String, val version: String, val body: String)
data class ItemCheckout(val tenantId: String, val productoId: String, val cantidad: Int)
data class CuerpoCheckout(val medioPago: String, val nota: String, val items: List<ItemCheckout>)
data class CheckoutPendiente(val clave: String, val cuerpo: CuerpoCheckout)

class FalloRed(message: String, val status: Int?) : Exception(message)

fun plata(valor: Double): String {
    val n = valor.roundToLong()
    return "$" + String.format(Locale("es", "AR"), "%,d", n)
}

fun habilitaCargador(forma: String?, pago: String?) =
    (forma == "efectivo" || forma == "transferencia" || forma == "cuenta_corriente") && pago == "habilitado"

fun etiqueta(estado: String) = mapOf(
    "confirmado" to "Confirmado",
    "en_preparacion" to "En preparación",
    "preparado" to "Preparado",
    "retirado" to "Retirado",
    "entregado" to "Entregado",
    "cancelado" to "Cancelado",
    "asignado" to "Asignado",
    "aceptado" to "Aceptado",
)[estado] ?: estado

fun pagoLegible(forma: String?) = when (forma) {
    "transferencia" -> "Transferencia"
    "cuenta_corriente" -> "Cuenta corriente"
    "efectivo" -> "Contado"
    else -> null
}

fun motivoCargador(pedido: Pedido): String? {
    if (habilitaCargador(pedido.formaPago, pedido.pagoEstado)) return null
    if (pedido.formaPago == "efectivo") return "El retiro queda inhabilitado hasta que pagues en caja."
    if (pedido.formaPago == "cuenta_corriente") return "La cuenta corriente todavía no habilita el cargador."
    if (!pedido.tieneComprobante) return "Falta el comprobante. Cargalo al pagar."
    return "Caja o el puesto todavía no cobraron. Ahí se habilita el cargador."
}

fun notaDePedido(valor: String) = valor.take(500)

fun cuerpoCheckout(lineas: List<Linea>, medio: String, nota: String) = CuerpoCheckout(
    medio,
    notaDePedido(nota),
    lineas.filter { it.cantidad > 0 }.map { ItemCheckout(it.tenantId, it.productoId, it.cantidad) },
)

fun firmaCheckout(cuerpo: CuerpoCheckout): String {
    val items = cuerpo.items.sortedWith(compareBy({ it.tenantId }, { it.productoId }))
    return JSONObject()
        .put("medioPago", cuerpo.medioPago)
        .put("nota", cuerpo.nota)
        .put("items", JSONArray().apply { items.forEach { put(JSONObject().put("tenantId", it.tenantId).put("productoId", it.productoId).put("cantidad", it.cantidad)) } })
        .toString()
}

fun ambiguo(status: Int?) = status == null || status == 408 || status == 429 || status >= 500

internal fun JSONObject.txt(k: String) = if (isNull(k)) "" else optString(k, "")
private fun JSONObject.txtOrNull(k: String) = if (isNull(k) || !has(k) || optString(k, "").isEmpty()) null else optString(k)
private fun JSONObject.num(k: String): Double = when (val v = opt(k)) {
    is Number -> v.toDouble()
    is String -> v.toDoubleOrNull() ?: 0.0
    else -> 0.0
}
internal fun JSONObject.ent(k: String) = num(k).toInt()
internal fun JSONObject.arr(k: String) = optJSONArray(k) ?: JSONArray()

private fun pedidoDe(o: JSONObject): Pedido {
    val hitos = o.optJSONObject("hitos")
    val tiempos = o.optJSONObject("tiempos")
    return Pedido(
        id = o.txt("id"),
        tenantNombre = o.txt("tenantNombre"),
        estado = o.txt("estado"),
        total = o.num("total"),
        bultos = o.ent("bultos"),
        pagoEstado = o.txt("pagoEstado").ifBlank { "pendiente" },
        formaPago = o.txtOrNull("formaPago"),
        nota = o.txtOrNull("nota"),
        tieneComprobante = o.optBoolean("tieneComprobante"),
        tieneCargador = o.optBoolean("tieneCargador"),
        creadoEn = o.txtOrNull("creadoEn"),
        items = o.arr("items").let { a -> (0 until a.length()).map { i -> a.getJSONObject(i) }.map { ItemPedido(it.txt("nombre"), it.num("cantidad"), it.num("precio"), it.txt("unidad")) } },
        hitos = listOf("confirmado", "preparacion", "preparado", "retirado", "entregado").associateWith { hitos?.txtOrNull(it) },
        tiempos = listOf("preparacion", "espera", "entrega", "total").associateWith { key ->
            if (tiempos == null || tiempos.isNull(key)) null else tiempos.num(key).toInt()
        },
    )
}

private fun fichaCargador(o: JSONObject) = FichaCargador(
    nombre = o.txt("nombre"),
    telefono = o.txtOrNull("telefono"),
    disponibilidad = o.txt("disponibilidad"),
    puntos = o.ent("puntos"),
    nivel = o.txt("nivel"),
    score = o.num("score"),
    recorridosCompletados = o.ent("recorridosCompletados"),
    cancelaciones = o.ent("cancelaciones"),
    entregasATiempo = o.ent("entregasATiempo"),
    entregasDemoradas = o.ent("entregasDemoradas"),
    calificacion = if (o.isNull("calificacion")) null else o.num("calificacion"),
    calificaciones = o.ent("calificaciones"),
)

class Red(base: String) {
    private val raiz = base.trim().trimEnd('/')
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(40, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    private fun pedir(ruta: String, method: String, token: String?, body: JSONObject?, clave: String?, central: Boolean): JSONObject {
        val url = if (central) "$raiz/api/central/v1/$ruta" else "$raiz/api/mercado/v1/$ruta"
        val builder = Request.Builder().url(url).header("accept", "application/json")
        if (token != null) builder.header("authorization", "Bearer $token")
        if (clave != null) builder.header("idempotency-key", clave)
        if (method == "GET") builder.get() else builder.method(method, (body ?: JSONObject()).toString().toRequestBody(json))
        val res = try {
            http.newCall(builder.build()).execute()
        } catch (_: Exception) {
            throw FalloRed("No hubo respuesta del servidor.", null)
        }
        res.use {
            val texto = it.body?.string().orEmpty()
            val data = try {
                if (texto.isBlank()) JSONObject() else JSONObject(texto)
            } catch (_: Exception) {
                JSONObject()
            }
            if (!it.isSuccessful) {
                val msg = if (central) data.optJSONObject("error")?.optString("message").orEmpty() else data.optString("message")
                throw FalloRed(msg.ifBlank { "No se pudo completar." }, it.code)
            }
            return data
        }
    }

    fun ingresar(email: String, password: String, perfil: String) = pedir("auth/ingreso", "POST", null, JSONObject().put("email", email).put("password", password).put("perfil", perfil), null, false)
    fun registrarComprador(nombre: String, email: String, password: String, telefono: String, pais: String, documento: String, captcha: String) =
        pedir("auth/registro", "POST", null, JSONObject().put("nombre", nombre).put("email", email).put("password", password).put("telefono", telefono).put("pais", pais).put("tipoDocumento", if (pais == "PY") "CI_PY" else "DNI").put("numeroDocumento", documento).put("captcha", captcha), null, false)
    fun registrarCargador(nombre: String, email: String, password: String, telefono: String, captcha: String) =
        pedir("auth/registro-cargador", "POST", null, JSONObject().put("nombre", nombre).put("email", email).put("password", password).put("telefono", telefono).put("captcha", captcha), null, false)
    fun salir(token: String) = pedir("auth/salir", "POST", token, JSONObject(), null, false)
    fun yo(token: String) = pedir("yo", "GET", token, null, null, false)
    fun identidad(token: String, pais: String, documento: String, doc: String, selfie: String) =
        pedir("identidad", "POST", token, JSONObject().put("pais", pais).put("tipoDocumento", if (pais == "PY") "CI_PY" else "DNI").put("numeroDocumento", documento).put("documentoBase64", doc).put("selfieBase64", selfie), null, false)
    fun puestos(token: String) = pedir("puestos", "GET", token, null, null, false).arr("puestos").objects().map {
        Puesto(it.txt("id"), it.txt("nombre"), it.txtOrNull("bajada"), it.txt("tier"), it.optBoolean("cuentaCorriente"))
    }
    fun productos(token: String, tenantId: String) = pedir("puestos/${java.net.URLEncoder.encode(tenantId, "UTF-8")}/productos", "GET", token, null, null, false).arr("productos").objects().map {
        Producto(it.txt("id"), it.txt("nombre"), it.num("precio"), it.num("disponible"), it.txt("unidad"), it.txt("unidadLabel"))
    }
    fun pedidosCrear(token: String, clave: String, cuerpo: CuerpoCheckout): List<Pedido> {
        val body = JSONObject().put("medioPago", cuerpo.medioPago).put("nota", cuerpo.nota).put("items", JSONArray().apply {
            cuerpo.items.forEach { put(JSONObject().put("tenantId", it.tenantId).put("productoId", it.productoId).put("cantidad", it.cantidad)) }
        })
        return pedir("pedidos", "POST", token, body, clave, false).arr("pedidos").objects().map { pedidoDe(it) }
    }
    fun pedidos(token: String) = pedir("pedidos", "GET", token, null, null, false).arr("pedidos").objects().map { pedidoDe(it) }
    fun pedido(token: String, id: String) = pedidoDe(pedir("pedidos/${java.net.URLEncoder.encode(id, "UTF-8")}", "GET", token, null, null, false).getJSONObject("pedido"))
    fun cancelar(token: String, id: String) = pedir("pedidos/${java.net.URLEncoder.encode(id, "UTF-8")}/cancelar", "POST", token, JSONObject(), null, false)
    fun comprobante(token: String, id: String, nombre: String, data: String) =
        pedir("pedidos/${java.net.URLEncoder.encode(id, "UTF-8")}/comprobante", "POST", token, JSONObject().put("nombre", nombre).put("data", data), null, false)
    fun cargadores(token: String) = pedir("cargadores", "GET", token, null, null, false).arr("cargadores").objects().map {
        Cargador(it.txt("id"), it.txt("nombre"), it.txt("nivel"), if (it.isNull("calificacion")) null else it.num("calificacion"), it.ent("recorridosCompletados"))
    }
    fun elegir(token: String, clave: String, cargadorId: String, pedidos: List<String>) =
        pedir("recorridos", "POST", token, JSONObject().put("cargadorId", cargadorId).put("pedidoIds", JSONArray(pedidos)), clave, false)
    fun recorridos(token: String) = pedir("recorridos", "GET", token, null, null, false).arr("recorridos").objects().map { o ->
        Recorrido(
            o.txt("id"), o.txt("estado"), o.ent("bultos"), o.txt("cargador"), o.txt("comprador"), o.txtOrNull("telefono"), o.txtOrNull("creadoEn"),
            o.arr("paradas").objects().map { p ->
                Parada(p.txt("pedidoId"), p.txt("puesto"), p.txt("estado"), p.ent("bultos"), p.optBoolean("preparado"), p.arr("items").objects().map { ItemParada(it.txt("nombre"), it.num("cantidad"), it.txt("unidad")) })
            },
        )
    }
    fun accion(token: String, clave: String, id: String, accion: String, pedidoId: String?) =
        pedir("recorridos/${java.net.URLEncoder.encode(id, "UTF-8")}/$accion", "POST", token, JSONObject().apply { if (pedidoId != null) put("pedidoId", pedidoId) }, clave, false)
    fun calificar(token: String, ruta: String, estrellas: Int, comentario: String) =
        pedir(ruta, "POST", token, JSONObject().put("estrellas", estrellas).put("comentario", comentario), null, false)
    fun perfilCargador(token: String, nombre: String, telefono: String, foto: String?) =
        fichaCargador(pedir("cargador/perfil", "POST", token, JSONObject().put("nombre", nombre).put("telefono", telefono).put("foto", foto ?: JSONObject.NULL), null, false))
    fun disponibilidad(token: String, valor: String) =
        fichaCargador(pedir("cargador/disponibilidad", "POST", token, JSONObject().put("disponibilidad", valor), null, false))
    fun avisos() = pedir("avisos", "GET", null, null, null, false).arr("avisos").objects().map {
        Aviso(it.txt("id"), it.txt("tenantNombre"), it.txt("titulo"), it.txt("detalle"), if (it.isNull("precio")) null else it.num("precio"), it.txtOrNull("unidadLabel"), it.txt("endsOn"))
    }
    fun ranking() = pedir("ranking", "GET", null, null, null, false).arr("ranking").objects().map {
        Rank(it.ent("puesto"), it.txt("nombre"), it.txt("nivel"), it.ent("puntos"), it.num("score"))
    }
    fun legales(token: String) = pedir("contracts/pending", "GET", token, null, null, true).arr("pending").objects().map {
        DocLegal(it.txt("id"), it.txt("title"), it.txt("version"), it.txt("body"))
    }
    fun aceptarLegal(token: String, id: String) = pedir("contracts/${java.net.URLEncoder.encode(id, "UTF-8")}/accept", "POST", token, null, null, true)

    fun fichaComprador(o: JSONObject) = o.optJSONObject("comprador")?.let {
        FichaComprador(it.txt("nombre"), it.txtOrNull("telefono"), it.txtOrNull("pais"), it.txtOrNull("tipoDocumento"), it.txtOrNull("numeroDocumento"), it.txt("identidadEstado").ifBlank { "pendiente" })
    }
    fun fichaCargadorDe(o: JSONObject) = o.optJSONObject("cargador")?.let { fichaCargador(it) }
}

private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
