import '../../app.dart';
import 'productos.dart';
import 'publicidad.dart';
import 'servicios.dart';
import 'sucursales.dart';

List<DestinoTorre> destinosProductos() => [
      DestinoTorre(
        id: 'productos',
        titulo: 'Add-ons y precios',
        grupo: 'Comercial',
        builder: (api) => PantallaProductos(api: api),
      ),
      DestinoTorre(
        id: 'servicios',
        titulo: 'Servicios',
        grupo: 'Comercial',
        builder: (api) => PantallaServicios(api: api),
      ),
      DestinoTorre(
        id: 'sucursales',
        titulo: 'Sucursales',
        grupo: 'Comercial',
        builder: (api) => PantallaSucursales(api: api),
      ),
      DestinoTorre(
        id: 'publicidad',
        titulo: 'Publicidad',
        grupo: 'Comercial',
        builder: (api) => PantallaPublicidad(api: api),
      ),
    ];
