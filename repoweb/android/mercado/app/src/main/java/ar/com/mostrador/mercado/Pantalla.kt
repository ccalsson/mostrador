package ar.com.mostrador.mercado

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private val Paper = Color(0xFFF3EDE1)
private val SurfaceC = Color(0xFFFFFAF2)
private val Ink = Color(0xFF1A1612)
private val Leaf = Color(0xFF1B5E3B)
private val Terra = Color(0xFFB5471A)
private val Muted = Color(0xFF6D6559)
private val Line = Color(0xFFD6CCBB)
private val OnLeaf = Color(0xFFF4EFE4)
private val Forma = RoundedCornerShape(8.dp)

@Composable
fun MercadoTema(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = Leaf, background = Paper, surface = SurfaceC, onPrimary = OnLeaf, onBackground = Ink, error = Terra)) {
        Surface(color = Paper, contentColor = Ink, modifier = Modifier.fillMaxSize()) { content() }
    }
}

@Composable
fun Pantalla(vm: MercadoVm) {
    val e by vm.estado.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(Paper).padding(16.dp)) {
        when {
            e.token == null -> Ingreso(e, vm)
            !e.legalRevisado -> Text("Cargando…", color = Muted)
            e.legales.isNotEmpty() -> Legales(e, vm)
            e.perfil == "cargador" -> Cargador(e, vm)
            e.identidad == "pendiente" || e.identidad == "rechazada" -> Identidad(e, vm)
            else -> Comprador(e, vm)
        }
    }
}

@Composable
private fun Ingreso(e: Estado, vm: MercadoVm) {
    val ctx = LocalContext.current
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Mercado al Toque", fontFamily = FontFamily.Serif, fontSize = 32.sp, fontWeight = FontWeight.SemiBold)
        Text("Comprá en los puestos o entrá como cargador.", color = Muted)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Boton("Comprador", e.como == "comprador", Modifier.weight(1f)) { vm.como("comprador") }
            Boton("Cargador", e.como == "cargador", Modifier.weight(1f)) { vm.como("cargador") }
        }
        if (e.alta) Campo("Nombre", e.nombre, vm::nombre)
        Campo("Email", e.email, vm::email, KeyboardType.Email)
        Campo("Clave", e.password, vm::password, oculto = true)
        if (e.alta) Campo("Teléfono", e.telefono, vm::telefono, KeyboardType.Phone)
        if (e.alta && e.como == "comprador") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Boton("Argentina", e.pais == "AR", Modifier.weight(1f)) { vm.pais("AR") }
                Boton("Paraguay", e.pais == "PY", Modifier.weight(1f)) { vm.pais("PY") }
            }
            Campo(if (e.pais == "PY") "Cédula" else "DNI", e.documento, vm::documento)
        }
        if (e.alta) CaptchaAlta(vm)
        if (!e.aviso.isNullOrBlank()) Text(e.aviso, color = Leaf)
        Error(e.error)
        Boton(if (e.alta) "Crear cuenta" else "Entrar", true, Modifier.fillMaxWidth(), e.ocupado) { vm.ingresar() }
        Boton("Continuar con Google", false, Modifier.fillMaxWidth(), !e.ocupado) {
            CustomTabsIntent.Builder().build().launchUrl(ctx, Uri.parse(vm.urlGoogle()))
        }
        TextButton(onClick = { vm.alta(!e.alta) }) { Text(if (e.alta) "Ya tengo cuenta" else "Crear cuenta", color = Leaf) }
    }
}

@Composable
private fun CaptchaAlta(vm: MercadoVm) {
    val clave = stringResource(R.string.turnstile_site_key)
    if (clave.isBlank()) return
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun onToken(token: String) {
                            vm.captcha(token)
                        }
                    },
                    "AndroidCaptcha",
                )
                webViewClient = WebViewClient()
                loadDataWithBaseURL(
                    "https://mostrador.grok.me",
                    """
                    <!doctype html><html><head><meta name="viewport" content="width=device-width"></head>
                    <body style="margin:0">
                    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
                    <div class="cf-turnstile" data-sitekey="$clave" data-callback="listo"></div>
                    <script>function listo(t){AndroidCaptcha.onToken(t)}</script>
                    </body></html>
                    """.trimIndent(),
                    "text/html",
                    "utf-8",
                    null,
                )
            }
        },
        modifier = Modifier.fillMaxWidth().height(78.dp),
    )
}

