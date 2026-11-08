import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import { 
  collection, onSnapshot, doc, getDoc, setDoc, writeBatch, 
  increment, addDoc, serverTimestamp, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { 
  ShoppingCart, Search, Plus, Minus, Trash2, Printer, 
  CheckCircle, Clock, Phone, MessageSquare, DollarSign, 
  CreditCard, RefreshCw, Barcode, Volume2, VolumeX, 
  ArrowLeft, Store, AlertCircle, Calendar, Users, ShieldCheck, UserPlus, Trash,
  Edit, Settings, FileText, X
} from 'lucide-react';
import { soundAlert } from '../utils/soundAlert';
import { getProductImage } from '../utils/productImages';
import BarcodeModal from '../components/BarcodeModal';
import useSEO from '../hooks/useSEO';
import './POS.css';

export default function POS() {
  useSEO({
    title: 'Punto de Venta (POS) - Tienda Alina',
    description: 'Sistema de punto de venta e inventario para mostrador y pedidos web en vivo.'
  });

  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Permisos y estados base
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'orders', 'report'
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Inventario y categorías
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['Todos']);
  const [selectedCat, setSelectedCat] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Carrito / Ticket de Mostrador
  const [ticketItems, setTicketItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('efectivo'); // 'efectivo', 'tarjeta', 'transferencia'
  const [cashGiven, setCashGiven] = useState('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [isEditingReceipt, setIsEditingReceipt] = useState(false);

  // Configuración del encabezado y pie del ticket impreso
  const [ticketConfig, setTicketConfig] = useState(() => {
    const saved = localStorage.getItem('alina_ticket_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      storeName: 'TIENDA ALINA',
      storeSubtitle: 'Jiménez American Style',
      storeAddress: 'Tienda Física y Online',
      storePhone: '',
      footerMessage: '¡Gracias por tu compra! ✨\nCambios válidos dentro de los primeros 7 días presentando este ticket.'
    };
  });
  const [showTicketConfigModal, setShowTicketConfigModal] = useState(false);

  // Concepto manual / extra en el ticket
  const [showManualItemForm, setShowManualItemForm] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');

  // Edición rápida de precio en el ticket
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemPrice, setEditingItemPrice] = useState('');

  // Filtros de historial para reimpresión en Corte de Caja
  const [reportDateFilter, setReportDateFilter] = useState('today'); // 'today' | 'all'
  const [reportSearch, setReportSearch] = useState('');

  // Pedidos Web en Tiempo Real
  const [webOrders, setWebOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('todos'); // 'todos', 'pendiente', 'en_camino', 'entregado'
  const [webOrderSearch, setWebOrderSearch] = useState('');
  const knownOrderIds = useRef(new Set());
  const initialLoadDone = useRef(false);

  // Modal de código de barras
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState(null);

  // Gestión de Usuarios y Roles (Administradores y Empleados)
  const [userRole, setUserRole] = useState('employee'); // 'admin' | 'employee'
  const [staffUsers, setStaffUsers] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('employee');
  const [adminEmails, setAdminEmails] = useState(['jomartin8264@gmail.com']);

  // Reloj en tiempo real
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Verificación de Roles y Permisos (Admin o Empleado)
  useEffect(() => {
    const checkAuthAndRoles = async () => {
      if (!currentUser) {
        navigate('/login');
        return;
      }
      try {
        const currentEmail = currentUser.email?.toLowerCase();

        // 1. Cargar lista de administradores tradicionales
        const adminSnap = await getDoc(doc(db, "config", "admins"));
        let aEmails = ['jomartin8264@gmail.com'];
        if (adminSnap.exists() && adminSnap.data().emails) {
          aEmails = adminSnap.data().emails;
        } else {
          await setDoc(doc(db, "config", "admins"), { emails: aEmails });
        }
        setAdminEmails(aEmails);

        // 2. Cargar lista de personal y roles detallados
        const staffSnap = await getDoc(doc(db, "config", "staff"));
        let sList = [];
        if (staffSnap.exists() && staffSnap.data().users) {
          sList = staffSnap.data().users;
        } else {
          // Inicializar staff con administradores existentes
          sList = aEmails.map(email => ({
            email: email.toLowerCase(),
            name: email.toLowerCase() === 'jomartin8264@gmail.com' ? 'JOMAR (Dueño)' : email.split('@')[0],
            role: 'admin',
            isMaster: email.toLowerCase() === 'jomartin8264@gmail.com',
            createdAt: new Date().toISOString()
          }));
          await setDoc(doc(db, "config", "staff"), { users: sList });
        }
        setStaffUsers(sList);

        // 3. Determinar rol del usuario actual
        const foundUser = sList.find(u => u.email?.toLowerCase() === currentEmail);
        const isMaster = currentEmail === 'jomartin8264@gmail.com';
        const isAdminUser = isMaster || aEmails.map(e => e.toLowerCase()).includes(currentEmail) || foundUser?.role === 'admin';
        const isEmployeeUser = foundUser?.role === 'employee';

        if (isAdminUser) {
          setUserRole('admin');
          setIsAdmin(true);
        } else if (isEmployeeUser) {
          setUserRole('employee');
          setIsAdmin(false);
        } else {
          alert("Acceso no autorizado al Punto de Venta.");
          navigate('/');
          return;
        }

        // Cargar configuración personalizada del ticket si existe en Firestore
        try {
          const ticketSnap = await getDoc(doc(db, "config", "ticketSettings"));
          if (ticketSnap.exists()) {
            setTicketConfig(prev => ({ ...prev, ...ticketSnap.data() }));
          } else {
            const storeSnap = await getDoc(doc(db, "config", "storeInfo"));
            if (storeSnap.exists()) {
              const sData = storeSnap.data();
              setTicketConfig(prev => ({
                ...prev,
                storeAddress: sData.address || prev.storeAddress,
                storePhone: sData.phone ? `Tel: ${sData.phone}` : prev.storePhone
              }));
            }
          }
        } catch (e) {
          console.warn("Ajustes locales del ticket cargados.");
        }
      } catch (err) {
        console.error("Error verificando permisos:", err);
      } finally {
        setLoadingAuth(false);
      }
    };
    checkAuthAndRoles();
  }, [currentUser, navigate]);

  // Manejo de usuarios y roles del personal
  const handleAddStaffUser = async (e) => {
    e.preventDefault();
    const email = newStaffEmail.trim().toLowerCase();
    const name = newStaffName.trim() || email.split('@')[0];
    const role = newStaffRole; // 'admin' | 'employee'

    if (!email || !email.includes('@')) {
      alert("Por favor ingresa un correo electrónico válido.");
      return;
    }

    if (staffUsers.some(u => u.email.toLowerCase() === email)) {
      alert("Este usuario ya está registrado en el equipo.");
      return;
    }

    try {
      const updatedUsers = [...staffUsers, {
        email,
        name,
        role,
        createdAt: new Date().toISOString()
      }];

      await setDoc(doc(db, "config", "staff"), { users: updatedUsers });
      setStaffUsers(updatedUsers);

      // Si es admin, sincronizar con config/admins
      if (role === 'admin') {
        const updatedAdmins = Array.from(new Set([...adminEmails, email]));
        await setDoc(doc(db, "config", "admins"), { emails: updatedAdmins });
        setAdminEmails(updatedAdmins);
      }

      setNewStaffEmail('');
      setNewStaffName('');
      setNewStaffRole('employee');
      alert(`✅ Usuario "${name}" (${email}) registrado con éxito como ${role === 'admin' ? '👑 Administrador' : '👔 Empleado'}.`);
    } catch (err) {
      console.error(err);
      alert("Error al registrar usuario: " + err.message);
    }
  };

  const handleToggleRole = async (userToToggle) => {
    if (userToToggle.email.toLowerCase() === 'jomartin8264@gmail.com') {
      alert("No se puede modificar el rol del dueño principal.");
      return;
    }
    const newRole = userToToggle.role === 'admin' ? 'employee' : 'admin';
    const confirmChange = window.confirm(
      `¿Deseas cambiar el rol de "${userToToggle.name || userToToggle.email}" a ${newRole === 'admin' ? '👑 Administrador (Acceso Total)' : '👔 Empleado (Ventas y Alta)'}?`
    );
    if (!confirmChange) return;

    try {
      const updatedUsers = staffUsers.map(u => {
        if (u.email.toLowerCase() === userToToggle.email.toLowerCase()) {
          return { ...u, role: newRole };
        }
        return u;
      });

      await setDoc(doc(db, "config", "staff"), { users: updatedUsers });
      setStaffUsers(updatedUsers);

      // Sincronizar config/admins
      const adminUsers = updatedUsers.filter(u => u.role === 'admin').map(u => u.email.toLowerCase());
      const newAdminEmails = Array.from(new Set(['jomartin8264@gmail.com', ...adminUsers]));
      await setDoc(doc(db, "config", "admins"), { emails: newAdminEmails });
      setAdminEmails(newAdminEmails);

      alert(`✅ Rol de ${userToToggle.name || userToToggle.email} actualizado a ${newRole === 'admin' ? 'Administrador' : 'Empleado'}.`);
    } catch (err) {
      console.error(err);
      alert("Error al cambiar rol: " + err.message);
    }
  };

  const handleRemoveStaffUser = async (emailToRemove) => {
    if (emailToRemove.toLowerCase() === 'jomartin8264@gmail.com') {
      alert("No se puede revocar el acceso del dueño principal.");
      return;
    }
    if (!window.confirm(`¿Revocar acceso al correo ${emailToRemove}? Ya no podrá entrar al Punto de Venta ni a registrar prendas.`)) {
      return;
    }
    try {
      const updatedUsers = staffUsers.filter(u => u.email.toLowerCase() !== emailToRemove.toLowerCase());
      await setDoc(doc(db, "config", "staff"), { users: updatedUsers });
      setStaffUsers(updatedUsers);

      const updatedAdmins = adminEmails.filter(e => e.toLowerCase() !== emailToRemove.toLowerCase());
      await setDoc(doc(db, "config", "admins"), { emails: updatedAdmins });
      setAdminEmails(updatedAdmins);

      alert(`✅ Acceso revocado para ${emailToRemove}`);
    } catch (err) {
      console.error(err);
      alert("Error al revocar permiso: " + err.message);
    }
  };

  // Eliminar prenda (Solo Administradores)
  const handleDeleteProduct = async (product) => {
    if (!isAdmin) {
      alert("Acceso denegado: Solo los administradores tienen permiso para eliminar prendas del inventario.");
      return;
    }
    if (!product || !product.id) return;
    const confirmDelete = window.confirm(
      `¿Deseas eliminar "${product.name}"?\n\nEsta acción borrará permanentemente la prenda del inventario (tanto de la tienda web como de la caja).`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "products", product.id));
      setTicketItems(prev => prev.filter(item => item.id !== product.id));
      soundAlert('success');
      alert(`✅ La prenda "${product.name}" ha sido eliminada.`);
    } catch (error) {
      console.error("Error al eliminar prenda:", error);
      soundAlert('error');
      alert("Error al eliminar la prenda: " + (error.message || error));
    }
  };

  // Eliminar registro de venta de mostrador o pedido (Solo Administradores)
  const handleDeleteSale = async (sale) => {
    if (!isAdmin) {
      alert("Acceso denegado: Solo los administradores pueden borrar registros de ventas.");
      return;
    }
    const folioStr = sale.folio || getOrderFolio(sale);
    const confirmDelete = window.confirm(
      `⚠️ ¿Estás seguro de ELIMINAR el registro de venta "${folioStr}"?\n\nCliente: ${sale.clientName}\nTotal: $${(sale.total || 0).toFixed(2)}\n\nEsta acción borrará permanentemente la venta de los reportes e historial contable.`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "orders", sale.id));
      soundAlert('success');
      alert(`✅ Registro de venta "${folioStr}" eliminado correctamente.`);
    } catch (err) {
      console.error("Error al eliminar venta:", err);
      soundAlert('error');
      alert("Error al eliminar registro: " + err.message);
    }
  };

  // Eliminar pedido web (Solo Administradores)
  const handleDeleteWebOrder = async (order) => {
    if (!isAdmin) {
      alert("Acceso denegado: Solo los administradores pueden eliminar pedidos web.");
      return;
    }
    const folioStr = order.folio || getOrderFolio(order);
    if (!window.confirm(`⚠️ ¿Eliminar permanentemente el pedido web "${folioStr}" de ${order.clientName}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "orders", order.id));
      soundAlert('success');
      alert(`✅ Pedido "${folioStr}" eliminado.`);
    } catch (err) {
      soundAlert('error');
      alert("Error al eliminar pedido: " + err.message);
    }
  };

  // 2. Suscripción en Tiempo Real a Productos / Inventario (Tanto Admin como Empleado)
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "products"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(list);

      // Extraer categorías únicas
      const cats = new Set(['Todos']);
      list.forEach(p => {
        if (p.category) cats.add(p.category);
      });
      setCategories(Array.from(cats));
    });

    return () => unsub();
  }, [currentUser]);

  // 3. Suscripción en Tiempo Real a Pedidos (Web + POS)
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "orders"), (snapshot) => {
      const ordersList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Ordenar por fecha más reciente
      ordersList.sort((a, b) => {
        const timeA = a.createdAtMillis || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAtMillis || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      // Detección de nuevos pedidos web pendientes para alerta sonora
      if (initialLoadDone.current && soundEnabled) {
        let hasNewPendingOrder = false;
        ordersList.forEach(order => {
          if (order.type === 'web' && order.status === 'pendiente' && !knownOrderIds.current.has(order.id)) {
            hasNewPendingOrder = true;
          }
        });
        if (hasNewPendingOrder) {
          soundAlert.playNewOrderChime();
        }
      }

      // Actualizar ids conocidos
      ordersList.forEach(order => knownOrderIds.current.add(order.id));
      initialLoadDone.current = true;

      setWebOrders(ordersList);
    });

    return () => unsub();
  }, [currentUser, soundEnabled]);

  // Manejo de búsqueda y pistola de código de barras
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      e.preventDefault();
      const code = searchQuery.trim().toLowerCase();
      // Buscar coincidencia exacta por código SKU
      const found = products.find(p => (p.code && p.code.toLowerCase() === code) || (p.sku && p.sku.toLowerCase() === code));
      if (found) {
        addToTicket(found);
        setSearchQuery('');
        if (soundEnabled) soundAlert.playBeep();
      } else {
        // Si no es código exacto, buscar por nombre
        const nameMatch = products.find(p => p.name.toLowerCase().includes(code));
        if (nameMatch) {
          addToTicket(nameMatch);
          setSearchQuery('');
          if (soundEnabled) soundAlert.playBeep();
        }
      }
    }
  };

  // Agregar prenda al ticket
  const addToTicket = (product) => {
    if (product.stock <= 0) {
      alert(`La prenda "${product.name}" no tiene existencias.`);
      return;
    }

    setTicketItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`No hay más existencias disponibles de "${product.name}". (Stock: ${product.stock})`);
          return prev;
        }
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prev, {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          code: product.code || '',
          category: product.category || '',
          image: product.image || '',
          quantity: 1,
          maxStock: product.stock
        }];
      }
    });
  };

  // Modificar cantidad en ticket
  const updateTicketQty = (id, delta) => {
    setTicketItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty > item.maxStock) {
          alert(`Existencias máximas alcanzadas (${item.maxStock})`);
          return item;
        }
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromTicket = (id) => {
    setTicketItems(prev => prev.filter(item => item.id !== id));
  };

  // Cálculos de total
  const ticketTotal = ticketItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const numCashGiven = Number(cashGiven) || 0;
  const changeAmount = paymentMethod === 'efectivo' && numCashGiven > ticketTotal ? (numCashGiven - ticketTotal) : 0;

  // Agregar concepto manual o personalizado al ticket (ej. arreglos, extras, bolsas)
  const handleAddCustomItem = (e) => {
    e.preventDefault();
    const name = customItemName.trim();
    const price = parseFloat(customItemPrice);
    if (!name || isNaN(price)) {
      alert("Por favor ingresa una descripción y un precio válido.");
      return;
    }

    const newItem = {
      id: `manual-${Date.now()}`,
      name: name,
      price: price,
      quantity: 1,
      isCustom: true,
      category: 'Manual / Extra',
      code: 'EXTRA'
    };

    setTicketItems(prev => [...prev, newItem]);
    setCustomItemName('');
    setCustomItemPrice('');
    setShowManualItemForm(false);
    if (soundEnabled) soundAlert('beep');
  };

  // Modificar precio unitario de una prenda en el ticket actual
  const handleSaveItemPrice = (itemId) => {
    const newPrice = parseFloat(editingItemPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      alert("Por favor ingresa un precio válido.");
      return;
    }
    setTicketItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, price: newPrice };
      }
      return item;
    }));
    setEditingItemId(null);
    setEditingItemPrice('');
  };

  // Guardar configuración del encabezado y pie del ticket
  const handleSaveTicketConfig = async (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('alina_ticket_config', JSON.stringify(ticketConfig));
      await setDoc(doc(db, "config", "ticketSettings"), ticketConfig, { merge: true });
      setShowTicketConfigModal(false);
      alert("✅ Datos del ticket actualizados correctamente.");
    } catch (err) {
      console.error(err);
      setShowTicketConfigModal(false);
    }
  };

  // Obtener folio formateado de cualquier orden (mostrador o web)
  const getOrderFolio = (order) => {
    if (!order) return 'TCK-0000';
    if (order.folio) return order.folio;
    const prefix = order.type === 'web' ? 'WEB' : 'TCK';
    if (order.id) {
      return `${prefix}-${order.id.slice(-5).toUpperCase()}`;
    }
    return `${prefix}-0000`;
  };

  // Generador de folio consecutivo y correlativo en base de datos
  const generateNextFolio = async (type = 'pos') => {
    const prefix = type === 'pos' ? 'TCK' : 'WEB';
    try {
      const counterRef = doc(db, "config", "counters");
      const counterSnap = await getDoc(counterRef);
      let currentNum = 1000;
      if (counterSnap.exists()) {
        const data = counterSnap.data();
        currentNum = data.ticketFolio || 1000;
      } else {
        currentNum = 1000 + (webOrders.length || 0);
      }
      const nextNum = currentNum + 1;
      await setDoc(counterRef, { ticketFolio: nextNum }, { merge: true });
      return `${prefix}-${nextNum}`;
    } catch (e) {
      console.warn("Aviso: usando fallback para folio:", e);
      const fallbackNum = 1001 + (webOrders.length || 0);
      return `${prefix}-${fallbackNum}`;
    }
  };

  // Abrir modal de ticket (para venta reciente, pedido web o reimpresión de historial)
  const openReceiptModal = (order) => {
    if (!order) return;
    const dateFormatted = order.createdAt?.seconds 
      ? new Date(order.createdAt.seconds * 1000).toLocaleString() 
      : (order.createdAtMillis ? new Date(order.createdAtMillis).toLocaleString() : new Date().toLocaleString());

    const folio = order.folio || getOrderFolio(order);

    setLastReceipt({
      id: order.id || 'NUEVO',
      folio: folio,
      type: order.type || 'web',
      items: order.items || [],
      total: Number(order.total) || 0,
      paymentMethod: order.paymentMethod || 'Web / Contra entrega',
      cashGiven: Number(order.cashGiven) || Number(order.total) || 0,
      change: Number(order.change) || 0,
      clientName: order.clientName || (order.type === 'pos' ? 'Venta en Mostrador' : 'Cliente Web'),
      clientPhone: order.clientPhone || '',
      clientAddress: order.clientAddress || '',
      clientNotes: order.clientNotes || '',
      dateFormatted
    });
    setIsEditingReceipt(false);
  };

  // Finalizar cobro en mostrador
  const handleCompleteSale = async () => {
    if (ticketItems.length === 0) return;
    
    // Si no escribieron efectivo o pusieron 0, asumir pago exacto
    const effectiveCashGiven = (paymentMethod === 'efectivo' && numCashGiven > 0) ? numCashGiven : ticketTotal;

    if (paymentMethod === 'efectivo' && numCashGiven > 0 && numCashGiven < ticketTotal) {
      alert(`El monto recibido en efectivo ($${numCashGiven.toFixed(2)}) es menor al total a cobrar ($${ticketTotal.toFixed(2)}).`);
      return;
    }

    const effectiveChange = paymentMethod === 'efectivo' && effectiveCashGiven >= ticketTotal ? (effectiveCashGiven - ticketTotal) : 0;

    setIsProcessingSale(true);
    try {
      // 1. Descontar inventario en lote solo para prendas del catálogo (excluyendo conceptos manuales)
      const catalogItems = ticketItems.filter(item => !item.isCustom && item.id && !String(item.id).startsWith('manual-'));
      if (catalogItems.length > 0) {
        const batch = writeBatch(db);
        for (const item of catalogItems) {
          const ref = doc(db, "products", item.id);
          batch.update(ref, { stock: increment(-item.quantity) });
        }
        await batch.commit();
      }

      // 2. Generar Folio consecutivo único
      const folio = await generateNextFolio('pos');

      // 3. Guardar venta en la colección 'orders' con tipo 'pos' y folio asignado
      const saleData = {
        folio,
        clientName: 'Cliente Mostrador (Venta Directa)',
        clientEmail: currentUser.email,
        clientPhone: '',
        clientAddress: 'Tienda Física Mostrador',
        clientNotes: `Cobro en ${paymentMethod.toUpperCase()}`,
        items: ticketItems.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          code: item.code || '',
          category: item.category || '',
          isCustom: !!item.isCustom
        })),
        total: ticketTotal,
        paymentMethod,
        cashGiven: paymentMethod === 'efectivo' ? effectiveCashGiven : ticketTotal,
        change: paymentMethod === 'efectivo' ? effectiveChange : 0,
        status: 'entregado',
        type: 'pos',
        createdAt: serverTimestamp(),
        createdAtMillis: Date.now()
      };

      const docRef = await addDoc(collection(db, "orders"), saleData);

      if (soundEnabled) soundAlert('beep');

      // 4. Mostrar ticket con folio generado listo para imprimir
      openReceiptModal({
        id: docRef.id,
        ...saleData,
        dateFormatted: new Date().toLocaleString()
      });

      // 4. Limpiar ticket
      setTicketItems([]);
      setCashGiven('');
    } catch (err) {
      console.error("Error al procesar la venta:", err);
      alert("Hubo un error al registrar la venta: " + (err.message || err));
    } finally {
      setIsProcessingSale(false);
    }
  };

  // Cambiar estado de un pedido web
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    } catch (err) {
      console.error("Error al actualizar pedido:", err);
      alert("No se pudo actualizar el estado.");
    }
  };

  // Filtrado de productos en mostrador
  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCat === 'Todos' || p.category === selectedCat;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || 
      p.name?.toLowerCase().includes(q) || 
      p.code?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // Pedidos Web filtrados (por estado y por búsqueda de folio / cliente)
  const filteredWebOrders = webOrders.filter(o => {
    if (o.type !== 'web') return false;
    if (orderFilter !== 'todos' && o.status !== orderFilter) return false;
    if (webOrderSearch.trim()) {
      const q = webOrderSearch.toLowerCase().trim();
      const folio = getOrderFolio(o).toLowerCase();
      const matchFolio = folio.includes(q) || (o.folio || '').toLowerCase().includes(q) || (o.id || '').toLowerCase().includes(q);
      const matchClient = (o.clientName || '').toLowerCase().includes(q);
      const matchPhone = (o.clientPhone || '').toLowerCase().includes(q);
      if (!matchFolio && !matchClient && !matchPhone) return false;
    }
    return true;
  });

  const pendingWebCount = webOrders.filter(o => o.type === 'web' && o.status === 'pendiente').length;

  // Cálculos para Corte de Caja (Hoy)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMillis = todayStart.getTime();

  const todaySales = webOrders.filter(o => {
    const time = o.createdAtMillis || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0);
    return time >= todayStartMillis && o.status !== 'cancelado';
  });

  const totalPosToday = todaySales.filter(o => o.type === 'pos').reduce((acc, o) => acc + (o.total || 0), 0);
  const totalWebToday = todaySales.filter(o => o.type === 'web').reduce((acc, o) => acc + (o.total || 0), 0);
  const totalGeneralToday = totalPosToday + totalWebToday;

  // Ventas filtradas para la tabla de Reporte / Reimpresión
  const displayedReportSales = webOrders.filter(o => {
    if (o.status === 'cancelado') return false;

    // Filtro por fecha (hoy o todas)
    if (reportDateFilter === 'today') {
      const time = o.createdAtMillis || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0);
      if (time < todayStartMillis) return false;
    }

    // Filtro por texto de búsqueda (cliente, folio, método, teléfono)
    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase().trim();
      const folio = getOrderFolio(o).toLowerCase();
      const matchFolio = folio.includes(q) || (o.folio || '').toLowerCase().includes(q) || (o.id || '').toLowerCase().includes(q);
      const matchClient = (o.clientName || '').toLowerCase().includes(q);
      const matchMethod = (o.paymentMethod || '').toLowerCase().includes(q);
      const matchPhone = (o.clientPhone || '').toLowerCase().includes(q);
      if (!matchFolio && !matchClient && !matchMethod && !matchPhone) return false;
    }

    return true;
  });

  if (loadingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff' }}>
        <p>Cargando Punto de Venta...</p>
      </div>
    );
  }

  return (
    <div className="pos-container">
      {/* HEADER POS */}
      <header className="pos-header">
        <div className="pos-brand">
          <Store size={26} color="#38bdf8" />
          <div>
            <h1>PUNTO DE VENTA • ALINA</h1>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Inventario Unificado Mostrador & Web • {currentTime}
            </div>
          </div>
        </div>

        {/* PESTAÑAS */}
        <div className="pos-tabs">
          <button 
            className={`pos-tab-btn ${activeTab === 'pos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pos')}
          >
            <ShoppingCart size={18} /> Mostrador
          </button>
          <button 
            className={`pos-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <Clock size={18} /> Pedidos Web
            {pendingWebCount > 0 && (
              <span className="pos-badge-alert">{pendingWebCount}</span>
            )}
          </button>
          <button 
            className={`pos-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => setActiveTab('report')}
          >
            <Calendar size={18} /> Corte de Caja
          </button>
          {isAdmin && (
            <button 
              className={`pos-tab-btn ${activeTab === 'team' ? 'active' : ''}`}
              onClick={() => setActiveTab('team')}
            >
              <Users size={18} /> Control de Usuarios
            </button>
          )}
        </div>

        {/* CONTROLES DERECHA */}
        <div className="pos-actions-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#1e293b', padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #334155', fontSize: '0.8rem' }}>
            <span style={{ color: isAdmin ? '#fbbf24' : '#38bdf8', fontWeight: 700 }}>
              {isAdmin ? '👑 Administrador' : '👔 Empleado'}
            </span>
            <span style={{ color: '#94a3b8' }}>({currentUser?.email?.split('@')[0]})</span>
          </div>

          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Sonido activado" : "Sonido desactivado"}
            style={{ background: '#334155', border: 'none', color: soundEnabled ? '#34d399' : '#94a3b8', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer' }}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <Link 
            to="/admin" 
            style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.85rem', padding: '0.5rem 0.8rem', background: '#334155', borderRadius: '6px' }}
          >
            Alta de Prendas
          </Link>
          <Link 
            to="/" 
            style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.85rem', padding: '0.5rem 0.8rem', background: 'rgba(56,189,248,0.15)', borderRadius: '6px' }}
          >
            Ver Tienda Web
          </Link>
        </div>
      </header>

      {/* CONTENIDO SEGÚN PESTAÑA */}
      {activeTab === 'pos' && (
        <div className="pos-layout">
          {/* SECCIÓN CATÁLOGO / PRODUCTOS */}
          <section className="pos-catalog-section">
            {/* Buscador inteligente */}
            <div className="pos-search-bar">
              <div className="pos-search-input-wrap">
                <Search size={18} />
                <input 
                  type="text" 
                  placeholder="Escribe el nombre de la prenda o código SKU (presiona Enter)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="pos-search-input"
                  autoFocus
                />
              </div>
            </div>

            {/* Filtro de Categorías */}
            <div className="pos-cat-filter">
              {categories.map(cat => (
                <button 
                  key={cat}
                  className={`pos-cat-pill ${selectedCat === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCat(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Grilla de Prendas */}
            <div className="pos-products-grid">
              {filteredProducts.map(p => {
                const isOutOfStock = p.stock <= 0;
                let badgeClass = 'good';
                if (isOutOfStock) badgeClass = 'empty';
                else if (p.stock <= 2) badgeClass = 'low';

                return (
                  <div 
                    key={p.id} 
                    className={`pos-card ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !isOutOfStock && addToTicket(p)}
                  >
                    <div className="pos-card-img-wrap">
                      <img 
                        src={getProductImage(p)} 
                        alt={p.name} 
                        className="pos-card-img" 
                        onError={(e) => { e.target.onerror = null; e.target.src = '/images/brand_logo_1774572391476.png'; }}
                      />
                    </div>
                    <div className="pos-card-body">
                      <div className="pos-card-title" title={p.name}>{p.name}</div>
                      <div className="pos-card-meta">
                        <span>{p.category || 'Ropa'}</span>
                        {(p.code || p.sku) && <span>SKU: {p.code || p.sku}</span>}
                      </div>
                      <div className="pos-card-footer">
                        <span className="pos-card-price">${Number(p.price).toFixed(2)}</span>
                        <span className={`pos-stock-badge ${badgeClass}`}>
                          {isOutOfStock ? 'Agotado' : `${p.stock} disp.`}
                        </span>
                      </div>
                      {p.createdByName && (
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.2rem' }}>
                          Alta: <span style={{ color: '#94a3b8' }}>{p.createdByName}</span>
                        </div>
                      )}
                      <div className="pos-card-actions">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBarcodeProduct(p);
                          }}
                          className="pos-btn-barcode"
                          title="Ver e imprimir código de barras"
                        >
                          <Barcode size={13} /> Código
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProduct(p);
                            }}
                            className="pos-btn-delete"
                            title="Eliminar prenda del inventario (Solo Administradores)"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SIDEBAR TICKET DE COBRO */}
          <aside className="pos-ticket-sidebar">
            <div className="pos-ticket-header">
              <h2>Ticket de Venta</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isAdmin && (
                  <button 
                    onClick={() => setShowTicketConfigModal(true)} 
                    style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    title="Configurar datos del encabezado y pie del ticket"
                  >
                    <Settings size={14} /> Configurar
                  </button>
                )}
                {ticketItems.length > 0 && (
                  <button 
                    onClick={() => setTicketItems([])} 
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    <Trash2 size={14} /> Vaciar
                  </button>
                )}
              </div>
            </div>

            {/* Formulario rápido para concepto manual / extra */}
            <div style={{ padding: '0 0.75rem' }}>
              {showManualItemForm ? (
                <form onSubmit={handleAddCustomItem} className="pos-manual-item-form">
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <input 
                      type="text" 
                      placeholder="Concepto (ej. Ajuste, Oferta)" 
                      value={customItemName} 
                      onChange={(e) => setCustomItemName(e.target.value)} 
                      required 
                      autoFocus
                      className="pos-input-sm"
                    />
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="Precio $" 
                      value={customItemPrice} 
                      onChange={(e) => setCustomItemPrice(e.target.value)} 
                      required 
                      style={{ width: '85px' }}
                      className="pos-input-sm"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="submit" className="pos-btn-add-manual">Agregar al Ticket</button>
                    <button type="button" onClick={() => setShowManualItemForm(false)} className="pos-btn-cancel-sm">Cancelar</button>
                  </div>
                </form>
              ) : (
                <button 
                  type="button" 
                  onClick={() => setShowManualItemForm(true)} 
                  className="pos-btn-open-manual"
                >
                  <Plus size={13} /> Agregar concepto manual / extra
                </button>
              )}
            </div>

            <div className="pos-ticket-items">
              {ticketItems.length === 0 ? (
                <div className="pos-ticket-empty">
                  <ShoppingCart size={40} />
                  <p>Selecciona prendas del catálogo o escribe el código para comenzar a cobrar.</p>
                </div>
              ) : (
                ticketItems.map(item => (
                  <div key={item.id} className="pos-row-info pos-ticket-row">
                    <div className="pos-row-info">
                      <div className="pos-row-name">
                        {item.name}
                        {item.isCustom && <span style={{ fontSize: '0.65rem', marginLeft: '0.3rem', color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>Manual</span>}
                      </div>
                      
                      {editingItemId === item.id ? (
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '0.2rem' }}>
                          <input 
                            type="number" 
                            step="0.01" 
                            value={editingItemPrice} 
                            onChange={(e) => setEditingItemPrice(e.target.value)} 
                            style={{ width: '70px', padding: '0.2rem 0.3rem', background: '#0f172a', border: '1px solid #38bdf8', color: '#fff', borderRadius: '4px', fontSize: '0.8rem' }}
                            autoFocus
                          />
                          <button 
                            onClick={() => handleSaveItemPrice(item.id)} 
                            style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            OK
                          </button>
                          <button 
                            onClick={() => setEditingItemId(null)} 
                            style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <div className="pos-row-sub">${item.price.toFixed(2)} c/u</div>
                          <button 
                            onClick={() => { setEditingItemId(item.id); setEditingItemPrice(item.price.toString()); }}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                            title="Modificar precio de este artículo"
                          >
                            <Edit size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="pos-row-qty-controls">
                      <button className="pos-qty-btn" onClick={() => updateTicketQty(item.id, -1)}><Minus size={12} /></button>
                      <span className="pos-row-qty">{item.quantity}</span>
                      <button className="pos-qty-btn" onClick={() => updateTicketQty(item.id, 1)}><Plus size={12} /></button>
                    </div>
                    <div className="pos-row-total">
                      ${(item.price * item.quantity).toFixed(2)}
                    </div>
                    <button className="pos-row-del" onClick={() => removeFromTicket(item.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* SECCIÓN DE COBRO */}
            <div className="pos-ticket-footer">
              <div className="pos-total-row">
                <span>Total a Cobrar:</span>
                <span style={{ color: '#34d399' }}>${ticketTotal.toFixed(2)}</span>
              </div>

              {/* Método de pago */}
              <div className="pos-payment-methods">
                <button 
                  className={`pos-method-btn ${paymentMethod === 'efectivo' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('efectivo')}
                >
                  <DollarSign size={16} /> Efectivo
                </button>
                <button 
                  className={`pos-method-btn ${paymentMethod === 'tarjeta' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('tarjeta')}
                >
                  <CreditCard size={16} /> Tarjeta
                </button>
                <button 
                  className={`pos-method-btn ${paymentMethod === 'transferencia' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('transferencia')}
                >
                  <RefreshCw size={16} /> Transfer.
                </button>
              </div>

              {/* Si es efectivo, cálculo de cambio */}
              {paymentMethod === 'efectivo' && (
                <div className="pos-cash-details">
                  <div className="pos-cash-input-row">
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Monto Recibido:</span>
                    <input 
                      type="number" 
                      placeholder="$0.00"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      className="pos-cash-input"
                    />
                  </div>
                  {/* Botones rápidos de billetes */}
                  <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    <button 
                      onClick={() => setCashGiven(ticketTotal.toString())}
                      style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem', background: '#334155', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Exacto
                    </button>
                    {[100, 200, 500, 1000].map(bill => (
                      <button 
                        key={bill}
                        onClick={() => setCashGiven(bill.toString())}
                        style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem', background: '#334155', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ${bill}
                      </button>
                    ))}
                  </div>

                  <div className="pos-change-row">
                    <span>Cambio:</span>
                    <span>${changeAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button 
                className="pos-checkout-btn"
                disabled={ticketItems.length === 0 || isProcessingSale}
                onClick={handleCompleteSale}
              >
                <CheckCircle size={20} />
                {isProcessingSale ? 'Registrando Venta...' : 'Completar Venta'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* PESTAÑA: PEDIDOS WEB EN VIVO */}
      {activeTab === 'orders' && (
        <div className="pos-orders-view">
          <div className="pos-orders-header">
            <div>
              <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>Pedidos Web en Vivo</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                Recepción en tiempo real de clientes que compraron a través de la página web.
              </p>
            </div>

            {/* Filtros de estado y buscador por folio */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="Buscar pedido por folio o cliente..." 
                value={webOrderSearch} 
                onChange={(e) => setWebOrderSearch(e.target.value)} 
                className="pos-input-sm"
                style={{ width: '230px', padding: '0.45rem 0.7rem' }}
              />

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {['todos', 'pendiente', 'en_camino', 'entregado'].map(st => (
                  <button
                    key={st}
                    onClick={() => setOrderFilter(st)}
                    className={`pos-cat-pill ${orderFilter === st ? 'active' : ''}`}
                  >
                    {st === 'todos' ? 'Todos los pedidos' : st.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredWebOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
              <Clock size={48} style={{ marginBottom: '1rem' }} />
              <h3>No hay pedidos web con este filtro</h3>
            </div>
          ) : (
            <div className="pos-orders-grid">
              {filteredWebOrders.map(order => {
                const dateStr = order.createdAt?.seconds 
                  ? new Date(order.createdAt.seconds * 1000).toLocaleString() 
                  : (order.createdAtMillis ? new Date(order.createdAtMillis).toLocaleString() : 'Reciente');

                // Enlace directo a WhatsApp con mensaje automático
                const itemsListText = (order.items || [])
                  .map(it => `• ${it.name} (x${it.quantity}) - $${(it.price * it.quantity).toFixed(2)}`)
                  .join('%0A');
                
                const waMessage = `¡Hola ${encodeURIComponent(order.clientName || 'Cliente')}! Te escribimos de Jiménez American Style sobre tu pedido web por un total de $${(order.total || 0).toFixed(2)}.%0A%0A*Prendas:*%0A${itemsListText}%0A%0A¿Confirmas tus datos para la entrega o entrega en tienda?`;
                const cleanPhone = (order.clientPhone || '').replace(/\D/g, '');
                const waUrl = `https://wa.me/52${cleanPhone}?text=${waMessage}`;

                return (
                  <div key={order.id} className={`pos-order-card status-${order.status || 'pendiente'}`}>
                    <div className="pos-order-top">
                      <div className="pos-client-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <span style={{ 
                            fontFamily: 'monospace', 
                            fontWeight: 700, 
                            color: '#38bdf8', 
                            background: 'rgba(56, 189, 248, 0.15)', 
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            padding: '0.15rem 0.5rem', 
                            borderRadius: '4px',
                            fontSize: '0.8rem'
                          }}>
                            FOLIO: {getOrderFolio(order)}
                          </span>
                        </div>
                        <h4>{order.clientName || 'Cliente Web'}</h4>
                        <div className="pos-client-detail">
                          <Phone size={14} /> {order.clientPhone || 'Sin teléfono'}
                        </div>
                        <div className="pos-client-detail">
                          <Store size={14} /> {order.clientAddress || 'Entrega a acordar'}
                        </div>
                        {order.clientNotes && (
                          <div className="pos-client-detail" style={{ color: '#fbbf24' }}>
                            Nota: {order.clientNotes}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.2rem 0.6rem', 
                          borderRadius: '9999px',
                          fontWeight: 700,
                          backgroundColor: order.status === 'pendiente' ? '#ef4444' : order.status === 'en_camino' ? '#f59e0b' : '#10b981',
                          color: '#fff'
                        }}>
                          {(order.status || 'pendiente').toUpperCase()}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                          {dateStr}
                        </div>
                      </div>
                    </div>

                    {/* Lista de prendas */}
                    <div className="pos-order-items-box">
                      {(order.items || []).map((it, idx) => (
                        <div key={idx} className="pos-order-item-line">
                          <span>{it.quantity}x {it.name}</span>
                          <span style={{ fontWeight: 600 }}>${(it.price * it.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pos-order-total-bar">
                      <span>Total:</span>
                      <span style={{ color: '#34d399' }}>${(order.total || 0).toFixed(2)} MXN</span>
                    </div>

                    {/* Acciones del pedido */}
                    <div className="pos-order-actions">
                      <button 
                        onClick={() => openReceiptModal(order)}
                        className="pos-btn-print-order"
                        title="Imprimir ticket para anexar al paquete o entrega"
                      >
                        <Printer size={15} /> Imprimir Ticket
                      </button>

                      {cleanPhone && (
                        <a 
                          href={waUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="pos-wa-btn"
                        >
                          <MessageSquare size={16} /> Contactar WhatsApp
                        </a>
                      )}
                      <select 
                        value={order.status || 'pendiente'}
                        onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                        style={{
                          background: '#334155',
                          border: '1px solid #475569',
                          color: '#fff',
                          borderRadius: '6px',
                          padding: '0.5rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="en_camino">En preparación / En camino</option>
                        <option value="entregado">Entregado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>

                      {isAdmin && (
                        <button 
                          onClick={() => handleDeleteWebOrder(order)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#ef4444',
                            borderRadius: '6px',
                            padding: '0.45rem 0.65rem',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Eliminar pedido web permanentemente (Solo Administrador)"
                        >
                          <Trash2 size={13} /> Borrar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA: CORTE DE CAJA / REPORTE */}
      {activeTab === 'report' && (
        <div className="pos-report-view">
          <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem' }}>Corte de Caja del Día</h2>

          <div className="pos-stats-grid">
            <div className="pos-stat-card">
              <h5>VENTAS TOTALES DE HOY</h5>
              <div className="stat-num" style={{ color: '#34d399' }}>
                ${totalGeneralToday.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                {todaySales.length} transacciones registradas hoy
              </div>
            </div>

            <div className="pos-stat-card">
              <h5>VENTAS EN MOSTRADOR (FÍSICA)</h5>
              <div className="stat-num">
                ${totalPosToday.toFixed(2)}
              </div>
            </div>

            <div className="pos-stat-card">
              <h5>VENTAS EN LÍNEA (WEB)</h5>
              <div className="stat-num" style={{ color: '#fbbf24' }}>
                ${totalWebToday.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Historial de Ventas</h3>
              <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.5rem' }}>
                <button 
                  onClick={() => setReportDateFilter('today')} 
                  className={`pos-cat-pill ${reportDateFilter === 'today' ? 'active' : ''}`}
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}
                >
                  Ventas de Hoy ({todaySales.length})
                </button>
                <button 
                  onClick={() => setReportDateFilter('all')} 
                  className={`pos-cat-pill ${reportDateFilter === 'all' ? 'active' : ''}`}
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}
                >
                  Todas las Ventas ({webOrders.filter(o => o.status !== 'cancelado').length})
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="text" 
                placeholder="Buscar por cliente o folio..." 
                value={reportSearch} 
                onChange={(e) => setReportSearch(e.target.value)} 
                className="pos-input-sm"
                style={{ width: '220px', padding: '0.45rem 0.7rem' }}
              />
            </div>
          </div>

          <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Folio</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Fecha/Hora</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Cliente</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Método</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {displayedReportSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No se encontraron ventas para este filtro o búsqueda.
                    </td>
                  </tr>
                ) : (
                  displayedReportSales.map(sale => {
                    const time = sale.createdAt?.seconds 
                      ? new Date(sale.createdAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) 
                      : (sale.createdAtMillis ? new Date(sale.createdAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '--:--');

                    return (
                      <tr key={sale.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ 
                            fontFamily: 'monospace', 
                            fontWeight: 700, 
                            color: '#38bdf8', 
                            background: 'rgba(56, 189, 248, 0.12)', 
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px',
                            fontSize: '0.85rem'
                          }}>
                            {getOrderFolio(sale)}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{time}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: sale.type === 'pos' ? 'rgba(56,189,248,0.2)' : 'rgba(251,191,36,0.2)',
                            color: sale.type === 'pos' ? '#38bdf8' : '#fbbf24'
                          }}>
                            {sale.type === 'pos' ? 'Mostrador' : 'Web'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{sale.clientName}</td>
                        <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>{sale.paymentMethod || 'Web'}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                          ${(sale.total || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                            <button 
                              onClick={() => openReceiptModal(sale)}
                              className="pos-btn-reprint"
                              title="Reimprimir ticket de esta compra"
                            >
                              <Printer size={13} /> Reimprimir
                            </button>
                            {isAdmin && (
                              <button 
                                onClick={() => handleDeleteSale(sale)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#ef4444',
                                  borderRadius: '5px',
                                  padding: '0.3rem 0.55rem',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                                title="Borrar registro de venta (Solo Administrador)"
                              >
                                <Trash2 size={13} /> Borrar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: CONTROL DE USUARIOS Y ROLES (ADMINISTRADORES Y EMPLEADOS) */}
      {activeTab === 'team' && isAdmin && (
        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          <div style={{ maxWidth: '850px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.6rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldCheck size={28} /> Control de Personal y Privilegios
              </h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Configura los accesos para tu equipo de trabajo con permisos diferenciados:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ background: '#1e293b', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    👑 Administrador (Tú y tu esposa)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                    • Acceso total al sistema.<br />
                    • Puede eliminar prendas del inventario.<br />
                    • Puede borrar registros de ventas.<br />
                    • Gestionar usuarios y roles del personal.
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    👔 Empleado (Cajeros / Vendedores)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                    • Cobrar ventas en mostrador e imprimir tickets.<br />
                    • Dar de alta artículos (se registra su nombre/autor).<br />
                    • ❌ <strong>No puede</strong> eliminar artículos ni borrar ventas.<br />
                    • ❌ <strong>No puede</strong> ver ni alterar usuarios.
                  </div>
                </div>
              </div>
            </div>

            {/* Formulario para registrar usuario con su rol */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={20} color="#38bdf8" /> Registrar o Autorizar Usuario
              </h3>
              <form onSubmit={handleAddStaffUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                      Correo Electrónico (Gmail / Cuenta de acceso):
                    </label>
                    <input 
                      type="email" 
                      required
                      placeholder="ejemplo: empleado@gmail.com" 
                      value={newStaffEmail} 
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                      className="pos-input-sm"
                      style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                      Nombre del Usuario / Empleado:
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="ej: Carlos Pérez (Cajero)" 
                      value={newStaffName} 
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="pos-input-sm"
                      style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                      Rol y Privilegios:
                    </label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value)}
                      className="pos-input-sm"
                      style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#0f172a' }}
                    >
                      <option value="employee">👔 Empleado (Ventas y alta de prendas)</option>
                      <option value="admin">👑 Administrador (Acceso Total)</option>
                    </select>
                  </div>
                </div>

                <button 
                  type="submit"
                  style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    alignSelf: 'flex-start'
                  }}
                >
                  <UserPlus size={18} /> Guardar Usuario en el Equipo
                </button>
              </form>
            </div>

            {/* Lista de usuarios con acceso */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>
                Equipo Autorizado ({staffUsers.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {staffUsers.map(user => {
                  const isMaster = user.email?.toLowerCase() === 'jomartin8264@gmail.com';
                  const isUserAdmin = user.role === 'admin';

                  return (
                    <div 
                      key={user.email}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '1rem',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ShieldCheck size={22} color={isUserAdmin ? '#fbbf24' : '#38bdf8'} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                              {user.name || user.email.split('@')[0]}
                            </span>
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.15rem 0.55rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                              background: isUserAdmin ? 'rgba(251,191,36,0.15)' : 'rgba(56,189,248,0.15)',
                              color: isUserAdmin ? '#fbbf24' : '#38bdf8',
                              border: isUserAdmin ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(56,189,248,0.3)'
                            }}>
                              {isUserAdmin ? '👑 Administrador' : '👔 Empleado'}
                            </span>
                            {isMaster && (
                              <span style={{ fontSize: '0.72rem', background: '#334155', color: '#fbbf24', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                Dueño Principal
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            {user.email}
                          </div>
                        </div>
                      </div>

                      {!isMaster ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            onClick={() => handleToggleRole(user)}
                            style={{
                              background: '#334155',
                              border: '1px solid #475569',
                              color: '#cbd5e1',
                              borderRadius: '6px',
                              padding: '0.4rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600
                            }}
                            title="Cambiar entre Administrador y Empleado"
                          >
                            Cambiar a {isUserAdmin ? 'Empleado' : 'Administrador'}
                          </button>
                          <button
                            onClick={() => handleRemoveStaffUser(user.email)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#ef4444',
                              borderRadius: '6px',
                              padding: '0.4rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <Trash size={14} /> Revocar
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Permanente</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE TICKET / RECIBO IMPRIMIBLE */}
      {lastReceipt && (
        <div className="pos-receipt-modal" onClick={() => setLastReceipt(null)}>
          <div className="pos-receipt-box" onClick={(e) => e.stopPropagation()}>
            {/* Panel de edición opcional antes de imprimir */}
            {isEditingReceipt && (
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem', color: '#1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>✏️ Editar Datos de este Ticket</strong>
                  <button 
                    onClick={() => setIsEditingReceipt(false)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Cerrar edición
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Folio del Ticket:</label>
                    <input 
                      type="text" 
                      value={lastReceipt.folio || ''} 
                      onChange={(e) => setLastReceipt(prev => ({ ...prev, folio: e.target.value }))}
                      style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Nombre del Cliente:</label>
                    <input 
                      type="text" 
                      value={lastReceipt.clientName || ''} 
                      onChange={(e) => setLastReceipt(prev => ({ ...prev, clientName: e.target.value }))}
                      style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Teléfono de contacto:</label>
                    <input 
                      type="text" 
                      value={lastReceipt.clientPhone || ''} 
                      onChange={(e) => setLastReceipt(prev => ({ ...prev, clientPhone: e.target.value }))}
                      style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Dirección de Entrega / Notas:</label>
                    <textarea 
                      rows={2}
                      value={lastReceipt.clientAddress || ''} 
                      onChange={(e) => setLastReceipt(prev => ({ ...prev, clientAddress: e.target.value }))}
                      style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Nota Especial:</label>
                    <input 
                      type="text" 
                      value={lastReceipt.clientNotes || ''} 
                      onChange={(e) => setLastReceipt(prev => ({ ...prev, clientNotes: e.target.value }))}
                      style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PAPEL DEL TICKET (LO QUE SE IMPRIME) */}
            <div id="printable-ticket" className="pos-receipt-paper">
              <div style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
                <div style={{ fontWeight: 'bold', fontSize: '1.15rem', letterSpacing: '0.5px' }}>
                  {ticketConfig.storeName || 'TIENDA ALINA'}
                </div>
                {ticketConfig.storeSubtitle && (
                  <div style={{ fontSize: '0.8rem', color: '#444', marginTop: '0.1rem' }}>
                    {ticketConfig.storeSubtitle}
                  </div>
                )}
                {ticketConfig.storeAddress && (
                  <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.1rem' }}>
                    {ticketConfig.storeAddress}
                  </div>
                )}
                {ticketConfig.storePhone && (
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {ticketConfig.storePhone}
                  </div>
                )}
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {lastReceipt.type === 'pos' ? '• VENTA EN MOSTRADOR •' : '• PEDIDO WEB / ENVÍO •'}
                </div>
                <div style={{ 
                  margin: '0.35rem 0', 
                  fontSize: '1.05rem', 
                  fontWeight: 800, 
                  letterSpacing: '1px',
                  borderTop: '1px dashed #bbb',
                  borderBottom: '1px dashed #bbb',
                  padding: '0.25rem 0',
                  color: '#000'
                }}>
                  FOLIO: {lastReceipt.folio || getOrderFolio(lastReceipt)}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#666' }}>Fecha: {lastReceipt.dateFormatted}</div>
              </div>

              <div style={{ borderBottom: '1px dashed #777', margin: '0.4rem 0' }} />

              {/* Datos del Cliente si existen */}
              {(lastReceipt.clientName || lastReceipt.clientPhone || lastReceipt.clientAddress || lastReceipt.clientNotes) && (
                <div style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                  {lastReceipt.clientName && <div><strong>Cliente:</strong> {lastReceipt.clientName}</div>}
                  {lastReceipt.clientPhone && <div><strong>Tel:</strong> {lastReceipt.clientPhone}</div>}
                  {lastReceipt.clientAddress && <div><strong>Dirección:</strong> {lastReceipt.clientAddress}</div>}
                  {lastReceipt.clientNotes && <div><strong>Nota:</strong> {lastReceipt.clientNotes}</div>}
                </div>
              )}

              <div style={{ borderBottom: '1px dashed #777', margin: '0.4rem 0' }} />

              {/* Desglose de artículos */}
              <div style={{ fontSize: '0.8rem' }}>
                {(lastReceipt.items || []).map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ maxWidth: '72%', wordBreak: 'break-word' }}>
                      {it.quantity}x {it.name}
                    </span>
                    <span style={{ fontWeight: 600 }}>${(it.price * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderBottom: '1px dashed #777', margin: '0.5rem 0' }} />

              {/* Totales */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem' }}>
                <span>TOTAL:</span>
                <span>${Number(lastReceipt.total || 0).toFixed(2)} MXN</span>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#444', marginTop: '0.3rem' }}>
                Método de Pago: {(lastReceipt.paymentMethod || 'Efectivo').toUpperCase()}
              </div>
              {lastReceipt.paymentMethod === 'efectivo' && (
                <div style={{ fontSize: '0.75rem', color: '#444' }}>
                  Recibido: ${Number(lastReceipt.cashGiven || lastReceipt.total).toFixed(2)} | Cambio: ${Number(lastReceipt.change || 0).toFixed(2)}
                </div>
              )}

              <div style={{ borderBottom: '1px dashed #777', margin: '0.5rem 0' }} />

              {/* Mensaje de pie / Políticas */}
              <div style={{ textAlign: 'center', marginTop: '0.6rem', fontSize: '0.72rem', color: '#333', whiteSpace: 'pre-line' }}>
                {ticketConfig.footerMessage || '¡Gracias por tu compra! ✨'}
              </div>
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.65rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={16} /> Imprimir Ticket
                </button>
                <button
                  onClick={() => setIsEditingReceipt(!isEditingReceipt)}
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.65rem 0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                  title="Editar cliente o notas antes de imprimir"
                >
                  <Edit size={14} /> {isEditingReceipt ? 'Ver Ticket' : 'Editar'}
                </button>
                <button
                  onClick={() => setLastReceipt(null)}
                  style={{
                    backgroundColor: '#e2e8f0',
                    color: '#1e293b',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.65rem 1rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CONFIGURAR ENCABEZADO Y PIE DEL TICKET */}
      {showTicketConfigModal && (
        <div className="pos-config-modal-overlay" onClick={() => setShowTicketConfigModal(false)}>
          <div className="pos-config-modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={20} /> Personalizar Datos del Ticket
              </h3>
              <button 
                onClick={() => setShowTicketConfigModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveTicketConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Nombre de la Tienda / Negocio:
                </label>
                <input 
                  type="text" 
                  value={ticketConfig.storeName} 
                  onChange={(e) => setTicketConfig({ ...ticketConfig, storeName: e.target.value })} 
                  className="input-field" 
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Subtítulo / Razón Social:
                </label>
                <input 
                  type="text" 
                  value={ticketConfig.storeSubtitle} 
                  onChange={(e) => setTicketConfig({ ...ticketConfig, storeSubtitle: e.target.value })} 
                  className="input-field" 
                  placeholder="ej: Jiménez American Style"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Dirección o Ciudad:
                </label>
                <input 
                  type="text" 
                  value={ticketConfig.storeAddress} 
                  onChange={(e) => setTicketConfig({ ...ticketConfig, storeAddress: e.target.value })} 
                  className="input-field" 
                  placeholder="ej: Calle Principal #123, Tienda Física"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Teléfono / WhatsApp de Contacto:
                </label>
                <input 
                  type="text" 
                  value={ticketConfig.storePhone} 
                  onChange={(e) => setTicketConfig({ ...ticketConfig, storePhone: e.target.value })} 
                  className="input-field" 
                  placeholder="ej: Tel: 55-1234-5678"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Mensaje al pie / Políticas de cambio y garantía:
                </label>
                <textarea 
                  rows={3}
                  value={ticketConfig.footerMessage} 
                  onChange={(e) => setTicketConfig({ ...ticketConfig, footerMessage: e.target.value })} 
                  className="input-field" 
                  style={{ resize: 'vertical' }}
                  placeholder="ej: ¡Gracias por tu compra! ✨&#10;Cambios válidos dentro de los primeros 7 días presentando este ticket."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Datos del Ticket
                </button>
                <button type="button" onClick={() => setShowTicketConfigModal(false)} className="btn">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA IMPRIMIR ETIQUETA DE CÓDIGO DE BARRAS */}
      {selectedBarcodeProduct && (
        <BarcodeModal 
          product={selectedBarcodeProduct} 
          onClose={() => setSelectedBarcodeProduct(null)} 
        />
      )}
    </div>
  );
}
