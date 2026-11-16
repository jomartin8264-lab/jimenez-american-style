# 🧠 MEMORIA Y CONTEXTO DEL PROYECTO: TIENDA ALINA

> **Instrucción para el Asistente AI:** Lee este archivo al iniciar cualquier nueva sesión para entender el contexto completo, arquitectura, módulos implementados, convenciones y estado actual del proyecto sin perder continuidad.

---

## 📌 1. Visión General del Proyecto
**Tienda Alina** es un sistema híbrido que combina:
1. **Tienda Online (E-commerce):** Catálogo web responsive para clientes con carrito de compras y checkout conectado a WhatsApp.
2. **Punto de Venta Físico (POS):** Sistema de caja registradora de alta velocidad para mostrador con escáner de códigos de barra, alertas sonoras, impresión de etiquetas y registro de ventas.
3. **Panel de Control / Admin:** Gestión centralizada de inventario en tiempo real, catálogo, stock sincronizado y control de accesos.

---

## 🛠️ 2. Stack Tecnológico
* **Frontend:** React 19, Vite 8, React Router DOM v7.
* **Estilos:** CSS puro modular / responsive con soporte para pantallas táctiles y móviles.
* **Backend & Base de Datos:** Google Firebase (Authentication + Firestore Database en tiempo real).
* **Códigos de Barra:** `jsbarcode` (generación automática e impresión térmica/estándar).
* **Iconografía:** `lucide-react`.
* **Entorno de Escritorio / Local:**
  * Servidor local ligero: `server.cjs` (sirve la compilación `dist` en puerto 4500 y abre ventana `--app` en Chrome/Edge).
  * Lanzador rápido de un clic: `Iniciar-POS.bat`.
  * Base lista para app nativa: Electron 45 (`electron/main.cjs`).

---

## 📂 3. Estructura del Código

```text
pagina web alina/
├── dist/                         # Build de producción generado por Vite
├── electron/
│   └── main.cjs                  # Configuración base de ventana Electron
├── public/                       # Assets públicos
├── src/
│   ├── assets/                   # Imágenes, logos y banners
│   ├── components/
│   │   ├── BarcodeModal.jsx      # Modal generador e impresor de códigos de barra
│   │   ├── Hero.jsx              # Banner principal del home
│   │   ├── Navbar.jsx            # Barra de navegación con accesos según rol
│   │   ├── ProductCard.jsx       # Tarjeta de producto para catálogo
│   │   ├── ProductModal.jsx      # Detalle de producto
│   │   └── WhatsAppButton.jsx    # Botón flotante de contacto
│   ├── contexts/
│   │   ├── AuthContext.jsx       # Estado de autenticación y rol de usuario
│   │   └── CartContext.jsx       # Carrito de compra con persistencia local
│   ├── hooks/
│   │   └── useSEO.js             # Metadatos dinámicos para SEO
│   ├── pages/
│   │   ├── Home.jsx              # Página de inicio
│   │   ├── Catalog.jsx           # Catálogo con filtros por categoría y búsqueda
│   │   ├── Cart.jsx              # Carrito y generación de pedido a WhatsApp
│   │   ├── Login.jsx             # Autenticación de administradores y cajeros
│   │   ├── Admin.jsx             # Panel de administración e inventario
│   │   └── POS.jsx               # Sistema Punto de Venta (Caja rápida)
│   ├── utils/
│   │   ├── productImages.js      # Fallbacks y optimización de imágenes
│   │   └── soundAlert.js         # Sintetizador de tonos de audio Web Audio API
│   ├── App.jsx                   # Rutas principales (/ , /catalog, /cart, /admin, /pos, /login)
│   ├── firebase.js               # Conexión e inicialización del SDK de Firebase
│   └── main.jsx                  # Entrada principal React
├── firestore.rules               # Reglas de seguridad para Firestore
├── Iniciar-POS.bat               # Ejecutable rápido para el encargado de caja
├── server.cjs                    # Servidor local para modo app de escritorio
├── vite.config.js                # Configuración de empaquetado Vite
└── package.json                  # Dependencias y scripts
```

---

## 🚀 4. Módulos y Funcionalidades Clave