@Composable
private fun Legales(e: Estado, vm: MercadoVm) {
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Cabecera("Documentos", vm)
        Text("Leé el documento y aceptalo para seguir.", color = Muted)
        Error(e.error)
        e.legales.forEach { doc ->
            Column(Modifier.fillMaxWidth().border(1.dp, Line, Forma).background(SurfaceC, Forma).padding(12.dp)) {
                Text(doc.title, fontWeight = FontWeight.Medium)
                Text("Versión ${doc.version}", color = Muted, fontSize = 12.sp)
                if (doc.body.isBlank()) Text("El servidor no envió el texto. No se puede aceptar.", color = Terra)
                else Text(doc.body, modifier = Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState()))
                Boton(if (e.ocupado) "Aceptando…" else "Aceptar", true, Modifier.fillMaxWidth(), e.ocupado || doc.body.isBlank()) { vm.aceptarLegal(doc.id) }
            }
        }
    }
}

@Composable
private fun Identidad(e: Estado, vm: MercadoVm) {
    val ctx = LocalContext.current
    val doc = launcher(ctx) { n, b, m -> vm.archivo("doc", n, b, m) }
    val selfie = launcher(ctx) { n, b, m -> vm.archivo("selfie", n, b, m) }
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Cabecera("Documentación", vm)
        Text("Cargá el documento y una selfie. Eso no los marca como verificados.", color = Muted)
        Campo(if (e.pais == "PY") "Cédula" else "DNI", e.documento, vm::documento)
        Boton("Foto del documento", false, Modifier.fillMaxWidth()) { doc.launch("image/*") }
        Boton("Selfie", false, Modifier.fillMaxWidth()) { selfie.launch("image/*") }
        Error(e.error)
        Boton("Guardar", true, Modifier.fillMaxWidth(), e.ocupado) { vm.guardarIdentidad() }
    }
}

@Composable
private fun Cargador(e: Estado, vm: MercadoVm) {
    val ctx = LocalContext.current
    val foto = launcher(ctx) { n, b, m -> vm.archivo("foto", n, b, m) }
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Cabecera("Cargador", vm) { vm.refrescar() }
        Error(e.error)
        e.yoCargador?.let { f ->
            Column(Modifier.fillMaxWidth().border(1.dp, Line, Forma).background(SurfaceC, Forma).padding(12.dp)) {
                Text(f.nombre, fontWeight = FontWeight.Medium)
                Text("${f.telefono ?: "Sin teléfono"} · ${f.nivel}", color = Muted)
                Text(if (f.calificacion == null) "Sin calificaciones" else "${f.calificacion} de 5 · ${f.calificaciones} calificaciones")
                Text("${f.recorridosCompletados} recorridos hechos · ${f.puntos} pts · score ${f.score}", color = Muted)
                Text("A tiempo ${f.entregasATiempo} · demoradas ${f.entregasDemoradas} · cancelaciones ${f.cancelaciones}", color = Muted)
                Text(if (f.disponibilidad == "disponible") "Estás disponible." else "No estás disponible.")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Boton("Disponible", true, Modifier.weight(1f), e.ocupado) { vm.disponibilidad("disponible") }
            Boton("No disponible", false, Modifier.weight(1f), e.ocupado) { vm.disponibilidad("no_disponible") }
        }
        Text("Editar perfil", fontWeight = FontWeight.Medium)
        Campo("Nombre", e.nombre.ifBlank { e.yoCargador?.nombre ?: "" }, vm::nombre)
        Campo("Teléfono", e.telefono.ifBlank { e.yoCargador?.telefono ?: "" }, vm::telefono)
        Text("Foto, si querés. No es obligatoria.", color = Muted, fontSize = 12.sp)
        Boton(e.comprobanteNombre ?: "Elegir foto", false, Modifier.fillMaxWidth()) { foto.launch("image/*") }
        Boton("Guardar perfil", true, Modifier.fillMaxWidth(), e.ocupado) { vm.guardarPerfil(e.nombre.ifBlank { e.yoCargador?.nombre ?: "" }, e.telefono.ifBlank { e.yoCargador?.telefono ?: "" }) }
        Text("Los trabajos te los asigna el comprador. Aceptá el que te toca: otro cargador no puede tomarlo al mismo tiempo.", color = Muted)
        Recorridos(e, vm, cargador = true)
    }
}

