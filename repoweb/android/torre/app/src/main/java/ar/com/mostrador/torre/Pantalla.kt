package ar.com.mostrador.torre

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private val Paper = Color(0xFFF4EFE4)
private val Ink = Color(0xFF14110E)
private val Gold = Color(0xFF8A6A1F)
private val Terra = Color(0xFF9A3412)

@Composable
fun Pantalla(vm: TorreVm) {
    val e by vm.estado.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val permiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        vm.escuchar(true)
    }
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = Paper) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Torre", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = Ink)
                if (e.token.isBlank()) {
                    Text("Entrá con la cuenta que ya abre la Torre. El teléfono avisa cuando hay que habilitar o resolver.", color = Ink)
                    Campo("Servidor", e.servidor, vm::servidor)
                    Campo("Correo", e.email, vm::email, KeyboardType.Email)
                    Campo("Clave", e.clave, vm::clave, KeyboardType.Password)
                    Boton("Entrar", !e.ocupado) { vm.entrar() }
                } else {
                    Text(e.email, color = Ink)
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Escuchar", fontWeight = FontWeight.Medium, color = Ink)
                            Text("Avisa aunque la app no esté adelante.", color = Color(0xFF5C564C))
                        }
                        Switch(checked = e.escuchar, onCheckedChange = { on ->
                            if (!on) {
                                vm.escuchar(false)
                                return@Switch
                            }
                            val falta = Build.VERSION.SDK_INT >= 33 &&
                                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                            if (falta) permiso.launch(Manifest.permission.POST_NOTIFICATIONS) else vm.escuchar(true)
                        })
                    }
                    Text("Para habilitar", fontWeight = FontWeight.SemiBold, color = Ink)
                    if (e.pedidos.isEmpty()) Text("Nada pendiente.", color = Color(0xFF5C564C))
                    e.pedidos.forEach { pedido ->
                        Column(modifier = Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(12.dp)) {
                            Text("${pedido.tenant} pidió ${pedido.product}", fontWeight = FontWeight.Medium, color = Ink)
                            Text(
                                "${pedido.currency} ${pedido.amount.toLong()} · ${if (pedido.medio == "cuenta") "a cargo en cuenta" else "transferencia"}" +
                                    if (pedido.tieneComprobante) " · con comprobante" else "",
                                color = Color(0xFF5C564C),
                            )
                            Boton("Habilitar", !e.ocupado) { vm.habilitar(pedido.id) }
                        }
                    }
                    Text("Para resolver", fontWeight = FontWeight.SemiBold, color = Ink)
                    if (e.alertas.isEmpty()) Text("Nada para resolver.", color = Color(0xFF5C564C))
                    e.alertas.forEach { alerta ->
                        Text(alerta.texto, modifier = Modifier.fillMaxWidth().background(Color(0xFFFFF4E5), RoundedCornerShape(12.dp)).padding(12.dp), color = Terra)
                    }
                    Row {
                        TextButton(onClick = { vm.refrescar() }, enabled = !e.ocupado) { Text("Actualizar") }
                        TextButton(onClick = { vm.salir() }) { Text("Salir", color = Terra) }
                    }
                }
                e.error?.let { Text(it, color = Terra) }
            }
        }
    }
}

@Composable
private fun Campo(label: String, value: String, onChange: (String) -> Unit, tipo: KeyboardType = KeyboardType.Text) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = if (tipo == KeyboardType.Password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = tipo),
    )
}

@Composable
private fun Boton(texto: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Color(0xFFF4EFE4)),
    ) { Text(texto) }
}