### A. Punto de Venta (POS) - `/pos`
* **Venta Rápida:** Diseñado para teclado, pantalla táctil o ratón.
* **Soporte Escáner de Código de Barras:** Detección de lectura continua con buffer de caracteres y tecla `Enter`.
* **Múltiples Formas de Pago:** Efectivo (con cálculo automático de cambio), Tarjeta y Transferencia bancaria.
* **Feedback Sonoro (`soundAlert.js`):** Beeps diferenciados al escanear producto, añadir al carrito, error o venta completada.
* **Impresión de Etiquetas de Código de Barras (`BarcodeModal.jsx`):** Genera código Code128 a partir del SKU/ID y formatea para imprimir en etiquetas adhesivas.
* **Control de Stock en Tiempo Real:** Las ventas descuentan directamente el inventario en Firestore.
* **Sistema Oficial de Folios de Ticket:** Cada venta física genera un folio correlativo oficial (ej. `TCK-1001`, `TCK-1002`) y los pedidos web generan su folio (ej. `WEB-1001`), permitiendo búsqueda instantánea por número de folio para reimpresiones, cambios o devoluciones.
* **Gestión Directa de Artículos en Caja:** Acciones en cada tarjeta del POS para ver/imprimir código de barras y botón de eliminación segura con confirmación directa en Firestore (sincronizado al instante con la tienda web).
* **Edición y Adición al Ticket de Venta:** Botón para agregar conceptos manuales libres (ej. arreglos, extras, prendas sin código), edición en un clic del precio unitario de cualquier prenda en el ticket y botón "Configurar" para personalizar nombre del negocio, dirección, teléfono y políticas de cambio en el ticket.
* **Reimpresión de Tickets (Física y Web):** 
  - Pestaña **Pedidos Web**: Botón "Imprimir Ticket" en cada pedido con nombre, teléfono, dirección y notas del cliente para anexar a la bolsa o paquete de entrega.
  - Pestaña **Corte de Caja**: Tabla de historial con botón "Reimprimir" para volver a imprimir cualquier ticket del día o de ventas pasadas.
  - Modal con botón de edición rápida de datos del cliente o notas antes de imprimir.

### B. Roles, Permisos y Control de Usuarios (RBAC)
El sistema cuenta con una arquitectura de control de acceso basada en roles sincronizada en tiempo real mediante Firestore (`config/admins` y `config/staff`), reforzada por reglas de seguridad en la base de datos (`firestore.rules`):

1. **👑 Administradores (Dueño / Esposa):**
   * **Acceso Total:** Panel de administración (`/admin`), Punto de Venta (`/pos`), catálogo y reportes.
   * **Eliminación Segura:** Únicos autorizados para eliminar artículos del inventario y para eliminar registros de ventas de mostrador o pedidos web.
   * **Gestión de Personal:** Pestaña exclusiva `Control de Usuarios` en el POS para añadir nuevos empleados o administradores, cambiar roles con un solo clic o revocar accesos.
   * **Pestaña de Configuración Centralizada:** Nueva pestaña `⚙️ Configuración` en el POS que centraliza Categorías Dinámicas, Empresa y Contacto, llaves de API (Telegram / ImgBB) y Admins Autorizados (eliminadas de `/admin` para mantenerlo limpio y operativo).
   * **Protección Master:** La cuenta raíz `jomartin8264@gmail.com` está blindada contra revocación accidental de rol o eliminación.

2. **👔 Empleados (Cajeros / Personal de Tienda):**
   * **Ventas en Mostrador:** Cobro rápido, selección de método de pago, aplicación de descuentos y emisión de tickets.
   * **Alta de Prendas desde el Celular o PC:** Pueden ingresar a `/admin` o usar `⚡ Alta Rápida`. El SKU/Código de barras es automático o validado.
   * **Auditoría y Trazabilidad:** Cada prenda registrada almacena automáticamente los campos `createdBy` (correo) y `createdByName` (nombre o alias del usuario), mostrándose claramente en las tarjetas de inventario y en el POS (`👤 Alta por: [Nombre]`).
   * **Pedidos Web y Reimpresión:** Pueden consultar pedidos recibidos por la web, imprimir sus tickets para empaque y buscar folios de tickets para reimpresión.
   * **Restricciones Estrictas:** No pueden eliminar prendas, no pueden eliminar ventas ni pedidos, no tienen acceso a las pestañas de usuarios ni de configuración.

