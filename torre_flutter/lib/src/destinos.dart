import 'app.dart';
import 'pantallas/comercial/destinos.dart';
import 'pantallas/operacion/destinos.dart';
import 'pantallas/plataforma/destinos.dart';
import 'pantallas/productos/destinos.dart';
import 'pantallas/torre/destinos.dart';
import 'tablero.dart';

List<DestinoTorre> todosLosDestinos() => [
      DestinoTorre(id: 'tablero', titulo: 'Tablero', grupo: '', builder: (api) => PantallaTablero(api: api)),
      ...destinosComercial(),
      ...destinosProductos(),
      ...destinosOperacion(),
      ...destinosPlataforma(),
      ...destinosTorre(),
    ];