@Composable
private fun Comprador(e: Estado, vm: MercadoVm) {
    Column(Modifier.fillMaxSize()) {
        Cabecera("Mercado al Toque", vm)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(bottom = 8.dp)) {
            listOf("puestos" to "Puestos", "carrito" to "Carrito", "pedidos" to "Pedidos", "perfil" to "Perfil").forEach { (id, label) ->
                Boton(label, e.panel == id, Modifier.weight(1f)) { vm.panel(id) }
            }
        }
        Error(e.error)
        e.aviso?.let { Text(it, color = Muted, fontSize = 13.sp) }
        Box(Modifier.weight(1f)) {
            when (e.panel) {
                "carrito" -> Carrito(e, vm)
                "pedidos" -> Pedidos(e, vm)
                "perfil" -> Perfil(e)
                else -> Puestos(e, vm)
            }
        }
    }
}

@Composable
private fun Puestos(e: Estado, vm: MercadoVm) {
    val ctx = LocalContext.current
    val comp = launcher(ctx) { n, b, m -> vm.archivo("comprobante", n, b, m) }
    val puesto = e.puesto
    if (puesto == null) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (e.puestos.isEmpty()) Text("Ningún puesto está publicado en Mercado al Toque.", color = Muted)
            e.avisos.forEach { aviso ->
                Column(Modifier.fillMaxWidth().border(1.dp, Line, Forma).background(SurfaceC, Forma).padding(12.dp)) {
                    Text(aviso.titulo.uppercase(), color = Muted, fontSize = 11.sp)
                    Text(aviso.tenantNombre, fontWeight = FontWeight.Medium)
                    Text(aviso.detalle)
                    if (aviso.precio != null) Text(plata(aviso.precio) + (aviso.unidadLabel?.let { " / $it" } ?: ""))
                    Text("Hasta ${aviso.endsOn}", color = Muted, fontSize = 12.sp)
                }
            }
            e.puestos.forEach { item ->
                Column(Modifier.fillMaxWidth().border(1.dp, Line, Forma).background(SurfaceC, Forma).clickable { vm.abrirPuesto(item) }.padding(12.dp)) {
                    Text(item.nombre, fontWeight = FontWeight.Medium)
                    if (!item.bajada.isNullOrBlank()) Text(item.bajada, color = Muted)
                }
            }
        }
        return
    }
    val filtro = e.productos.filter { it.nombre.contains(e.busca.trim(), ignoreCase = true) }
    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = vm::cerrarPuesto) { Text("Puestos", color = Leaf) }
        Text(puesto.nombre, fontFamily = FontFamily.Serif, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Campo("Buscar banana, papa, lechuga…", e.busca, vm::busca)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            if (filtro.isEmpty()) Text("Ningún producto con ese nombre.", color = Muted, modifier = Modifier.padding(8.dp))
            filtro.forEach { producto ->
                val n = e.carrito.find { it.tenantId == puesto.id && it.productoId == producto.id }?.cantidad ?: 0
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).clickable { vm.ajustar(producto, 1) }) {
                        Text(producto.nombre, fontWeight = FontWeight.Medium, maxLines = 1)
                        Text("${plata(producto.precio)} / ${producto.unidadLabel}   ${producto.disponible} ${producto.unidadLabel}", color = Muted, fontSize = 13.sp)
                    }
                    TextButton(onClick = { vm.ajustar(producto, -1) }, enabled = n > 0 && !e.ocupado) { Text("–") }
                    Text(if (n == 0) "" else n.toString(), modifier = Modifier.padding(horizontal = 4.dp))
                    TextButton(onClick = { vm.ajustar(producto, 1) }, enabled = !e.ocupado) { Text("+") }
                }
            }
        }
        HojaPago(e, vm) { comp.launch("*/*") }
    }
}