### C. Sistema de Folios, Búsqueda y Reimpresión de Tickets
* **Folios Únicos Oficiales:**
  - Mostrador / Físico: `TCK-XXXX` correlativo con fecha y hora exacta.
  - Tienda Online: `WEB-XXXX` generado al confirmar pedido en el carrito web.
* **Buscador en Tiempo Real:** Filtro instantáneo por folio, nombre de cliente o número telefónico tanto en **Corte de Caja** como en **Pedidos Web**.
* **Reimpresión Flexible:** Reimprime cualquier ticket pasado con opción de editar notas o datos de cliente antes de imprimir.
* **Edición en Caja:** Permite agregar conceptos manuales libres al ticket (arreglos, extras) y editar el precio de una prenda en mostrador antes de cobrar.

### D. Tienda Web y Seguridad de Carrito
* **Autenticación Obligatoria para Comprar:** Los botones "Agregar al carrito" en catálogo y modal de detalle verifican sesión activa. Si el usuario no ha iniciado sesión, es redirigido inmediatamente a `/login`.
* Catálogo dinámico conectado a la misma colección de productos en Firestore con exclusión automática de prendas `availableOnline: false`.
* Carrito de compras reactivo con persistencia en `localStorage`.
* Pedido estructurado exportable a mensaje directo de WhatsApp.

### E. Asistente de Surtido y Empaque para Pedidos Web (Picking & Packing)
* **Miniaturas con Foto:** En cada tarjeta de pedido web, cada artículo muestra la fotografía real de la prenda. Al hacer clic o tocar la foto, se abre un modal de alta resolución para ver el diseño, color y detalles exactos de la prenda que se debe tomar del perchero.
* **SKU / Código en la Tarjeta:** Muestra la insignia `SKU: ALN-XXXX` para cotejar directamente con la etiqueta física de la prenda en la tienda.
* **Checklist Interactivo de Surtido:** Casilla de verificación `[ ]` junto a cada prenda. Al tomarla del perchero y meterla en la bolsa, el usuario la marca `[✓] Surtido`, cambiando la línea a verde y tachando el nombre.
* **Barra de Progreso:** Indica `📦 Surtido: X de Y prendas listas` o `🎉 ¡Pedido 100% surtido en bolsa!`.
* **Persistencia de Checklist:** El estado de las prendas empacadas se conserva en `localStorage` (`alina_picked_orders`) para que no se pierda al recargar la app.
* **SKU en el Ticket Impreso:** Al presionar "Imprimir Ticket", cada partida incluye su SKU impreso para control del repartidor / mandadito.

### F. Generador de Hojas de Etiquetas Adhesivas y Pre-etiquetado en Lote
Diseñado para eliminar el desperdicio de hojas carta de stickers (Avery / Janel) y agilizar la operación en tienda:
* **Modo 1: Pre-impresión de Códigos Consecutivos Libres (`⚡ Pre-imprimir Códigos`):**
  - Permite imprimir paquetes de 24, 48, 72, 96, 100 o más etiquetas de códigos de barra antes de registrar las prendas.
  - Utiliza un contador atómico en Firestore (`config/counters` -> `skuSequence`) que garantiza que los códigos sean **estrictamente consecutivos e irrepetibles** (ej. `ALN-01001` al `ALN-01100`).
  - Las etiquetas se imprimen con formato para troqueles de ropa: Logo ALINA, código Code128, SKU legible y línea guía discreta `TALLA: ____  $______`.
  - El personal pega físicamente los stickers a las prendas en los percheros/cajas.
* **Modo 2: Etiquetas de Prendas Existentes (`📦 Prendas Registradas`):**
  - Bandeja inteligente con filtro por `⏳ Pendientes`, `📦 Todas` y `✓ Listas`.
  - Banner interactivo post-impresión: *“¿Se imprimieron bien tus etiquetas? [ ✅ Sí, marcar como etiquetadas ]”* con `writeBatch`.
