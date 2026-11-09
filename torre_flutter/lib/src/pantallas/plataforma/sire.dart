import 'dart:math';
import 'package:flutter/material.dart';
import '../../api.dart';
import '../../tema.dart';
import '../../widgets.dart';

class PantallaSire extends StatefulWidget {
  const PantallaSire({super.key, required this.api});
  final TorreApi api;
  @override
  State<PantallaSire> createState() => _PantallaSireState();
}

class _PantallaSireState extends State<PantallaSire> {
  int version = 0;
  final operations = <String, String>{};
  final pending = <String>{};

  String alcance(Map member, List<dynamic> sites) {
    final id = member['site_id'];
    if (id == null) return 'Toda la institución';
    for (final site in sites.whereType<Map>()) { if (site['id'] == id && site['institution_id'] == member['institution_id']) return texto(site['name']); }
    return 'Sede no disponible';
  }

  String uuid() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  Future<void> cambiarAcceso(Map institution, Map member) async {
    final id = texto(member['id']);
    if (pending.contains(id)) return;
    setState(() => pending.add(id));
    final operation = operations.putIfAbsent(id, uuid);
    try {
      final result = await widget.api.fnMapa('modificarInstitucionSire', {'action':'set-member-state','operationId':operation,'institutionId':institution['id'],'membershipId':id,'active':member['active'] != true});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto(result['mensaje']))));
      if (result['ok'] == true) { operations.remove(id); setState(() => version++); }
    } catch (_) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo modificar el acceso.'))); }
    finally { if (mounted) setState(() => pending.remove(id)); }
  }

  Future<void> formulario(String action, {String institutionId = '', List<Map> sites = const []}) async {
    final formName = TextEditingController(), formEmail = TextEditingController(), formRoot = TextEditingController(text: 'Sede central');
    final operationId = uuid(), resourceId = uuid(), rootSiteId = uuid();
    String selectedSite = '', kind = 'subsede', role = 'docente', message = '';
    bool busy = false;
    final route = DialogRoute<bool>(context: context, builder: (dialogContext) => StatefulBuilder(builder: (context, update) {
      final creating = action == 'create-institution', addingSite = action == 'create-site';
      final options = sites.where((s) => s['institution_id'] == institutionId && s['active'] == true && (!addingSite || s['kind'] == 'sede' || kind == 'extension' && s['kind'] == 'subsede')).toList();
      Future<void> submit() async {
        if ((creating && (formName.text.trim().isEmpty || formEmail.text.trim().isEmpty || formRoot.text.trim().isEmpty)) || (addingSite && (formName.text.trim().isEmpty || selectedSite.isEmpty)) || (action == 'link-member' && formEmail.text.trim().isEmpty)) { update(() => message = 'Completá los campos.'); return; }
        final body = <String, Object?>{'action':action,'operationId':operationId,'resourceId':resourceId};
        if (creating) body.addAll({'siteId':rootSiteId,'institutionName':formName.text.trim(),'siteName':formRoot.text.trim(),'rectorEmail':formEmail.text.trim()});
        if (addingSite) body.addAll({'institutionId':institutionId,'parentSiteId':selectedSite,'name':formName.text.trim(),'kind':kind});
        if (action == 'link-member') body.addAll({'institutionId':institutionId,'siteId':selectedSite.isEmpty ? null : selectedSite,'email':formEmail.text.trim(),'role':role});
        update(() { busy = true; message = ''; });
        try {
          final result = await widget.api.fnMapa('modificarInstitucionSire', body);
          if (!dialogContext.mounted) return;
          if (result['ok'] == true) { Navigator.of(dialogContext).pop(true); return; }
          update(() => message = texto(result['mensaje']));
        } catch (_) { if (dialogContext.mounted) update(() => message = 'No se pudo completar la operación.'); }
        finally { if (dialogContext.mounted) update(() => busy = false); }
      }
      return AlertDialog(title: Text(creating ? 'Crear institución' : addingSite ? 'Agregar subsede' : 'Vincular usuario'), content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (creating || addingSite) TextField(controller: formName, decoration: InputDecoration(labelText: creating ? 'Institución' : 'Nombre')),
        if (creating) TextField(controller: formRoot, decoration: const InputDecoration(labelText: 'Sede principal')),
        if (!addingSite) TextField(controller: formEmail, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: creating ? 'Correo de rectoría' : 'Correo verificado en SIRE')),
        if (addingSite) DropdownButtonFormField<String>(initialValue: kind, decoration: const InputDecoration(labelText: 'Tipo'), items: const [DropdownMenuItem(value:'subsede',child:Text('Subsede')),DropdownMenuItem(value:'extension',child:Text('Extensión'))], onChanged: (v) => update(() { kind = v ?? 'subsede'; selectedSite = ''; })),
        if (!creating) DropdownButtonFormField<String>(key: ValueKey('$kind-$selectedSite'), initialValue: selectedSite, decoration: InputDecoration(labelText: addingSite ? 'Sede de la que depende' : 'Alcance'), items: [DropdownMenuItem(value:'',child:Text(addingSite ? 'Elegir sede' : 'Toda la institución')),for (final s in options) DropdownMenuItem(value:texto(s['id']),child:Text(texto(s['name'])))], onChanged: (v) => update(() => selectedSite = v ?? '')),
        if (action == 'link-member') DropdownButtonFormField<String>(initialValue: role, decoration: const InputDecoration(labelText: 'Rol'), items: const [DropdownMenuItem(value:'docente',child:Text('Docente')),DropdownMenuItem(value:'preceptor',child:Text('Preceptoría')),DropdownMenuItem(value:'secretaria',child:Text('Secretaría')),DropdownMenuItem(value:'coordinador',child:Text('Coordinación'))], onChanged: (v) => update(() => role = v ?? 'docente')),
        if (message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12),child: Text(message)),
      ])), actions: [TextButton(onPressed: busy ? null : () => Navigator.of(dialogContext).pop(false), child: const Text('Cancelar')),FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Guardando…' : 'Guardar'))]);
    }));
    final saved = await Navigator.of(context).push(route);
    await route.completed;
    formName.dispose(); formEmail.dispose(); formRoot.dispose();
    if (saved == true && mounted) setState(() => version++);
  }
  @override
  Widget build(BuildContext context) => VistaDatos<Map<String, dynamic>>(
    key: ValueKey(version),
    cargar: () => widget.api.fnMapa('consultarInstitucionesSire'),
    builder: (context, result) {
      final colors = torreColorsOf(context);
      if (result['disponible'] != true) return Tarjeta(child: Text(texto(result['motivo'])));
      final data = result['data'] as Map? ?? const {};
      final institutions = data['institutions'] as List? ?? const [];
      final sites = data['sites'] as List? ?? const [];
      final members = data['members'] as List? ?? const [];
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Align(alignment: Alignment.centerLeft, child: FilledButton(onPressed: () => formulario('create-institution'), child: const Text('Crear institución'))),
        if (data['limited'] == true) const Text('La lista está limitada. Faltan resultados.'),
        if (institutions.isEmpty) const Text('No hay instituciones registradas.'),
        for (final institution in institutions.whereType<Map>()) ...[
          Tarjeta(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(texto(institution['name']), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: colors.ink)),
            const SizedBox(height: 12),
            const Text('Sedes y extensiones', style: TextStyle(fontWeight: FontWeight.w600)),
            for (final site in sites.whereType<Map>().where((item) => item['institution_id'] == institution['id']))
              Padding(padding: const EdgeInsets.only(top: 6), child: Text('${texto(site['name'])} · ${texto(site['kind'])}${site['active'] == true ? '' : ' · Inactiva'}')),
            Wrap(spacing: 8, children: [TextButton(onPressed: () => formulario('create-site', institutionId: texto(institution['id']), sites: sites.whereType<Map>().toList()), child: const Text('Agregar subsede')), TextButton(onPressed: () => formulario('link-member', institutionId: texto(institution['id']), sites: sites.whereType<Map>().toList()), child: const Text('Vincular usuario'))]),
            const SizedBox(height: 12),
            const Text('Usuarios y roles', style: TextStyle(fontWeight: FontWeight.w600)),
            for (final member in members.whereType<Map>().where((item) => item['institution_id'] == institution['id']))
              Padding(padding: const EdgeInsets.only(top: 8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${texto(member['name'])} · ${texto(member['role'])}${member['active'] == true ? '' : ' · Inactivo'}\n${texto(member['email'])}\n${alcance(member, sites)}'), if (['docente','preceptor','secretaria','coordinador'].contains(member['role'])) TextButton(onPressed: pending.contains(texto(member['id'])) ? null : () => cambiarAcceso(institution, member), child: Text(member['active'] == true ? 'Suspender acceso' : 'Reactivar acceso'))])),
          ])),
          const SizedBox(height: 12),
        ],
        Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => setState(() => version++), child: const Text('Actualizar'))),
      ]);
    },
  );
}