@Composable
private fun HojaPago(e: Estado, vm: MercadoVm, elegirArchivo: () -> Unit) {
    val total = e.carrito.sumOf { it.precio * it.cantidad }
    Column(Modifier.fillMaxWidth().heightIn(max = 280.dp).background(SurfaceC).padding(top = 8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Pedido", fontFamily = FontFamily.Serif, fontSize = 18.sp)
            Text(plata(total), fontFamily = FontFamily.Serif, fontSize = 22.sp)
        }
        if (e.carrito.isEmpty()) Text("Tocá un producto. El puesto confirma el importe.", color = Muted)
        else Column(Modifier.heightIn(max = 96.dp).verticalScroll(rememberScrollState())) {
            e.carrito.forEach { linea ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(linea.nombre, maxLines = 1, fontWeight = FontWeight.Medium)
                        Text("${linea.cantidad} ${linea.unidadLabel.ifBlank { linea.unidad }}" + if (linea.tenantNombre != e.puesto?.nombre) " · ${linea.tenantNombre}" else "", color = Muted, fontSize = 12.sp)
                    }
                    TextButton(onClick = { vm.quitar(linea) }) { Text("Sacar", color = Muted) }
                }
            }
        }
        Pagos(e, vm, elegirArchivo)
    }
}

@Composable
private fun Pagos(e: Estado, vm: MercadoVm, elegirArchivo: () -> Unit) {
    val cuenta = e.carrito.isNotEmpty() && e.carrito.all { linea -> e.puestos.any { it.id == linea.tenantId && it.cuentaCorriente } }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 6.dp)) {
        Boton("Contado", e.medioPago == "efectivo", Modifier.weight(1f), e.ocupado) { vm.pago("efectivo") }
        Boton("Transferencia", e.medioPago == "transferencia", Modifier.weight(1f), e.ocupado) { vm.pago("transferencia") }
        Boton("Cuenta", e.medioPago == "cuenta_corriente", Modifier.weight(1f), e.ocupado || !cuenta) { vm.pago("cuenta_corriente") }
    }
    Campo("Nota para el puesto", e.nota, vm::nota)
    if (e.medioPago == "transferencia") {
        Text("Comprobante", color = Muted, fontSize = 12.sp)
        Boton(e.comprobanteNombre ?: "Elegir archivo", false, Modifier.fillMaxWidth(), e.ocupado, elegirArchivo)
    } else {
        Text(if (e.medioPago == "efectivo") "El retiro queda cerrado hasta que pagues en caja." else "La cuenta ya habilita el cargador. Elegilo en Pedidos.", color = Muted, fontSize = 12.sp)
    }
    val pendiente = e.pendiente
    val reintento = pendiente != null && firmaCheckout(pendiente.cuerpo) == firmaCheckout(cuerpoCheckout(e.carrito, e.medioPago, e.nota))
    Boton(if (e.ocupado) "Enviando…" else if (reintento) "Reintentar el mismo pago" else "Pagar", true, Modifier.fillMaxWidth(), e.ocupado || e.carrito.isEmpty()) { vm.pagar() }
}