* **Calibración Milimétrica para 1 Hoja Carta Exacta:**
  - Formato de 24 etiquetas por hoja bloqueado exactamente a 8 filas fijas de **32.5mm** (medida estándar de plantillas 3x8 Janel/Avery).
  - Hoja delimitada a **272mm** de alto con `overflow: hidden`, impidiendo que se desborden filas a una segunda página.
  - Selector de posición inicial para hojas empezadas (*"¿Hoja empezada? Iniciar en celda #X"*).

### G. Sistema de Alta Rápida y Blindaje contra Duplicados
Resuelve la velocidad de captura diferenciando las necesidades de mostrador vs tienda en línea:
* **🚫 Bloqueo Estricto de Duplicados:** Al escanear o escribir un SKU que ya existe en Firestore, el sistema muestra una alerta roja destacada, desactiva y bloquea el botón de guardar (`⛔ Código Duplicado (Bloqueado)`), e impide el envío tanto por clic como por tecla Enter. Doble verificación en Firestore antes de escribir.
* **📸 Doble Opción de Imagen:** En alta rápida, en el formulario admin y al promover a web, se ofrecen dos botones separados: **"📸 Tomar Foto"** (cámara directa del celular) y **"🖼️ Elegir de Galería"** (fotos previas o archivos de PC).
* **💻 Modo PC (Pistola de Códigos / Exclusivo Tienda Física / Rápido sin Foto):**
  - Diseñado para teclado y pistola lectora de códigos de barra.
  - Al tomar la prenda con el sticker ya pegado, se da el **pistolazo al código** (el cursor detecta el código y llena el campo SKU).
  - Valida en tiempo real si el SKU ya existe en Firestore o si es nuevo disponible.
  - Captura en segundos: **Nombre**, **Talla** (botones rápidos `CH`, `M`, `G`, `XL`, `Uni` + libre), **Categoría**, **Precio**, **Stock** y **Descripción**.
  - **Sin foto obligatoria:** Nace con `availableOnline: false` (o switch a elección).
  - **Comportamiento:** Se guarda al instante, suena tono de confirmación, se limpia el formulario y el cursor regresa al campo de código para la siguiente prenda sin tocar el ratón. Queda disponible de inmediato en caja POS pero **NO se publica en la web de clientes**.
* **📱 Modo Celular (Cámara Web + Foto para Tienda Web):**
  - Integra lector de código de barras móvil con cámara trasera (`html5-qrcode` en `CameraBarcodeScanner.jsx`).
  - Nace con `availableOnline: true` (se publica en catálogo web con foto y queda disponible en POS).
* **🔄 Promover a Web en 1 Clic:**
  - En la lista de inventario de Admin y POS, las prendas tienen insignias visibles: `🏬 Solo Tienda` vs `🌐 En Web`.
  - Cualquier prenda de "Solo Tienda" cuenta con un botón **"📸 Publicar en Web"** para tomarle foto o subirla de galería y activarla en el catálogo en línea.
* **Filtro Seguro de Catálogo:**
  - `Catalog.jsx` y `Home.jsx` filtran automáticamente cualquier artículo con `availableOnline === false`, evitando que clientes pidan prendas de exhibición física exclusiva.

### H. Modo de Escritorio Local (`Iniciar-POS.bat`)
* El encargado de caja solo hace doble clic en `Iniciar-POS.bat`.
* Levanta `server.cjs` en segundo plano en el puerto `4500`.
* Abre Google Chrome o Microsoft Edge en modo aplicación (`--app="http://localhost:4500/pos"`), luciendo como una aplicación nativa sin barra de direcciones.
* Maneja reentrancia: si ya está corriendo, no se traba y solo enfoca la ventana existente (`EADDRINUSE`).

### I. Pestaña de Inventario en Lista en POS (`/pos`)
* **Ubicación:** Accesible directamente desde la barra superior del POS con el botón `[ 📦 Inventario ]`, evitando salir al panel `/admin`.
* **Diseño Tipo Listado Compacto:** No muestra fotos pesadas por defecto para una lectura y navegación ultrarrápida.
* **Visor de Foto `👁️ Ver Foto`:** Enlace en cada fila que abre un modal con la fotografía de alta calidad en grande y precio al hacer clic.
* **Ajuste de Stock en 1 Clic:** Botones `[-]` y `[+]` directamente en la tabla para subir o bajar existencias sin abrir formularios.
* **Modal de Edición Rápida:** Botón `Edit` abre un modal en el POS para corregir nombre, precio, stock, talla, categoría y visibilidad web.
* **Control de Canal Inmediato:** Botón para alternar con un solo clic entre `🌐 En Web` y `🏬 Solo Tienda`.
* **Filtros Rápidos:** Buscador en tiempo real (SKU, nombre, talla, categoría) y pestañas rápidas (`Todos`, `Con Existencias`, `Agotados`, `En Web`, `Solo Tienda`).
* **Métricas en Vivo:** 4 tarjetas superiores con conteo de prendas totales, piezas únicas, artículos agotados y publicados en línea.

