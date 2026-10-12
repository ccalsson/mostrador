package ar.com.mostrador.torre

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        canalTorre(this)
        if (prefsTorre(this).getBoolean("escuchar", false)) {
            ContextCompat.startForegroundService(this, Intent(this, Escucha::class.java))
        }
        setContent {
            val vm: TorreVm = viewModel()
            Pantalla(vm)
        }
    }
}