@Composable
private fun Carrito(e: Estado, vm: MercadoVm) {
    val ctx = LocalContext.current
    val comp = launcher(ctx) { n, b, m -> vm.archivo("comprobante", n, b, m) }
    val bultos = e.carrito.filter { it.unidad == "bulto" }.sumOf { it.cantidad }
    val puestos = e.carrito.groupBy { it.tenantNombre }
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("$bultos bultos en ${puestos.size} puestos. Los kilos no se cuentan.")
        if (e.carrito.isEmpty()) Text("El carrito está vacío.", color = Muted)
        val pendiente = e.pendiente
        val mismo = pendiente != null && firmaCheckout(pendiente.cuerpo) == firmaCheckout(cuerpoCheckout(e.carrito, e.medioPago, e.nota))
        if (pendiente != null && !mismo) {
            Text("Quedó un envío sin respuesta (${pendiente.cuerpo.items.size} productos, ${pagoLegible(pendiente.cuerpo.medioPago) ?: ""}).")
            Boton("Reintentar el mismo envío", true, Modifier.fillMaxWidth(), e.ocupado) { vm.reintentar() }
        }
        puestos.forEach { (nombre, lineas) ->
            Text(nombre, fontWeight = FontWeight.Medium)
            lineas.forEach { linea ->
                Text(linea.nombre)
                Text("${linea.cantidad} ${linea.unidadLabel.ifBlank { linea.unidad }} · ${plata(linea.precio)} c/u", color = Muted)
                Row {
                    TextButton(onClick = { vm.cambiar(linea, -1) }, enabled = !e.ocupado) { Text("–") }
                    Text(linea.cantidad.toString(), modifier = Modifier.align(Alignment.CenterVertically))
                    TextButton(onClick = { vm.cambiar(linea, 1) }, enabled = !e.ocupado) { Text("+") }
                    TextButton(onClick = { vm.quitar(linea) }, enabled = !e.ocupado) { Text("Quitar") }
                }
            }
        }
        if (e.carrito.isNotEmpty()) Boton("Actualizar precios", false, Modifier.fillMaxWidth(), e.ocupado) { vm.actualizarPrecios() }
        Text("El importe y el stock los confirma el puesto al crear el pedido. Cada puesto genera el suyo.", color = Muted, fontSize = 12.sp)
        Pagos(e, vm) { comp.launch("*/*") }
    }
}

@Composable
private fun Pedidos(e: Estado, vm: MercadoVm) {
    val ctx = LocalContext.current
    val comp = launcher(ctx) { n, b, m -> vm.archivo("comprobante", n, b, m) }
    val bultos = e.pedidos.filter { it.id in e.elegidos }.sumOf { it.bultos }
    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(if (e.elegidos.isEmpty()) "Cuando el pago está habilitado, elegí el pedido y un cargador de la lista." else "$bultos bultos en los pedidos elegidos.", modifier = Modifier.weight(1f), fontSize = 13.sp)
            TextButton(onClick = { vm.panel("pedidos") }, enabled = !e.ocupado) { Text("Actualizar") }
        }
        e.pedidos.forEach { pedido ->
            val visto = pedido
            val puede = visto.estado != "cancelado" && visto.estado != "entregado" && habilitaCargador(visto.formaPago, visto.pagoEstado)
            Column(Modifier.fillMaxWidth().border(1.dp, Line, Forma).padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = visto.id in e.elegidos, onCheckedChange = { vm.elegirPedido(visto.id, it) }, enabled = puede)
                    Column {
                        Text(visto.tenantNombre, fontWeight = FontWeight.Medium)
                        Text("${visto.bultos} bultos · ${etiqueta(visto.estado)} · ${plata(visto.total)}" + (pagoLegible(visto.formaPago)?.let { " · $it" } ?: "") + " · pago ${visto.pagoEstado}", color = Muted, fontSize = 13.sp)
                        motivoCargador(visto)?.let { Text(it, color = Muted, fontSize = 12.sp) }
                    }
                }
                Pasos(visto)
                TextButton(onClick = { vm.verPedido(visto.id) }) { Text(if (e.detalleId == visto.id) "Actualizar detalle" else "Ver detalle") }
                if (e.detalleId == visto.id) Detalle(visto)
                if (visto.estado == "confirmado") Boton("Cancelar", false, enabled = !e.ocupado) { vm.cancelar(visto.id) }
                if (visto.tieneCargador) Text("Cargador asignado.")
                else if (habilitaCargador(visto.formaPago, visto.pagoEstado)) {
                    Text("Asignar cargador", fontSize = 13.sp)
                    if (e.cargadores.isEmpty()) Text("No hay cargadores disponibles", color = Muted)
                    e.cargadores.forEach { c ->
                        Boton("${c.nombre} · ${c.nivel}", false, Modifier.fillMaxWidth(), e.ocupado) { vm.asignar(listOf(visto.id), c.id) }
                    }
                }
                if (visto.formaPago == "transferencia" && !visto.tieneComprobante) {
                    Boton("Cargar comprobante", false, Modifier.fillMaxWidth()) { comp.launch("*/*") }
                    if (e.comprobanteNombre != null) Boton("Enviar ${e.comprobanteNombre}", true, Modifier.fillMaxWidth(), e.ocupado) { vm.subirComprobante(visto.id) }
                }
                if (visto.tieneComprobante) Text("Comprobante cargado.", color = Muted, fontSize = 12.sp)
            }
        }
        e.cargadores.forEach { c ->
            Boton("Elegir a ${c.nombre} · ${c.nivel}" + (c.calificacion?.let { " · $it" } ?: "") + " · ${c.recorridosCompletados} recorridos", false, Modifier.fillMaxWidth(), e.ocupado || e.elegidos.isEmpty()) {
                vm.asignar(e.elegidos.toList(), c.id)
            }
        }
        Recorridos(e, vm, cargador = false)
        if (e.ranking.isNotEmpty()) {
            Text("Ranking de cargadores", fontWeight = FontWeight.Medium)
            e.ranking.forEach { Text("${it.puesto}. ${it.nombre} · ${it.nivel} · ${it.puntos} pts · score ${it.score}", color = Muted) }
        }
    }
}