### J. Blindaje contra Valores `NaN` en Precios, Stock y Carrito
* **Carrito y Checkout:** Si el usuario borra el campo numérico de prendas en el carrito o envía un valor vacío/inválido, el sistema lo ajusta automáticamente a `1` (`Math.max(1, parseInt(...) || 1)`), impidiendo que se guarden valores `NaN` en las órdenes o en Firestore.
* **Edición de Stock:** Sanitización total en `Admin.jsx` y `POS.jsx` (`safeStock = isNaN(Number(stock)) ? 1 : Number(stock)`). Si un artículo tenía `stock: NaN` previamente, el formulario ya no se bloquea ni queda en blanco; permite modificarlo y restablecerlo a `1` u otra cantidad deseada sin trabas.
* **Pedidos Web en Vivo:** Si una orden antigua contiene campos no numéricos, los subtotales y totales se renderizan protegidamente calculando precios seguros y evitando mostrar `$NaN`.

### K. Opciones Duales para Fotos (Cámara y Galería)
* Los formularios de alta y edición tanto en `/admin` como en los modales incluyen dos botones separados:
  - 📸 **Tomar Foto:** Abre directamente la cámara del dispositivo móvil (`capture="environment"`).
  - 🖼️ **Subir de Galería:** Abre el explorador de archivos o la galería de imágenes del celular.

### L. Bloqueo Estricto de SKUs Duplicados
* Al capturar o escanear un SKU ya existente, el sistema muestra una alerta clara y deshabilita el botón de guardado en tiempo real, evitando prendas duplicadas con el mismo código.

### M. Calibración de Impresión de Etiquetas (24 por Hoja Carta)
* Plantilla calibrada para 24 etiquetas por hoja (3 columnas x 8 filas) en papel carta estándar (215.9 x 279.4 mm). Altura máxima bloqueada a 272mm con `overflow: hidden` para garantizar que no brinque a una segunda hoja vacía.

### N. Tratamiento de Ropa de Paca y Piezas Únicas en Catálogo Web
* Se eliminó el letrero flotante **"¡Últimas X!"** que aparecía sobre las fotografías de las prendas en el catálogo. Al tratarse de pacas de ropa americana de piezas únicas (stock = 1), el letrero tapaba las fotos y era redundante.
* Las fotos de las prendas ahora se muestran 100% limpias. En el pie de la tarjeta y modal de detalles se indica discretamente **"Pieza única"** cuando hay 1 disponible, o **"Agotado"** si se vendió.

### O. Ocultamiento Automático de Artículos Agotados en Web y Mostrador
* **Catálogo Web (`Catalog.jsx`, `Home.jsx`):** Cualquier artículo con `stock <= 0` (o inválido) es excluido automáticamente de la vista de los clientes. Solo se exhiben prendas con existencias reales.
* **Mostrador POS (`POS.jsx`):** La cuadrícula de cobro rápido de mostrador filtra automáticamente las prendas agotadas para evitar selecciones de prendas inexistentes.
* **Reactivación Automática desde Inventario:** En la pestaña **`📦 Inventario`** del POS y en `/admin`, todos los productos agotados siguen visibles y filtrables. En cuanto el encargado pulsa `[+]` o edita el stock a 1 o más, la prenda reaparece de inmediato tanto en el mostrador de caja como en la página web pública en tiempo real sin recargar.

