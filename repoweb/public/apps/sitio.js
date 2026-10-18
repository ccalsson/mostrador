/* Sin dependencias, peticiones, almacenamiento, cookies ni analítica.
 * Script clásico (no módulo) para funcionar también desde file://.
 */
(function () {
  'use strict';

  var config = window.MOSTRADOR_PUBLICO || {};
  var apps = { mostrador: 'Mostrador', mercado: 'Mercado' };
  var requested = new URLSearchParams(window.location.search).get('app');
  var app = Object.prototype.hasOwnProperty.call(apps, requested) ? requested : 'mostrador';
  var name = apps[app];
  var required = {
    nombreLegal: 'Nombre o razón social del responsable',
    pais: 'País del responsable',
    domicilio: 'Domicilio del responsable',
    correoSoporte: 'Correo de soporte válido',
    correoPrivacidad: 'Correo de privacidad válido',
    fechaVigencia: 'Fecha de vigencia revisada (AAAA-MM-DD)',
    plazoSoporte: 'Plazo concreto de atención de soporte',
    plazoDerechos: 'Plazo concreto de respuesta a derechos',
    plazoEliminacion: 'Plazo concreto de ejecución de la eliminación',
    retencionCuenta: 'Plazo y criterio de conservación de cuenta',
    retencionOperaciones: 'Plazo y fundamento de conservación contable',
    retencionIdentidad: 'Plazo de conservación de identidad y verificaciones',
    retencionMensajes: 'Plazo de conservación de mensajes',
    retencionSeguridad: 'Plazo de conservación de registros de seguridad',
    retencionCopias: 'Plazo de rotación y eliminación de copias de seguridad',
    retencionIA: 'Plazos y condiciones de conservación de proveedores de IA'
  };

  function validText(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 1500 &&
      !/[\u0000-\u001f\u007f]/.test(value) &&
      !/^(pendiente|por completar|por confirmar|borrador|tbd|n\/?a|-+)$/i.test(value.trim());
  }

  function validEmail(value) {
    if (typeof value !== 'string' || value.length > 254 || value !== value.trim()) return false;
    if (!/^[a-zA-Z0-9.!#$%'+/=_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value)) return false;
    var pieces = value.split('@');
    return pieces[0].length <= 64 && !pieces[0].startsWith('.') && !pieces[0].endsWith('.') &&
      !pieces[0].includes('..') && pieces[1].split('.').every(function (part) { return part.length <= 63; }) &&
      !/(^|\.)(example\.(com|net|org)|invalid|localhost|test)$/i.test(pieces[1]);
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function safeURL(value, store) {
    if (typeof value !== 'string' || value !== value.trim() || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) return null;
      if (store) {
        if (url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details') return null;
        var id = url.searchParams.get('id');
        if (!id || !/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id)) return null;
        if (url.searchParams.getAll('id').length !== 1) return null;
        var accepted = true;
        url.searchParams.forEach(function (_value, key) { if (key !== 'id' && key !== 'hl') accepted = false; });
        if (!accepted) return null;
      } else if (url.hostname !== 'mostrador-xi.vercel.app' || url.pathname !== '/apps/' || url.search) {
        return null;
      }
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function validField(key) {
    if (key === 'correoSoporte' || key === 'correoPrivacidad') return validEmail(config[key]);
    if (key === 'fechaVigencia') return validDate(config[key]);
    return validText(config[key]);
  }

  var pending = Object.keys(required).filter(function (key) { return !validField(key); })
    .map(function (key) { return required[key]; });
  if (!safeURL(config.urlBase, false)) pending.push('URL base HTTPS válida del sitio previsto');
  if (config.revisionLegalAprobada !== true) pending.push('Revisión y aprobación de los textos jurídicos');
  if (config.canalHumanoVerificado !== true) pending.push('Canal de atención humana probado y con responsable asignado');
  var ready = pending.length === 0;

  document.querySelectorAll('[data-app-name]').forEach(function (element) { element.textContent = name; });
  document.querySelectorAll('[data-app-scope]').forEach(function (element) {
    element.hidden = element.dataset.appScope !== app;
  });
  document.querySelectorAll('[data-app-choice]').forEach(function (element) {
    if (element.dataset.appChoice === app) element.setAttribute('aria-current', 'true');
    else element.removeAttribute('aria-current');
  });
  document.querySelectorAll('a[data-app-link]').forEach(function (element) {
    var href = element.getAttribute('href');
    if (/^(index|privacidad|condiciones|soporte|eliminar-cuenta)\.html$/.test(href)) {
      element.setAttribute('href', href + '?app=' + app);
    }
  });
  document.querySelectorAll('[data-public]').forEach(function (element) {
    var key = element.dataset.public;
    var valid = Object.prototype.hasOwnProperty.call(required, key) && validField(key);
    if (key === 'urlBase') valid = Boolean(safeURL(config.urlBase, false));
    element.textContent = valid ? config[key] : 'Pendiente de completar';
    element.classList.toggle('pending-value', !valid);
  });
  document.querySelectorAll('[data-config-pendientes]').forEach(function (list) {
    list.textContent = '';
    var items = ready ? ['Datos completos y confirmaciones registradas. Esto no acredita un despliegue ni cumplimiento normativo.'] : pending;
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
  });
  document.querySelectorAll('[data-contact-status]').forEach(function (element) {
    element.textContent = ready
      ? 'Se abrirá tu aplicación de correo. Revisá el mensaje y enviálo desde allí: esta página no envía solicitudes ni confirma su recepción.'
      : 'Contacto inhabilitado: faltan datos legales, correos y plazos confirmados, revisión jurídica y un canal humano probado. No hay envío ni recepción de solicitudes desde este borrador.';
  });
  document.querySelectorAll('[data-draft-status]').forEach(function (element) {
    element.textContent = !ready
      ? 'BORRADOR · Faltan datos y revisión. No apto para publicar.'
      : config.publicacionAutorizada === true
        ? 'Datos y revisión confirmados en la configuración. El despliegue se verifica por separado.'
        : 'CANDIDATO INTERNO · Datos configurados. Publicación no autorizada.';
  });

  var subjects = {
    soporte: 'Consulta de soporte — ',
    privacidad: 'Solicitud sobre datos personales — ',
    eliminacion: 'Solicitud de eliminación de cuenta y datos — '
  };
  document.querySelectorAll('button[data-contact]').forEach(function (button) {
    var kind = button.dataset.contact;
    var known = Object.prototype.hasOwnProperty.call(subjects, kind);
    var email = config[kind === 'soporte' ? 'correoSoporte' : 'correoPrivacidad'];
    button.disabled = !ready || !known || !validEmail(email);
    button.addEventListener('click', function () {
      if (button.disabled || !ready || !known || !validEmail(email)) return;
      var body = kind === 'eliminacion'
        ? 'Solicito la eliminación de mi cuenta y de los datos personales asociados en ' + name + '.\n\nCorreo asociado a mi cuenta: [completar]\nPerfil o comercio, si corresponde: [completar]\n\nEntiendo que se verificará mi titularidad y que deberán informarme qué registros se conservan por obligación legal, su fundamento y plazo.\n\nNo adjunto contraseñas, códigos de acceso ni documentos de identidad.'
        : 'Aplicación: ' + name + '\nConsulta o derecho que deseo ejercer: [completar]\n\nNo incluir contraseñas, códigos, documentos ni datos de terceros.';
      window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' +
        encodeURIComponent(subjects[kind] + name) + '&body=' + encodeURIComponent(body);
    });
  });
  document.querySelectorAll('button[data-store]').forEach(function (button) {
    var id = button.dataset.store;
    var entry = config.apps && config.apps[id];
    var url = entry && safeURL(entry.playStoreUrl, true);
    button.disabled = !ready || config.publicacionAutorizada !== true || !url;
    button.addEventListener('click', function () {
      if (!button.disabled && url) window.location.assign(url);
    });
    var status = document.getElementById(button.getAttribute('aria-describedby'));
    if (status && !button.disabled) status.textContent = 'Enlace a la ficha de Google Play configurada por el titular.';
  });
  if (document.body.dataset.page !== 'inicio') document.title = document.body.dataset.title + ' | ' + name;

  // Capa de movimiento: sólo agrega. Sin IntersectionObserver o con el movimiento
  // reducido el contenido queda visible, nunca esperando un evento que no llega.
  var progreso = document.querySelector('.scroll-progress');
  var cabecera = document.querySelector('.site-header');
  function alDesplazar() {
    var recorrido = document.documentElement.scrollHeight - window.innerHeight;
    if (progreso) progreso.style.setProperty('--p', recorrido > 0 ? Math.min(1, window.scrollY / recorrido) : 0);
    if (cabecera) cabecera.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', alDesplazar, { passive: true });
  window.addEventListener('resize', alDesplazar);
  alDesplazar();

  var revelables = [].slice.call(document.querySelectorAll('.reveal'));
  var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducido || typeof window.IntersectionObserver !== 'function') {
    revelables.forEach(function (elemento) { elemento.classList.add('in'); });
  } else {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('in');
        observador.unobserve(entrada.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revelables.forEach(function (elemento) { observador.observe(elemento); });
  }
})();