@Composable
private fun Perfil(e: Estado) {
    val f = e.ficha
    if (f == null) Text("Sin ficha.", color = Muted)
    else Column {
        Text(f.nombre, fontWeight = FontWeight.Medium)
        Text(f.telefono ?: "Sin teléfono", color = Muted)
        Text((if (f.pais == "PY") "Paraguay" else "Argentina") + (f.numeroDocumento?.let { " · ${if (f.tipoDocumento == "CI_PY") "CI" else "DNI"} $it" } ?: ""), color = Muted)
        Text("Documentación: ${e.identidad.replace('_', ' ')}", color = Muted)
    }
}

@Composable
private fun Recorridos(e: Estado, vm: MercadoVm, cargador: Boolean) {
    e.recorridos.forEach { rec ->
        Column(Modifier.fillMaxWidth().border(1.dp, Line, Forma).padding(10.dp).padding(top = 8.dp)) {
            Text("${rec.bultos} bultos · ${etiqueta(rec.estado)}", fontWeight = FontWeight.Medium)
            Text((if (cargador) rec.comprador else rec.cargador) + (if (cargador && rec.telefono != null) " · ${rec.telefono}" else ""), color = Muted)
            rec.paradas.forEach { parada ->
                Text("${parada.puesto}: ${parada.bultos} bultos · ${etiqueta(parada.estado)}")
                parada.items.forEach { Text("${it.cantidad} ${it.unidad} · ${it.nombre}", color = Muted, fontSize = 13.sp) }
                if (cargador && parada.estado == "aceptado") Boton("Retiré este puesto", true, enabled = !e.ocupado && parada.preparado) { vm.accion(rec.id, "retirar", parada.pedidoId) }
                if (cargador && parada.estado == "retirado") Boton("Entregué este puesto", true, enabled = !e.ocupado) { vm.accion(rec.id, "entregar", parada.pedidoId) }
                if (!cargador && parada.estado == "entregado" && parada.pedidoId !in e.calificadosPuesto) {
                    Estrellas("Calificar al puesto", e.ocupado) { n, c -> vm.calificar("pedidos/${parada.pedidoId}/calificar-puesto", "p:${parada.pedidoId}", n, c) }
                }
            }
            if (cargador && rec.estado == "asignado") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Boton("Aceptar", true, Modifier.weight(1f), e.ocupado) { vm.accion(rec.id, "aceptar", null) }
                    Boton("Rechazar", false, Modifier.weight(1f), e.ocupado) { vm.accion(rec.id, "rechazar", null) }
                }
            }
            if (cargador && rec.estado == "entregado" && rec.id !in e.calificadosComprador) {
                Estrellas("Calificar al comprador", e.ocupado) { n, c -> vm.calificar("recorridos/${rec.id}/calificar-comprador", "c:${rec.id}", n, c) }
            }
            if (!cargador && rec.estado == "entregado") {
                val ya = e.calificados[rec.id]
                if (ya != null) Text(if (ya > 0) "Calificaste con $ya de 5." else "Ya calificaste esta entrega.", color = Muted)
                else Estrellas("Calificar al cargador", e.ocupado) { n, c -> vm.calificar("recorridos/${rec.id}/calificar", "r:${rec.id}", n, c) }
            }
        }
    }
}