### P. Control de Turnos por Empleado, Movimientos de Caja (Feria y Gastos) y Arqueo
* **Apertura de Turno:** Al iniciar jornada o cambio de empleado, se registra el nombre del cajero y el fondo inicial de monedas/cambio (`initialCash`, ej. $500).
* **Barra Informativa en Tiempo Real:** En el encabezado del POS muestra el cajero en turno, fondo, ventas en efectivo, feria agregada, gastos y el dinero exacto que debe haber en el cajón.
* **📥 Ingreso de Feria / Aporte de Bolsa:** Botón para inyectar cambio de dinero personal cuando falta feria. Se suma automáticamente al arqueo con motivo, fecha y cajero.
* **📤 Retiro de Efectivo / Gastos Menores:** Botón para registrar compras de insumos de la tienda (jabón, bolsas, garrafón, etc.). Se resta de la caja justificando la salida para no generar falsos faltantes.
* **🏁 Cierre de Turno y Arqueo (Corte Z):** Fórmula `Fondo Inicial + Ventas Efectivo + Entradas Feria - Gastos`. El cajero cuenta el dinero físico, lo anota y el sistema calcula la diferencia en vivo: `✅ Exacto ($0.00)`, `🔵 Sobrante` o `🔴 Faltante`.
* **Ticket de Corte Térmico Imprimible:** Genera comprobante con desglose de efectivo, tarjeta, transferencia, lista de gastos/feria y líneas de firma para cajero saliente y receptor.
* **Filtros Financieros por Periodo:** En la pestaña `Corte de Caja` permite alternar en 1 clic entre **Hoy**, **Esta Semana (7d)**, **Esta Quincena (15d)**, **Este Mes**, **Este Año** y **Historial Completo**.
* **Subpestañas de Reporte:** Desglose en 3 vistas: `📋 Ventas del Periodo`, `💸 Feria y Gastos (Movimientos)`, y `📑 Historial de Turnos y Cortes`.
* **Eficiencia en Plan Spark (Firebase):** Todos los cálculos, sumas y filtros se realizan en la memoria del navegador. Consumo adicional de lecturas: **0**. Totalmente gratis y ligero.

### Q. Control Multi-Usuario, Cambio de Guardia y Detección de Turno Olvidado
* **Botón `[ 👤 Cambiar Usuario ]`:** Ubicado en la cabecera superior del POS para que cualquier trabajador, el dueño o la esposa cierren sesión y permitan el acceso inmediato al siguiente usuario.
* **Bloqueo Estricto de Ventas con Caja Cerrada:** Si no hay un turno de caja abierto, el sistema no permite agregar prendas ni completar ventas en mostrador. El botón de cobro se convierte en `⚠️ Abrir Turno para Cobrar` y abre de inmediato la ventana de apertura con el fondo de caja.
* **Detección Automática de Turno Ajeno Abierto:** Si un trabajador olvida hacer el corte y otro usuario (dueño, esposa u otro compañero) inicia sesión, el sistema muestra una barra de alerta roja prioritaria:
  - Notifica quién abrió el turno, a qué hora, con cuánto fondo y cuánto dinero en ventas dejó.
  - Permite al nuevo usuario hacer el corte de entrega del turno anterior antes de vender, auditando y cuadrando el dinero para deslindar responsabilidades.
* **Protección Preventiva al Salir:** Si el cajero actual pulsa salir o cambiar de usuario teniendo un turno abierto con dinero en caja, el sistema le advierte que tiene un turno activo y le sugiere hacer el corte antes de marcharse.
* **Transición en 1 Clic:** Desde la misma ventana del Ticket de Corte impreso, el cajero saliente tiene el botón **`[ 🚪 Salir y Cambiar de Usuario Ahora ]`**, dejando la pantalla limpia en el login para quien lo supla.

### R. Reorganización del Menú, Bloqueo Total de Mostrador y Borrado Administrativo
* **Menú Superior Limpio y Diferenciado:**
  - **Vista Empleado/Cajero:** Pestañas estrictamente operativas: `🛒 Mostrador`, `📦 Inventario`, `⚡ Alta Rápida` (para dar de alta prendas en ratos libres con foto/código), `📦 Pedidos Web`, `💵 Caja / Turno` (turno del día, feria, gastos y corte) y botón `🚪 Cambiar Usuario`.
  - **Módulo `👑 Administración` (Exclusivo Admins):** Agrupa en un solo lugar con submenús:
    - `📊 Reportes y Finanzas`: Balances por periodos (Día, Semana, Quincena, Mes, Año, Todo), tabla de ventas (con botón de eliminar), tabla de feria/gastos (con botón de eliminar) y tabla de turnos históricos (con botón de ticket y botón de eliminar).
    - `🏷️ Hoja de Etiquetas`: Impresor masivo de 24 stickers por hoja carta.
    - `👥 Control de Personal`: Gestión de altas/bajas de empleados y administradores.
    - `⚙️ Configuración del Sistema`: Categorías dinámicas, datos de la tienda, teléfono/WhatsApp y APIs.
    - Enlaces rápidos externos: `↗ Panel Admin (/admin)` y `👁 Ver Tienda Web (/)`.
