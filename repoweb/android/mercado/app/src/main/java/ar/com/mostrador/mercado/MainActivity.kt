package ar.com.mostrador.mercado

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels

class MainActivity : ComponentActivity() {
    private val vm: MercadoVm by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        entregar(intent)
        setContent {
            MercadoTema { Pantalla(vm) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        entregar(intent)
    }

    private fun entregar(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "mercadoaltoque" || data.host != "auth") return
        val token = data.getQueryParameter("token") ?: return
        intent.data = null
        vm.entrarConGoogle(token)
    }
}