@Composable
private fun Estrellas(titulo: String, ocupado: Boolean, enviar: (Int, String) -> Unit) {
    var estrellas by androidx.compose.runtime.remember { androidx.compose.runtime.mutableIntStateOf(0) }
    var comentario by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf("") }
    Text(titulo, fontWeight = FontWeight.Medium)
    Row {
        (1..5).forEach { n -> Boton(n.toString(), estrellas >= n, enabled = !ocupado) { estrellas = n } }
    }
    Campo("Comentario, si querés", comentario) { comentario = it }
    Boton("Enviar calificación", true, enabled = !ocupado && estrellas > 0) { enviar(estrellas, comentario) }
}

@Composable
private fun Pasos(pedido: Pedido) {
    if (pedido.estado == "cancelado") {
        Text("Cancelado", color = Terra)
        return
    }
    val pasos = listOf(
        "Preparación" to (pedido.estado in setOf("preparado", "retirado", "entregado") || pedido.hitos["preparado"] != null),
        "Retiro" to (pedido.estado == "entregado" || pedido.hitos["retirado"] != null),
        "Entrega" to (pedido.estado == "entregado" || pedido.hitos["entregado"] != null),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 4.dp)) {
        pasos.forEach { (nombre, listo) ->
            Text(nombre, color = if (listo) Leaf else Muted, fontSize = 11.sp, modifier = Modifier.weight(1f).border(1.dp, if (listo) Leaf else Line, Forma).padding(4.dp))
        }
    }
}

@Composable
private fun Detalle(pedido: Pedido) {
    Text(if (pedido.nota.isNullOrBlank()) "Sin nota." else "Nota: ${pedido.nota}", color = if (pedido.nota.isNullOrBlank()) Muted else Ink)
    Text((pagoLegible(pedido.formaPago) ?: "Pago sin informar") + " · ${pedido.pagoEstado}", color = Muted)
    pedido.items.forEach { Text("${it.cantidad} ${it.unidad} · ${it.nombre} · ${plata(it.precio)} c/u", color = Muted) }
    Text("Importe del pedido ${plata(pedido.total)}")
}

@Composable
private fun Cabecera(titulo: String, vm: MercadoVm, extra: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(titulo, fontFamily = FontFamily.Serif, fontSize = 26.sp, modifier = Modifier.weight(1f))
        if (extra != null) TextButton(onClick = extra) { Text("Actualizar") }
        TextButton(onClick = vm::salir) { Text("Salir") }
    }
}

@Composable
private fun Campo(label: String, value: String, onChange: (String) -> Unit, teclado: KeyboardType = KeyboardType.Text, oculto: Boolean = false) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = label != "Nota para el puesto" && label != "Comentario, si querés",
        visualTransformation = if (oculto) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = teclado),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Boton(texto: String, lleno: Boolean, modifier: Modifier = Modifier, enabled: Boolean = true, click: () -> Unit) {
    Button(
        onClick = click,
        enabled = enabled,
        modifier = modifier.height(44.dp),
        shape = Forma,
        colors = if (lleno) ButtonDefaults.buttonColors(containerColor = Leaf, contentColor = OnLeaf) else ButtonDefaults.buttonColors(containerColor = SurfaceC, contentColor = Ink),
    ) { Text(texto, fontSize = 13.sp, maxLines = 2) }
}

@Composable
private fun Error(texto: String?) {
    if (!texto.isNullOrBlank()) Text(texto, color = Terra, fontSize = 13.sp)
}

@Composable
private fun launcher(ctx: Context, onFile: (String, ByteArray, String) -> Unit) =
    rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val (nombre, bytes, mime) = leerArchivo(ctx, uri)
            onFile(nombre, bytes, mime)
        }
    }

private fun leerArchivo(ctx: Context, uri: Uri): Triple<String, ByteArray, String> {
    val mime = ctx.contentResolver.getType(uri) ?: "application/octet-stream"
    val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: byteArrayOf()
    var nombre = "archivo"
    ctx.contentResolver.query(uri, null, null, null, null)?.use { c ->
        val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (c.moveToFirst() && i >= 0) nombre = c.getString(i) ?: nombre
    }
    return Triple(nombre, bytes, mime)
}