* **Bloqueo Infranqueable de Mostrador con Caja Cerrada:**
  - Al no haber turno activo (`!activeShift`), Mostrador queda cubierto por un telón visual con aviso: *"🔒 Caja Cerrada. Abre un turno para comenzar a vender."* y botón `🟢 Abrir Turno de Caja`.
  - El buscador por código SKU / pistola queda totalmente deshabilitado (`disabled`), el catálogo bloquea clics, el botón cobrar no opera y al cerrar turno se vacía el ticket con `setTicketItems([])`.
* **Borrado de Turnos y Movimientos de Prueba para Administrador:**
  - Columna de `Acciones` con botón rojo `🗑️ Borrar` para eliminar permanentemente turnos de prueba en Firestore (`deleteDoc`) y gastos/feria en el documento del turno (`updateDoc`), recalculando automáticamente los totales contables.

### S. Control de Inicio de Sesión Obligatorio, Apertura Inmediata y Reglas Firestore
* **Inicio de Sesión Obligatorio al Abrir Terminal (`Iniciar-POS.bat`):**
  * Se configuró el lanzador con `--app="http://localhost:4500/login?pos=1&fresh=1"`.
  * `Login.jsx` se optimizó para modo Terminal POS: limpia cualquier sesión residual previa para obligar al usuario (dueño, esposa o trabajador suplente) a identificarse con su correo y contraseña.
  * Al ingresar credenciales correctas, redirige directamente a `/pos`.
* **Apertura Inmediata de Caja y Nota de Corte Pendiente al Entrar:**
  * Al ingresar al POS, si la caja está cerrada (`!activeShift`), se abre de forma automática el modal de **Apertura de Turno** precargando el nombre del cajero y el fondo de $500 para activar el mostrador con un solo clic.
  * Si el cajero anterior dejó la caja abierta (`isForeignShiftOpen`), emerge de inmediato una **Nota de Alerta Prioritaria** advirtiendo que el turno previo no se cortó y ofreciendo el botón directo para realizar el corte de entrega antes de vender.
* **Reglas de Seguridad Firestore (`firestore.rules`):**
  * Declaración completa de permisos para `cash_shifts`, `cash_movements`, `orders`, `products` y `config`, eliminando el error `Missing or insufficient permissions` y asegurando que las eliminaciones solo sean permitidas a administradores (`isAdmin()`).

### T. Cobro Exclusivo en Efectivo y Visualización de Cortes de Caja
* **Cobro Exclusivo en Efectivo en Mostrador:**
  * Se removieron los botones de selección `Tarjeta` y `Transferencia` del panel derecho del ticket de venta.
  * El mostrador opera directamente con cálculo de efectivo, calculadora de cambio rápido con billetes ($100, $200, $500, $1000, Exacto) y botón de completar venta.
* **Visualización Completa de Cortes de Caja en Historial:**
  * Subpestaña `📑 Historial de Turnos` en `👑 Administración > Reportes y Finanzas`: renderizado de tabla detallada de cortes con cajero, hora de apertura/cierre, fondo inicial, ventas en efectivo, dinero esperado, dinero físico contado, diferencia contable (exacto, faltante, sobrante), botón `🧾 Ver Corte` (que abre el ticket térmico imprimible) y botón `🗑️ Borrar` para administradores.
  * Sección de `📑 Cortes de Caja y Turnos Anteriores` en la pestaña operativa `💵 Caja / Turno`: acceso rápido para consultar y reimprimir los últimos tickets de corte del día.

