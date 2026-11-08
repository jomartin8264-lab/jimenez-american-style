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
   * **Configuración del Negocio:** Modificación de datos de empresa, teléfono de WhatsApp, llaves de API (Telegram / ImgBB) y formato de tickets.
   * **Protección Master:** La cuenta raíz `jomartin8264@gmail.com` está blindada contra revocación accidental de rol o eliminación.

2. **👔 Empleados (Cajeros / Personal de Tienda):**
   * **Ventas en Mostrador:** Cobro rápido, selección de método de pago, aplicación de descuentos y emisión de tickets.
   * **Alta de Prendas desde el Celular:** Pueden ingresar a `/admin` desde su smartphone para tomar fotos y publicar nuevas prendas. El SKU/Código de barras es **100% automático**.
   * **Auditoría y Trazabilidad:** Cada prenda registrada almacena automáticamente los campos `createdBy` (correo) y `createdByName` (nombre o alias del usuario), mostrándose claramente en las tarjetas de inventario y en el POS (`👤 Alta por: [Nombre]`).
   * **Pedidos Web y Reimpresión:** Pueden consultar pedidos recibidos por la web, imprimir sus tickets para empaque y buscar folios de tickets para reimpresión.
   * **Restricciones Estrictas:** No pueden eliminar prendas, no pueden eliminar ventas ni pedidos, no tienen acceso a la pestaña de usuarios ni a las configuraciones sensibles del sistema.

### C. Sistema de Folios, Búsqueda y Reimpresión de Tickets
* **Folios Únicos Oficiales:**
  - Mostrador / Físico: `TCK-XXXX` correlativo con fecha y hora exacta.
  - Tienda Online: `WEB-XXXX` generado al confirmar pedido en el carrito web.
* **Buscador en Tiempo Real:** Filtro instantáneo por folio, nombre de cliente o número telefónico tanto en **Corte de Caja** como en **Pedidos Web**.
* **Reimpresión Flexible:** Reimprime cualquier ticket pasado con opción de editar notas o datos de cliente antes de imprimir.
* **Edición en Caja:** Permite agregar conceptos manuales libres al ticket (arreglos, extras) y editar el precio de una prenda en mostrador antes de cobrar.

### D. Tienda Web y Administración Móvil
* **Captura Rápida desde Celular:** El usuario solo ingresa nombre, precio, stock, categoría y foto. El SKU/Código de barras es **100% automático** generado por el sistema sin intervención manual.
* Catálogo dinámico conectado a la misma colección de productos en Firestore.
* Carrito de compras reactivo con persistencia en `localStorage`.
* Pedido estructurado exportable a mensaje directo de WhatsApp.

### C. Modo de Escritorio Local (`Iniciar-POS.bat`)
* El encargado de caja solo hace doble clic en `Iniciar-POS.bat`.
* Levanta `server.cjs` en segundo plano en el puerto `4500`.
* Abre Google Chrome o Microsoft Edge en modo aplicación (`--app="http://localhost:4500/pos"`), luciendo como una aplicación nativa sin barra de direcciones.
* Maneja reentrancia: si ya está corriendo, no se traba y solo enfoca la ventana existente (`EADDRINUSE`).

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
