package ar.com.mostrador.torre

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class PedidoTorre(
    val id: String,
    val tenant: String,
    val product: String,
    val amount: Double,
    val currency: String,
    val medio: String,
    val notes: String,
    val tieneComprobante: Boolean,
)

data class AlertaTorre(val id: String, val texto: String)

data class Pendientes(val pedidos: List<PedidoTorre>, val alertas: List<AlertaTorre>)

class FalloRed(message: String, val status: Int?) : Exception(message)

class Red(base: String) {
    private val raiz = base.trim().trimEnd('/')
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    private fun pedir(ruta: String, method: String, token: String?, body: JSONObject?): JSONObject {
        val builder = Request.Builder().url("$raiz/api/torre/v1/$ruta").header("accept", "application/json")
        if (token != null) builder.header("authorization", "Bearer $token")
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
            if (!it.isSuccessful) throw FalloRed(data.optString("message").ifBlank { "No se pudo completar." }, it.code)
            return data
        }
    }

    fun ingresar(email: String, password: String): JSONObject =
        pedir("auth/ingreso", "POST", null, JSONObject().put("email", email).put("password", password))

    fun pendientes(token: String): Pendientes {
        val data = pedir("pendientes", "GET", token, null)
        val pedidos = data.optJSONArray("pedidos")
        val alertas = data.optJSONArray("alertas")
        return Pendientes(
            pedidos = (0 until (pedidos?.length() ?: 0)).map { i ->
                val row = pedidos!!.getJSONObject(i)
                PedidoTorre(
                    id = row.optString("id"),
                    tenant = row.optString("tenant"),
                    product = row.optString("product"),
                    amount = when (val v = row.opt("amount")) {
                        is Number -> v.toDouble()
                        else -> 0.0
                    },
                    currency = row.optString("currency"),
                    medio = row.optString("medio"),
                    notes = row.optString("notes"),
                    tieneComprobante = row.optBoolean("tieneComprobante"),
                )
            },
            alertas = (0 until (alertas?.length() ?: 0)).map { i ->
                val row = alertas!!.getJSONObject(i)
                AlertaTorre(row.optString("id"), row.optString("texto"))
            },
        )
    }

    fun habilitar(token: String, id: String) {
        pedir("pedidos/${java.net.URLEncoder.encode(id, "UTF-8")}/habilitar", "POST", token, JSONObject())
    }
}