### U. Restricción de Acceso a Inventario Exclusiva para Administradores
* **Pestaña de Inventario Reservada para Administrador:**
  * La pestaña `📦 Inventario` solo es visible y cliqueable en la barra superior si el usuario autenticado tiene rol de Administrador (`isAdmin`).
  * Para los empleados/cajeros, la pestaña no aparece en pantalla.
  * Si un empleado intenta acceder directamente o cambiar el estado a inventario, un `useEffect` de protección lo detecta y lo redirige automáticamente a la pestaña operativa de `🛒 Mostrador`.

### V. Reconocimiento de Empleados en la Web y Acceso a Registrar Prendas
* **Detección Automática de Personal en Navbar:**
  * `Navbar.jsx` ahora consulta tanto `config/admins` como `config/staff`.
  * Si un empleado o cajero inicia sesión en la tienda web (desde PC o celular), el sistema reconoce inmediatamente su rol y le muestra en la barra de navegación:
    - **`⚡ REGISTRAR PRENDAS`** (enlace directo a `/admin` para dar de alta prendas, fotos, tallas y códigos).
    - **`🏪 PUNTO DE VENTA`** (enlace a `/pos` para operar mostrador y caja).
    - Badge identificador con su rol y nombre (`👔 Empleado: Nombre`).
    - Iconos móviles dedicados (`PackagePlus` y `Store`) para facilitar el registro de prendas directamente con la cámara del celular.
* **Permisos en Panel de Administración (`Admin.jsx`):**
  * Empleados autenticados y registrados en `config/staff` tienen acceso total al formulario de alta, edición de prendas y subida de imágenes, manteniendo restringida la eliminación y cambios de configuración sensible al administrador.

### W. Bloqueo de POS Móvil/Remoto para Empleados y Uso Exclusivo de Administrador
* **Restricción de Acceso al POS en Celulares e Internet:**
  * En la web pública y en celulares, el enlace y botón de `🏪 PUNTO DE VENTA` se muestra exclusivamente para Administradores (`isAdmin`).
  * Para los empleados, solo está visible `⚡ REGISTRAR PRENDAS` para dar de alta ropa.
  * Si un empleado intenta teclear directamente `/pos` desde un celular o de forma remota (`!isLocalTerminal`), el sistema lo bloquea con aviso de seguridad y lo redirige a `/admin`.
* **Modo de Emergencia por Contingencia (Laptop averiada o sin luz):**
  * Si ocurre una falla en la computadora de la tienda o no hay luz/internet, el Administrador (dueño) puede acceder desde su celular o prestar su usuario administrador al cajero temporalmente, ya que la cuenta `admin` tiene permiso total para operar el Punto de Venta desde cualquier celular o navegador.

---

## 📋 5. Comandos y Flujos de Trabajo Frecuentes

* **Instalar dependencias:** `npm install`
* **Compilar para producción:** `npm run build`
* **Modo desarrollo web:** `npm run dev`
* **Probar servidor local POS:** `npm run app` (o ejecutar `Iniciar-POS.bat`)
* **Iniciar con Electron:** `npm run electron:dev`

---

## 🎯 6. Roadmap y Próximos Pasos Pendientes
1. **Tickets Térmicos:** Generación de ticket de venta imprimible en formato de 58mm o 80mm al finalizar cobro en POS.
2. **Corte y Arqueo de Caja:** Registro de apertura de turno, entradas/salidas de efectivo y corte Z diario.
3. **Empaquetado de Instalador `.exe`:** Usar `electron-builder` para crear un instalador instalable con icono personalizado si se requiere prescindir de Chrome/Edge.
4. **Clientes Frecuentes / Créditos:** Posibilidad de asociar una venta a un cliente registrado o registrar fiados/abonos.

---

## ⚡ 7. Regla de Oro: Despliegue Continuo (Actualización en la Página en Vivo)
* **Obligatorio en cada turno:** Cada vez que se realice cualquier modificación, corrección o nueva funcionalidad:
  1. Ejecutar `npm run build` para compilar la versión de producción sin errores.
  2. Hacer `git commit` y `git push origin main`.
  3. Esto activa automáticamente el despliegue en la nube (Vercel), asegurando que tanto las computadoras como los celulares de los administradores y empleados siempre vean la versión más reciente en tiempo real.

---
*Documento actualizado automáticamente para servir de memoria persistente entre sesiones de trabajo.*
