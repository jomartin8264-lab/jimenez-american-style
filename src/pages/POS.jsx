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
  Edit, Settings, FileText, X, Package, Eye, ExternalLink, Filter,
  Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, AlertTriangle, LogOut
} from 'lucide-react';
import { soundAlert } from '../utils/soundAlert';
import { getProductImage } from '../utils/productImages';
import BarcodeModal from '../components/BarcodeModal';
import BatchBarcodeModal from '../components/BatchBarcodeModal';
import QuickProductEntryModal from '../components/QuickProductEntryModal';
import { peekNextSkuNumber, resetSkuSequence } from '../utils/skuCounter';
import useSEO from '../hooks/useSEO';
import './POS.css';

export default function POS() {
  useSEO({
    title: 'Punto de Venta (POS) - Tienda Alina',
    description: 'Sistema de punto de venta e inventario para mostrador y pedidos web en vivo.'
  });

  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // Permisos y estados base
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'inventory', 'orders', 'cash', 'admin'
  const [adminSection, setAdminSection] = useState('reports'); // 'reports', 'labels', 'staff', 'config'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const [showPendingForeignCutModal, setShowPendingForeignCutModal] = useState(false);
  const hasAutoPromptedShiftRef = useRef(false);

  // Inventario y categorías
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['Todos']);
  const [selectedCat, setSelectedCat] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Estados para Pestaña de Inventario en Lista
  const [invSearch, setInvSearch] = useState('');
  const [invCategoryFilter, setInvCategoryFilter] = useState('Todos');
  const [invStatusFilter, setInvStatusFilter] = useState('all'); // 'all', 'in_stock', 'out_of_stock', 'web', 'store'
  const [editingProductInPOS, setEditingProductInPOS] = useState(null);
  const [editProdForm, setEditProdForm] = useState({
    name: '', price: '', stock: 1, size: 'M', category: 'Dama', availableOnline: true, description: ''
  });
  const [isSavingEditProd, setIsSavingEditProd] = useState(false);

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
  const [reportDateFilter, setReportDateFilter] = useState('today'); // 'today' | 'week' | 'fortnight' | 'month' | 'year' | 'all'
  const [reportSearch, setReportSearch] = useState('');
  const [reportSubTab, setReportSubTab] = useState('summary'); // 'summary' | 'movements' | 'shifts'

  // Control de Turnos y Movimientos de Caja (Entradas / Salidas / Feria / Gastos)
  const [shiftsList, setShiftsList] = useState([]);
  const [activeShift, setActiveShift] = useState(null);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [openShiftCashier, setOpenShiftCashier] = useState('');
  const [openShiftInitialCash, setOpenShiftInitialCash] = useState('500');
  const [openShiftNotes, setOpenShiftNotes] = useState('');
  const [isSavingShift, setIsSavingShift] = useState(false);

  const [showCashMovementModal, setShowCashMovementModal] = useState(null); // 'in' | 'out' | null
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [isSavingMovement, setIsSavingMovement] = useState(false);

  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [closeShiftCountedCash, setCloseShiftCountedCash] = useState('');
  const [closeShiftNotes, setCloseShiftNotes] = useState('');
  const [lastClosedShiftReceipt, setLastClosedShiftReceipt] = useState(null);

  // Helper de auditoría de pedidos web: verifica si un pedido ya fue cobrado y auditado en un corte de caja anterior
  const isOrderAudited = (order) => {
    if (!order) return false;
    if (order.shiftClosed) return true;
    if (order.shiftId) {
      const shift = shiftsList.find(s => s.id === order.shiftId);
      if (shift && shift.status === 'closed') return true;
    }
    if (order.status === 'entregado' && order.deliveredAtMillis && activeShift) {
      const shiftStart = activeShift.openedAtMillis || (activeShift.openedAt?.seconds ? activeShift.openedAt.seconds * 1000 : 0);
      if (order.deliveredAtMillis < shiftStart && order.shiftId !== activeShift.id) {
        return true;
      }
    }
    return false;
  };

  // Pedidos Web en Tiempo Real
  const [webOrders, setWebOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('todos'); // 'todos', 'pendiente', 'en_camino', 'entregado'
  const [webOrderSearch, setWebOrderSearch] = useState('');
  const [deliveringOrder, setDeliveringOrder] = useState(null);
  const [showDeliverPaymentModal, setShowDeliverPaymentModal] = useState(false);
  const knownOrderIds = useRef(new Set());
  const initialLoadDone = useRef(false);

  // Surtido y Empaque de Pedidos Web (Checklist y Fotos)
  const [pickedMap, setPickedMap] = useState(() => {
    try {
      const saved = localStorage.getItem('alina_picked_orders');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [previewImage, setPreviewImage] = useState(null);

  const toggleItemPicked = (orderId, itemId) => {
    const key = `${orderId}_${itemId}`;
    setPickedMap(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('alina_picked_orders', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    if (soundEnabled) soundAlert('beep');
  };

  // Modal de código de barras y alta rápida
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showQuickEntryModal, setShowQuickEntryModal] = useState(false);

  // Gestión de Usuarios y Roles (Administradores y Empleados)
  const [userRole, setUserRole] = useState('employee'); // 'admin' | 'employee'
  const [staffUsers, setStaffUsers] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('employee');
  const [adminEmails, setAdminEmails] = useState(['jomartin8264@gmail.com']);

  // Configuración del Sistema (movida desde Admin)
  const [configCategories, setConfigCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [storeInfo, setStoreInfo] = useState({ description: '', address: '', phone: '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [apiSettings, setApiSettings] = useState({
    telegramToken: '',
    telegramChatId: '',
    imgbbApiKey: ''
  });

  // Configuración de Folios y Numeración de Etiquetas
  const [nextSkuPreview, setNextSkuPreview] = useState(1001);
  const [skuInputVal, setSkuInputVal] = useState('1');
  const [isUpdatingSkuSeq, setIsUpdatingSkuSeq] = useState(false);

  useEffect(() => {
    if (adminSection === 'config') {
      peekNextSkuNumber().then(n => {
        if (n) {
          setNextSkuPreview(n);
          setSkuInputVal(String(n));
        }
      });
    }
  }, [adminSection]);

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
        navigate('/login?pos=1');
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
        const cleanEmails = aEmails.map(e => (typeof e === 'string' ? e.toLowerCase().trim() : ''));
        const foundUser = sList.find(u => (u.email || '').toLowerCase().trim() === currentEmail);
        const isMaster = currentEmail === 'jomartin8264@gmail.com';
        const isAdminUser = isMaster || cleanEmails.includes(currentEmail) || foundUser?.role === 'admin';
        const isEmployeeUser = foundUser?.role === 'employee' || Boolean(foundUser);

        // RESTRICCIÓN DE SEGURIDAD PARA EMPLEADOS (CELULARES / CASA):
        // Los empleados solo pueden operar el Punto de Venta desde la terminal física local de la tienda (localhost / 127.0.0.1).
        // Si entran por internet o celular, el acceso al POS está reservado exclusivamente para Administradores.
        const isLocalTerminal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isAdminUser && isEmployeeUser && !isLocalTerminal) {
          alert("🔒 Acceso Restringido: Como empleado, solo puedes usar el Punto de Venta en la computadora de mostrador de la tienda. El acceso remoto o desde celulares está reservado para Administradores.");
          navigate('/admin');
          return;
        }

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

        // Cargar datos de configuración del sistema (categorías, empresa, APIs)
        try {
          const catSnap = await getDoc(doc(db, "config", "categories"));
          if (catSnap.exists()) {
            setConfigCategories(catSnap.data().list || []);
          } else {
            const initial = ['Dama', 'Caballero', 'Niños', 'Accesorios', 'Otros'];
            await setDoc(doc(db, "config", "categories"), { list: initial });
            setConfigCategories(initial);
          }
        } catch (e) { console.warn("Error cargando categorías:", e); }

        try {
          const storeSnap2 = await getDoc(doc(db, "config", "storeInfo"));
          if (storeSnap2.exists()) setStoreInfo(storeSnap2.data());
        } catch (e) { console.warn("Error cargando storeInfo:", e); }

        try {
          const apiSnap = await getDoc(doc(db, "config", "apiSettings"));
          if (apiSnap.exists()) {
            const d = apiSnap.data();
            setApiSettings({
              telegramToken: d.telegramToken || '',
              telegramChatId: d.telegramChatId || '',
              imgbbApiKey: d.imgbbApiKey || ''
            });
          }
        } catch (e) { console.warn("Error cargando apiSettings:", e); }
      } catch (err) {
        console.error("Error verificando permisos:", err);
      } finally {
        setLoadingAuth(false);
      }
    };
    checkAuthAndRoles();
  }, [currentUser, navigate]);

  // Protección de seguridad: Si no es Administrador, impedir acceso a Inventario o Administración
  useEffect(() => {
    if (!loadingAuth && !isAdmin && (activeTab === 'inventory' || activeTab === 'admin')) {
      setActiveTab('pos');
    }
  }, [loadingAuth, isAdmin, activeTab]);

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

  // Handlers de Configuración del Sistema
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const updated = [...configCategories, newCatName.trim()];
    try {
      await setDoc(doc(db, "config", "categories"), { list: updated });
      setConfigCategories(updated);
      setNewCatName('');
    } catch (err) { alert("Error al guardar categoría"); }
  };

  const handleRemoveCategory = async (cat) => {
    if (configCategories.length <= 1) return alert("Debes tener al menos una categoría.");
    if (!window.confirm(`¿Eliminar la categoría "${cat}"?`)) return;
    const updated = configCategories.filter(c => c !== cat);
    await setDoc(doc(db, "config", "categories"), { list: updated });
    setConfigCategories(updated);
  };

  const handleSaveStoreInfo = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    await setDoc(doc(db, "config", "storeInfo"), storeInfo, { merge: true });
    alert("Contacto actualizado");
    setSavingInfo(false);
  };

  const handleSaveApiSettings = async (e) => {
    e.preventDefault();
    setSavingApi(true);
    try {
      await setDoc(doc(db, "config", "apiSettings"), apiSettings, { merge: true });
      alert("Configuración de APIs actualizada correctamente.");
    } catch (err) {
      alert("Error al guardar la configuración de APIs.");
    }
    setSavingApi(false);
  };

  // Funciones para la Gestión de Inventario en Lista
  const handleQuickStockChange = async (product, delta) => {
    const rawStock = (product.stock === null || product.stock === undefined || isNaN(Number(product.stock))) ? 0 : Number(product.stock);
    const newStock = Math.max(0, rawStock + delta);
    try {
      await updateDoc(doc(db, "products", product.id), { stock: newStock });
      soundAlert('beep');
    } catch (err) {
      alert("Error al actualizar existencias: " + (err.message || err));
    }
  };

  const handleToggleOnline = async (product) => {
    const nextStatus = product.availableOnline === false;
    try {
      await updateDoc(doc(db, "products", product.id), { availableOnline: nextStatus });
      soundAlert('beep');
    } catch (err) {
      alert("Error al cambiar canal de venta: " + (err.message || err));
    }
  };

  const handleOpenEditProduct = (product) => {
    const safeStock = (product.stock === null || product.stock === undefined || isNaN(Number(product.stock))) ? 1 : Number(product.stock);
    const safePrice = isNaN(Number(product.price)) ? '' : product.price;
    setEditProdForm({
      id: product.id,
      name: product.name || '',
      price: safePrice,
      stock: safeStock,
      size: product.size || 'M',
      category: product.category || categories[0] || 'Dama',
      code: product.code || product.sku || '',
      availableOnline: product.availableOnline !== false,
      description: product.description || ''
    });
    setEditingProductInPOS(product);
  };

  const handleSaveEditProduct = async (e) => {
    e.preventDefault();
    if (!editingProductInPOS) return;
    setIsSavingEditProd(true);
    try {
      const safeStock = isNaN(parseInt(editProdForm.stock, 10)) ? 1 : Math.max(0, parseInt(editProdForm.stock, 10));
      const safePrice = isNaN(Number(editProdForm.price)) ? 0 : Math.max(0, Number(editProdForm.price));

      await updateDoc(doc(db, "products", editingProductInPOS.id), {
        name: editProdForm.name.trim(),
        price: safePrice,
        stock: safeStock,
        size: editProdForm.size,
        category: editProdForm.category,
        availableOnline: Boolean(editProdForm.availableOnline),
        description: editProdForm.description || ''
      });

      soundAlert('success');
      alert(`✅ Prenda "${editProdForm.name}" actualizada con éxito.`);
      setEditingProductInPOS(null);
    } catch (err) {
      alert("Error al guardar cambios: " + (err.message || err));
    } finally {
      setIsSavingEditProd(false);
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

  // Eliminar turno de caja cerrado o de prueba (Solo Administradores)
  const handleDeleteShift = async (shift) => {
    if (!isAdmin) {
      alert("Acceso denegado: Solo los administradores pueden eliminar registros de turnos de caja.");
      return;
    }
    if (!shift || !shift.id) return;
    const cajero = shift.cashierName || shift.cashierEmail || 'Sin cajero';
    const fecha = shift.openedAtMillis ? new Date(shift.openedAtMillis).toLocaleString() : 'Fecha N/A';
    const confirmDelete = window.confirm(
      `⚠️ ¿Estás seguro de ELIMINAR permanentemente este registro de turno de caja?\n\nCajero: ${cajero}\nApertura: ${fecha}\nFondo inicial: $${Number(shift.initialCash || 0).toFixed(2)}\nVentas: $${Number(shift.salesCash || 0).toFixed(2)}\nTotal en caja: $${Number(shift.actualCash || shift.expectedCash || 0).toFixed(2)}\n\nEsta acción limpiará permanentemente este turno del historial.`
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "cash_shifts", shift.id));
      if (activeShift && activeShift.id === shift.id) {
        setActiveShift(null);
      }
      soundAlert('beep');
      alert(`✅ Registro del turno de "${cajero}" eliminado correctamente.`);
    } catch (err) {
      console.error("Error al eliminar turno:", err);
      soundAlert('error');
      alert("Error al eliminar turno: " + (err.message || err));
    }
  };

  // Eliminar movimiento de feria o gasto de prueba (Solo Administradores)
  const handleDeleteMovement = async (mov) => {
    if (!isAdmin) {
      alert("Acceso denegado: Solo los administradores pueden eliminar movimientos de caja.");
      return;
    }
    if (!mov || !mov.shiftId) {
      alert("No se pudo identificar el turno al que pertenece este movimiento.");
      return;
    }
    const tipo = mov.type === 'in' ? 'Entrada (Feria)' : 'Salida (Gasto)';
    const monto = Number(mov.amount || 0).toFixed(2);
    const confirmDelete = window.confirm(
      `⚠️ ¿Estás seguro de ELIMINAR permanentemente este movimiento de ${tipo}?\n\nMonto: $${monto}\nConcepto: "${mov.reason}"\nRegistró: ${mov.performedBy || mov.cashier || 'Cajero'}\n\nEsta acción limpiará este registro y recalculará los totales del turno.`
    );
    if (!confirmDelete) return;

    try {
      const shiftRef = doc(db, "cash_shifts", mov.shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (!shiftSnap.exists()) {
        alert("El turno al que pertenecía este movimiento ya no existe.");
        return;
      }
      const sData = shiftSnap.data();
      const currentMovs = sData.movements || [];
      const updatedMovs = currentMovs.filter(m => {
        if (mov.id && m.id) return m.id !== mov.id;
        if (mov.timeMillis && m.timeMillis) return m.timeMillis !== mov.timeMillis;
        return !(m.reason === mov.reason && Number(m.amount) === Number(mov.amount));
      });

      const newTotalIn = updatedMovs.filter(m => m.type === 'in').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
      const newTotalOut = updatedMovs.filter(m => m.type === 'out').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);

      const payload = {
        movements: updatedMovs,
        totalIn: newTotalIn,
        totalOut: newTotalOut
      };

      if (sData.status === 'closed') {
        const cashSales = Number(sData.salesCash) || 0;
        const initCash = Number(sData.initialCash) || 0;
        const expCash = initCash + cashSales + newTotalIn - newTotalOut;
        const actCash = Number(sData.actualCash) || 0;
        payload.expectedCash = expCash;
        payload.difference = actCash - expCash;
      }

      await updateDoc(shiftRef, payload);
      soundAlert('beep');
      alert("✅ Movimiento eliminado correctamente.");
    } catch (err) {
      console.error("Error al eliminar movimiento:", err);
      soundAlert('error');
      alert("Error al eliminar movimiento: " + (err.message || err));
    }
  };

  // 2. Suscripción en Tiempo Real a Productos / Inventario y Categorías
  useEffect(() => {
    if (!currentUser) return;

    let dbCategories = ['Dama', 'Caballero', 'Niños', 'Bebés', 'Accesorios', 'Calzado', 'Otros'];

    // Consultar categorías configuradas en la tienda
    getDoc(doc(db, "config", "categories")).then(snap => {
      if (snap.exists() && Array.isArray(snap.data().list) && snap.data().list.length > 0) {
        dbCategories = Array.from(new Set([...dbCategories, ...snap.data().list]));
        setCategories(prev => Array.from(new Set(['Todos', ...dbCategories, ...prev])));
      }
    }).catch(err => console.warn(err));

    const unsub = onSnapshot(collection(db, "products"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(list);

      // Extraer categorías únicas asegurando que siempre existan las básicas
      const cats = new Set(['Todos', ...dbCategories]);
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

  // 4. Suscripción en Tiempo Real a Turnos de Caja
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "cash_shifts"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.openedAtMillis || (a.openedAt?.seconds ? a.openedAt.seconds * 1000 : 0);
        const timeB = b.openedAtMillis || (b.openedAt?.seconds ? b.openedAt.seconds * 1000 : 0);
        return timeB - timeA;
      });
      setShiftsList(list);
      const openOne = list.find(s => s.status === 'open');
      setActiveShift(openOne || null);

      // Al entrar al aplicativo: si no hay turno abierto se levanta la caja automáticamente,
      // o si hay un turno de otro usuario sin corte, se muestra la nota de advertencia
      if (!hasAutoPromptedShiftRef.current) {
        hasAutoPromptedShiftRef.current = true;
        if (!openOne) {
          // Caja cerrada: levantar inmediatamente el modal de apertura con datos precargados
          setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
          setOpenShiftInitialCash('500');
          setShowOpenShiftModal(true);
        } else if (openOne.openedByEmail && openOne.openedByEmail.toLowerCase() !== currentUser?.email?.toLowerCase()) {
          // Turno ajeno sin corte: alertar con nota prominente
          setShowPendingForeignCutModal(true);
          soundAlert('error');
        }
      }
    }, (err) => console.warn("Aviso al cargar turnos:", err));

    return () => unsub();
  }, [currentUser]);

  // Manejo de búsqueda y pistola de código de barras
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      e.preventDefault();
      if (!activeShift) {
        soundAlert('error');
        alert("⚠️ La caja está CERRADA. Debes abrir un turno con tu fondo de caja antes de comenzar a vender prendas en mostrador.");
        setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
        setOpenShiftInitialCash('500');
        setShowOpenShiftModal(true);
        return;
      }
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
    // BLOQUEO ESTRICTO: No se pueden agregar prendas si la caja está cerrada
    if (!activeShift) {
      soundAlert('error');
      alert("⚠️ La caja está CERRADA. Debes abrir un turno con tu fondo de caja antes de comenzar a vender prendas en mostrador.");
      setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
      setOpenShiftInitialCash('500');
      setShowOpenShiftModal(true);
      return;
    }

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
    if (!activeShift) {
      soundAlert('error');
      alert("⚠️ La caja está CERRADA. Debes abrir un turno con tu fondo de caja antes de cobrar conceptos en mostrador.");
      setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
      setOpenShiftInitialCash('500');
      setShowOpenShiftModal(true);
      return;
    }
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

  // Handlers para Control de Turno y Movimientos de Caja
  const handleOpenShift = async (e) => {
    e.preventDefault();
    if (activeShift) {
      alert("Ya existe un turno abierto actualmente. Ciérralo antes de abrir uno nuevo.");
      return;
    }
    const initialCash = Math.max(0, Number(openShiftInitialCash) || 0);
    const cashier = openShiftCashier.trim() || currentUser.displayName || currentUser.email.split('@')[0];

    setIsSavingShift(true);
    try {
      const newShift = {
        status: 'open',
        openedAt: serverTimestamp(),
        openedAtMillis: Date.now(),
        openedByEmail: currentUser.email,
        cashierName: cashier,
        initialCash: initialCash,
        initialNotes: openShiftNotes.trim() || 'Apertura de turno',
        movements: [],
      };
      await addDoc(collection(db, "cash_shifts"), newShift);
      soundAlert('beep');
      setShowOpenShiftModal(false);
      setOpenShiftNotes('');
      alert(`✅ Turno abierto con éxito para ${cashier} con fondo inicial de $${initialCash.toFixed(2)}.`);
    } catch (err) {
      console.error(err);
      alert("Error al abrir turno: " + (err.message || err));
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleSaveCashMovement = async (e) => {
    e.preventDefault();
    if (!activeShift) {
      alert("No hay un turno de caja abierto. Abre un turno para registrar movimientos de dinero.");
      return;
    }
    const amount = Number(movementAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor ingresa un monto válido mayor a 0.");
      return;
    }
    if (!movementReason.trim()) {
      alert("Por favor escribe el motivo o concepto (ej. 'Jabón y bolsas' o 'Feria para dar cambio').");
      return;
    }

    setIsSavingMovement(true);
    try {
      const cashier = activeShift.cashierName || currentUser.displayName || currentUser.email.split('@')[0];
      const newMovement = {
        id: 'mov_' + Date.now(),
        type: showCashMovementModal, // 'in' or 'out'
        amount: amount,
        reason: movementReason.trim(),
        performedBy: cashier,
        performedByEmail: currentUser.email,
        timeMillis: Date.now(),
        timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const updatedMovements = [...(activeShift.movements || []), newMovement];
      await updateDoc(doc(db, "cash_shifts", activeShift.id), {
        movements: updatedMovements
      });

      soundAlert('beep');
      setShowCashMovementModal(null);
      setMovementAmount('');
      setMovementReason('');
      alert(`✅ ${showCashMovementModal === 'in' ? 'Entrada de feria/dinero' : 'Salida de dinero / gasto'} registrada con éxito: $${amount.toFixed(2)}.`);
    } catch (err) {
      console.error(err);
      alert("Error al registrar movimiento: " + (err.message || err));
    } finally {
      setIsSavingMovement(false);
    }
  };

  const handleCloseShift = async (e) => {
    e.preventDefault();
    if (!activeShift) return;

    const countedCash = Number(closeShiftCountedCash);
    if (isNaN(countedCash) || countedCash < 0) {
      alert("Por favor ingresa la cantidad física contada en caja (mínimo 0).");
      return;
    }

    setIsSavingShift(true);
    try {
      const shiftStart = activeShift.openedAtMillis || (activeShift.openedAt?.seconds ? activeShift.openedAt.seconds * 1000 : 0);
      const shiftSales = webOrders.filter(o => o.type === 'pos' && o.status !== 'cancelado' && (o.createdAtMillis || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0)) >= shiftStart);

      // Pedidos web cobrados en efectivo por mandaditos en este turno
      const shiftWebCashOrders = webOrders.filter(o => 
        o.type === 'web' && 
        o.status === 'entregado' && 
        o.addedToCash === true && 
        !o.shiftClosed && 
        (o.shiftId === activeShift.id || (!o.shiftId && (o.deliveredAtMillis || (o.deliveredAt?.seconds ? o.deliveredAt.seconds * 1000 : 0)) >= shiftStart))
      );
      const webCashSales = shiftWebCashOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

      const posCashSales = shiftSales.filter(s => s.paymentMethod === 'efectivo').reduce((acc, s) => acc + (Number(s.total) || 0), 0);
      const cashSales = posCashSales + webCashSales;
      const cardSales = shiftSales.filter(s => s.paymentMethod === 'tarjeta').reduce((acc, s) => acc + (Number(s.total) || 0), 0);
      const transferSales = shiftSales.filter(s => s.paymentMethod === 'transferencia').reduce((acc, s) => acc + (Number(s.total) || 0), 0);
      const totalSales = cashSales + cardSales + transferSales;

      const movements = activeShift.movements || [];
      const totalIn = movements.filter(m => m.type === 'in').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
      const totalOut = movements.filter(m => m.type === 'out').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);

      const expectedCash = (Number(activeShift.initialCash) || 0) + cashSales + totalIn - totalOut;
      const difference = countedCash - expectedCash;

      const closedData = {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedAtMillis: Date.now(),
        closedByEmail: currentUser.email,
        salesCash: cashSales,
        salesCard: cardSales,
        salesTransfer: transferSales,
        salesTotal: totalSales,
        salesCount: shiftSales.length,
        totalIn,
        totalOut,
        expectedCash,
        actualCash: countedCash,
        difference,
        closedNotes: closeShiftNotes.trim() || ''
      };

      await updateDoc(doc(db, "cash_shifts", activeShift.id), closedData);

      // Sellar pedidos web cobrados en este turno para que queden permanentemente auditados y cerrados
      if (shiftWebCashOrders.length > 0) {
        try {
          const batch = writeBatch(db);
          shiftWebCashOrders.forEach(o => {
            batch.update(doc(db, "orders", o.id), {
              shiftClosed: true,
              shiftClosedAt: serverTimestamp(),
              shiftClosedAtMillis: Date.now(),
              shiftClosedBy: currentUser.email,
              shiftClosedCashier: activeShift.cashierName || currentUser.displayName || currentUser.email,
              shiftId: activeShift.id
            });
          });
          await batch.commit();
        } catch (batchErr) {
          console.error("Error al sellar pedidos web en corte:", batchErr);
        }
      }

      soundAlert('success');
      setShowCloseShiftModal(false);
      setCloseShiftCountedCash('');
      setCloseShiftNotes('');
      // Limpiar ticket por seguridad al cerrar turno
      setTicketItems([]);

      // Modal de ticket de corte para imprimir
      const receiptData = {
        ...activeShift,
        ...closedData,
        id: activeShift.id,
        closedAtMillis: Date.now(),
        dateOpenedFormatted: new Date(shiftStart).toLocaleString(),
        dateClosedFormatted: new Date().toLocaleString()
      };
      setLastClosedShiftReceipt(receiptData);
      alert(`🏁 Turno cerrado con éxito. ${difference === 0 ? 'Caja cuadrada exacta.' : (difference > 0 ? `Sobrante de $${difference.toFixed(2)}` : `Faltante de $${Math.abs(difference).toFixed(2)}`)}`);
    } catch (err) {
      console.error(err);
      alert("Error al cerrar turno: " + (err.message || err));
    } finally {
      setIsSavingShift(false);
    }
  };

  // Manejo de Cierre de Sesión y Cambio de Usuario con Protección de Turno
  const handleUserLogout = async () => {
    // Si hay un turno activo a nombre del usuario actual, advertirle antes de salir
    if (activeShift && activeShift.openedByEmail?.toLowerCase() === currentUser?.email?.toLowerCase()) {
      setShowLogoutConfirmModal(true);
      return;
    }
    await executeLogout();
  };

  const executeLogout = async () => {
    try {
      setShowLogoutConfirmModal(false);
      await logout();
      navigate('/login?pos=1');
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
      alert("No se pudo cerrar la sesión: " + (err.message || err));
    }
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
      paymentMethod: order.paymentSubtype === 'mandaditos' ? 'Efectivo (Mandaditos)' : (order.paymentSubtype === 'banco' || order.paymentMethod === 'transferencia' ? 'Transferencia Bancaria' : (order.paymentMethod || 'Web / Contra entrega')),
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

  // Abrir modal de ticket de corte de caja / arqueo para reimpresión o consulta
  const openShiftReceiptModal = (shift) => {
    if (!shift) return;
    const dateOpenedFormatted = shift.openedAtMillis 
      ? new Date(shift.openedAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
      : (shift.openedAt?.seconds ? new Date(shift.openedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A');

    const dateClosedFormatted = shift.closedAtMillis
      ? new Date(shift.closedAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
      : (shift.closedAt?.seconds ? new Date(shift.closedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (shift.status === 'open' ? 'En curso (Abierto)' : 'N/A'));

    const receipt = {
      ...shift,
      dateOpenedFormatted,
      dateClosedFormatted,
      expectedCash: Number(shift.expectedCash != null ? shift.expectedCash : ((Number(shift.initialCash) || 0) + (Number(shift.salesCash) || 0) + (Number(shift.totalIn) || 0) - (Number(shift.totalOut) || 0))),
      actualCash: Number(shift.actualCash != null ? shift.actualCash : 0),
      difference: Number(shift.difference != null ? shift.difference : 0)
    };
    setLastClosedShiftReceipt(receipt);
  };

  // Finalizar cobro en mostrador
  const handleCompleteSale = async () => {
    if (ticketItems.length === 0) return;

    // BLOQUEO ESTRICTO: No se puede cobrar si la caja está cerrada
    if (!activeShift) {
      soundAlert('error');
      alert("⚠️ La caja está CERRADA. Debes abrir un turno con tu fondo de caja antes de realizar cobros en mostrador.");
      setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
      setOpenShiftInitialCash('500');
      setShowOpenShiftModal(true);
      return;
    }
    
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
        shiftId: activeShift ? activeShift.id : null,
        cashierName: activeShift?.cashierName || currentUser.displayName || currentUser.email.split('@')[0],
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

  // Cambiar estado de un pedido web con control de cobro para entregas y auditoría de cortes
  const handleUpdateOrderStatus = async (orderId, newStatus, orderObj) => {
    const order = orderObj || webOrders.find(o => o.id === orderId);
    if (!order) return;

    // 1. REGLA ESTRICTA: Si el pedido ya fue cerrado en un corte de caja anterior, NO se puede alterar
    if (isOrderAudited(order)) {
      soundAlert('error');
      alert(`🔒 PEDIDO AUDITADO Y CERRADO:\n\nEste pedido ya fue cobrado e ingresado en el corte de caja de un turno anterior (Atendido por: ${order.shiftClosedCashier || order.deliveredBy || 'Cajero anterior'}).\n\nNo se puede reactivar ni modificar para no alterar los cortes ya realizados.`);
      return;
    }

    // 2. REGLA PARA EMPLEADOS: Los empleados no pueden reabrir ni modificar pedidos ya entregados
    if (!isAdmin && order.status === 'entregado') {
      soundAlert('error');
      alert("⚠️ Solo los administradores pueden modificar o reabrir un pedido que ya fue marcado como ENTREGADO.");
      return;
    }

    // 3. Si van a marcar como entregado y es un pedido web: preguntar método de cobro
    if (newStatus === 'entregado') {
      if (order.type !== 'pos') {
        setDeliveringOrder(order);
        setShowDeliverPaymentModal(true);
        return;
      }
    }

    try {
      const payload = { status: newStatus };
      // Si cambian a otro estado que no sea entregado, retirar la bandera de cobro en caja
      if (newStatus !== 'entregado') {
        payload.addedToCash = false;
        payload.paymentSubtype = null;
        payload.shiftId = null;
      }
      await updateDoc(doc(db, "orders", orderId), payload);
      soundAlert('beep');
    } catch (err) {
      console.error("Error al actualizar pedido:", err);
      alert("No se pudo actualizar el estado: " + err.message);
    }
  };

  // Confirmar entrega con método de cobro (Transferencia vs Mandaditos / Efectivo)
  const handleConfirmDeliveryPayment = async (paymentType) => {
    if (!deliveringOrder) return;

    // Verificación de seguridad: no permitir cobrar si ya fue auditado en turno anterior
    if (isOrderAudited(deliveringOrder)) {
      soundAlert('error');
      alert(`🔒 PEDIDO YA AUDITADO:\n\nEste pedido ya fue entregado y cerrado en un turno de caja anterior.\nNo se puede volver a cobrar en el turno actual.`);
      setShowDeliverPaymentModal(false);
      setDeliveringOrder(null);
      return;
    }

    try {
      const orderId = deliveringOrder.id;
      const isCash = paymentType === 'mandaditos';

      const payload = {
        status: 'entregado',
        paymentMethod: isCash ? 'efectivo' : 'transferencia',
        paymentSubtype: isCash ? 'mandaditos' : 'banco',
        addedToCash: isCash,
        deliveredAt: serverTimestamp(),
        deliveredAtMillis: Date.now(),
        deliveredBy: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero',
        shiftId: isCash && activeShift ? activeShift.id : null
      };

      await updateDoc(doc(db, "orders", orderId), payload);
      soundAlert('beep');
      setShowDeliverPaymentModal(false);
      setDeliveringOrder(null);
      
      if (isCash) {
        alert(`✅ Pedido entregado y cobrado por Mandaditos.\n\nSe sumaron $${Number(deliveringOrder.total || 0).toFixed(2)} MXN en efectivo a la caja de tu turno.`);
      } else {
        alert(`✅ Pedido entregado y registrado por Transferencia.\n\nNO se agregó dinero a la caja física (el dinero quedó en cuenta bancaria).`);
      }
    } catch (err) {
      console.error("Error al confirmar entrega:", err);
      soundAlert('error');
      alert("Error al confirmar entrega: " + err.message);
    }
  };

  // Filtrado de productos en mostrador (solo artículos con existencias disponibles)
  const filteredProducts = products.filter(p => {
    const rawStock = (p.stock === null || p.stock === undefined || isNaN(Number(p.stock))) ? 0 : Number(p.stock);
    if (rawStock <= 0) return false;

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

  // Cálculos del Turno Activo (para la barra superior y cierre de turno)
  const shiftStartMillis = activeShift ? (activeShift.openedAtMillis || (activeShift.openedAt?.seconds ? activeShift.openedAt.seconds * 1000 : 0)) : 0;
  
  // 1. Ventas de mostrador del turno
  const currentShiftPosSales = activeShift ? webOrders.filter(o => o.type === 'pos' && o.status !== 'cancelado' && (o.createdAtMillis || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0)) >= shiftStartMillis) : [];
  
  // 2. Pedidos Web entregados en este turno y cobrados por Mandaditos (Efectivo físico a caja)
  const currentShiftWebCashOrders = activeShift ? webOrders.filter(o => {
    if (o.type !== 'web') return false;
    if (o.status !== 'entregado') return false;
    if (!o.addedToCash) return false;
    if (o.shiftClosed) return false;
    if (o.shiftId && o.shiftId !== activeShift.id) return false;
    const deliveredTime = o.deliveredAtMillis || (o.deliveredAt?.seconds ? o.deliveredAt.seconds * 1000 : 0);
    if (!o.shiftId && deliveredTime < shiftStartMillis) return false;
    return true;
  }) : [];
  const currentShiftWebCashTotal = currentShiftWebCashOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  const currentShiftSales = [...currentShiftPosSales, ...currentShiftWebCashOrders];
  const currentShiftPosCashSales = currentShiftPosSales.filter(s => s.paymentMethod === 'efectivo').reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const currentShiftCashSales = currentShiftPosCashSales + currentShiftWebCashTotal;
  const currentShiftCardSales = currentShiftPosSales.filter(s => s.paymentMethod === 'tarjeta').reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const currentShiftTransferSales = currentShiftPosSales.filter(s => s.paymentMethod === 'transferencia').reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const currentShiftTotalSales = currentShiftCashSales + currentShiftCardSales + currentShiftTransferSales;
  const currentShiftMovements = activeShift?.movements || [];
  const currentShiftTotalIn = currentShiftMovements.filter(m => m.type === 'in').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const currentShiftTotalOut = currentShiftMovements.filter(m => m.type === 'out').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const currentShiftExpectedCash = activeShift ? ((Number(activeShift.initialCash) || 0) + currentShiftCashSales + currentShiftTotalIn - currentShiftTotalOut) : 0;
  const currentShiftPiecesCount = currentShiftSales.reduce((acc, s) => acc + (s.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1), 0), 0);

  // Detección de Turno Ajeno Abierto (el usuario anterior no hizo corte)
  const isForeignShiftOpen = Boolean(
    activeShift &&
    currentUser &&
    activeShift.openedByEmail &&
    activeShift.openedByEmail.toLowerCase() !== currentUser.email?.toLowerCase()
  );

  // Periodos de Fecha para Reportes: Hoy, Semana, Quincena, Mes, Año, Todo
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  const fortnightStart = now.getTime() - (15 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  const isOrderInReportPeriod = (o) => {
    if (o.status === 'cancelado') return false;
    const time = o.createdAtMillis || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0);
    if (reportDateFilter === 'today') return time >= todayStart;
    if (reportDateFilter === 'week') return time >= weekStart;
    if (reportDateFilter === 'fortnight') return time >= fortnightStart;
    if (reportDateFilter === 'month') return time >= monthStart;
    if (reportDateFilter === 'year') return time >= yearStart;
    return true; // 'all'
  };

  const periodSales = webOrders.filter(isOrderInReportPeriod);
  const periodPosSales = periodSales.filter(o => o.type === 'pos');
  const periodWebSales = periodSales.filter(o => o.type === 'web');

  const periodTotal = periodSales.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  const periodPosTotal = periodPosSales.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  const periodWebTotal = periodWebSales.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  const periodCashTotal = periodSales.filter(o => o.paymentMethod === 'efectivo').reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  const periodCardTotal = periodSales.filter(o => o.paymentMethod === 'tarjeta').reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  const periodTransferTotal = periodSales.filter(o => o.paymentMethod === 'transferencia').reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  const periodPiecesCount = periodSales.reduce((acc, o) => acc + (o.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1), 0), 0);

  // Movimientos de dinero en el periodo seleccionado (recorriendo turnos del periodo)
  const periodShifts = shiftsList.filter(s => {
    const time = s.openedAtMillis || (s.openedAt?.seconds ? s.openedAt.seconds * 1000 : 0);
    if (reportDateFilter === 'today') return time >= todayStart;
    if (reportDateFilter === 'week') return time >= weekStart;
    if (reportDateFilter === 'fortnight') return time >= fortnightStart;
    if (reportDateFilter === 'month') return time >= monthStart;
    if (reportDateFilter === 'year') return time >= yearStart;
    return true;
  });

  const periodAllMovements = [];
  periodShifts.forEach(s => {
    (s.movements || []).forEach(m => {
      periodAllMovements.push({ ...m, shiftId: s.id, cashier: s.cashierName });
    });
  });
  periodAllMovements.sort((a, b) => (b.timeMillis || 0) - (a.timeMillis || 0));

  const periodMovementsInTotal = periodAllMovements.filter(m => m.type === 'in').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const periodMovementsOutTotal = periodAllMovements.filter(m => m.type === 'out').reduce((acc, m) => acc + (Number(m.amount) || 0), 0);

  // Ventas filtradas con buscador para la tabla
  const displayedReportSales = periodSales.filter(o => {
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

  // Productos filtrados para la Pestaña de Inventario (Tabla)
  const filteredInventoryProducts = products.filter(p => {
    // 1. Filtro por categoría
    if (invCategoryFilter !== 'Todos' && p.category !== invCategoryFilter) {
      return false;
    }
    // 2. Filtro por estatus / canal
    const pStock = (p.stock === null || p.stock === undefined || isNaN(Number(p.stock))) ? 0 : Number(p.stock);
    if (invStatusFilter === 'in_stock' && pStock <= 0) return false;
    if (invStatusFilter === 'out_of_stock' && pStock > 0) return false;
    if (invStatusFilter === 'web' && p.availableOnline === false) return false;
    if (invStatusFilter === 'store' && p.availableOnline !== false) return false;

    // 3. Filtro por búsqueda
    if (invSearch.trim()) {
      const q = invSearch.toLowerCase().trim();
      const code = (p.code || p.sku || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const size = (p.size || '').toLowerCase();
      if (!code.includes(q) && !name.includes(q) && !cat.includes(q) && !size.includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Estadísticas rápidas de inventario
  const totalPiecesInStock = products.reduce((acc, p) => {
    const s = (p.stock === null || p.stock === undefined || isNaN(Number(p.stock))) ? 0 : Number(p.stock);
    return acc + Math.max(0, s);
  }, 0);
  const outOfStockCount = products.filter(p => {
    const s = (p.stock === null || p.stock === undefined || isNaN(Number(p.stock))) ? 0 : Number(p.stock);
    return s <= 0;
  }).length;
  const webPublishedCount = products.filter(p => p.availableOnline !== false).length;

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

        {/* PESTAÑAS PRINCIPALES */}
        <div className="pos-tabs">
          <button 
            className={`pos-tab-btn ${activeTab === 'pos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pos')}
          >
            <ShoppingCart size={18} /> Mostrador
          </button>
          {isAdmin && (
            <button 
              className={`pos-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
            >
              <Package size={18} /> Inventario
            </button>
          )}
          <button 
            type="button"
            className="pos-tab-btn"
            onClick={() => setShowQuickEntryModal(true)}
            style={{ 
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}
            title="Alta ultrarrápida escaneando código ya pegado (PC o Celular)"
          >
            ⚡ Alta Rápida
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
            className={`pos-tab-btn ${activeTab === 'cash' ? 'active' : ''}`}
            onClick={() => setActiveTab('cash')}
          >
            <Wallet size={18} /> Caja / Turno
          </button>
          {isAdmin && (
            <button 
              className={`pos-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('admin');
                setAdminSection('reports');
              }}
              style={{
                backgroundColor: activeTab === 'admin' ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
                color: activeTab === 'admin' ? '#0f172a' : '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                fontWeight: 800
              }}
            >
              👑 Administración
            </button>
          )}
        </div>

        {/* CONTROLES DERECHA */}
        <div className="pos-actions-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#1e293b', padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #334155', fontSize: '0.8rem' }}>
            <span style={{ color: isAdmin ? '#fbbf24' : '#38bdf8', fontWeight: 700 }}>
              {isAdmin ? '👑 Admin' : '👔 Cajero'}
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

          <button
            type="button"
            onClick={handleUserLogout}
            title="Cerrar sesión actual o cambiar de usuario"
            style={{
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              fontSize: '0.85rem',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <LogOut size={15} /> Cambiar Usuario
          </button>
        </div>
      </header>

      {/* ALERTA CRÍTICA: TURNO ANTERIOR PENDIENTE DE CORTE (USUARIO DISTINTO) */}
      {isForeignShiftOpen && (
        <div style={{
          backgroundColor: '#450a0a',
          borderBottom: '2px solid #ef4444',
          padding: '0.85rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.88rem',
          color: '#f8fafc',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.35)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '300px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <AlertTriangle size={22} color="#f87171" />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#fca5a5', fontSize: '1rem' }}>
                ⚠️ AVISO: El usuario anterior ({activeShift.cashierName} • {activeShift.openedByEmail}) no realizó corte de caja
              </div>
              <div style={{ color: '#e2e8f0', fontSize: '0.82rem', marginTop: '3px' }}>
                Dejó la caja abierta con un fondo de <strong>${Number(activeShift.initialCash || 0).toFixed(2)}</strong> y <strong>${currentShiftCashSales.toFixed(2)}</strong> en ventas de efectivo. Para evitar revolver el dinero con tu usuario actual (<strong>{currentUser?.email}</strong>), realiza el corte de entrega del turno anterior.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => {
                setCloseShiftCountedCash('');
                setCloseShiftNotes(`Turno auditado y cerrado por ${currentUser?.displayName || currentUser?.email}`);
                setShowCloseShiftModal(true);
              }}
              style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.6rem 1.2rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.5)'
              }}
            >
              🏁 Realizar Corte del Turno de {activeShift.cashierName}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cash')}
              style={{
                backgroundColor: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '0.6rem 0.9rem',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Ver Movimientos
            </button>
          </div>
        </div>
      )}

      {/* BARRA INFORMATIVA DE TURNO Y CAJA */}
      {!activeShift ? (
        <div style={{
          backgroundColor: 'rgba(234, 179, 8, 0.12)',
          borderBottom: '1px solid rgba(234, 179, 8, 0.35)',
          padding: '0.65rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.86rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#facc15', fontWeight: 600 }}>
            <AlertTriangle size={18} />
            <span>Caja Cerrada (No hay turno activo). Abre el turno con tu fondo de caja para registrar feria, gastos y habilitar el arqueo.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero 1');
              setOpenShiftInitialCash('500');
              setOpenShiftNotes('');
              setShowOpenShiftModal(true);
            }}
            style={{
              backgroundColor: '#10b981',
              color: '#0f172a',
              border: 'none',
              borderRadius: '6px',
              padding: '0.45rem 1rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}
          >
            🟢 Abrir Turno de Caja
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #334155',
          padding: '0.55rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.84rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#34d399', fontWeight: 700 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#34d399', display: 'inline-block' }} />
              <span>Turno: {activeShift.cashierName}</span>
            </div>
            <div style={{ color: '#94a3b8' }}>
              Fondo Inicial: <strong style={{ color: '#f8fafc' }}>${Number(activeShift.initialCash || 0).toFixed(2)}</strong>
            </div>
            <div style={{ color: '#94a3b8' }}>
              Vtas Efectivo: <strong style={{ color: '#38bdf8' }}>${currentShiftCashSales.toFixed(2)}</strong> ({currentShiftSales.length} vtas)
            </div>
            {currentShiftTotalIn > 0 && (
              <div style={{ color: '#94a3b8' }}>
                +Feria: <strong style={{ color: '#10b981' }}>+${currentShiftTotalIn.toFixed(2)}</strong>
              </div>
            )}
            {currentShiftTotalOut > 0 && (
              <div style={{ color: '#94a3b8' }}>
                -Gastos: <strong style={{ color: '#ef4444' }}>-${currentShiftTotalOut.toFixed(2)}</strong>
              </div>
            )}
            <div style={{ color: '#94a3b8', background: 'rgba(56, 189, 248, 0.12)', padding: '0.2rem 0.55rem', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              Efectivo Esperado en Caja: <strong style={{ color: '#38bdf8', fontSize: '0.92rem' }}>${currentShiftExpectedCash.toFixed(2)} MXN</strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setMovementAmount('');
                setMovementReason('');
                setShowCashMovementModal('in');
              }}
              title="Ingresar feria de tu bolsa para dar cambio"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              📥 + Ingresar Feria
            </button>

            <button
              type="button"
              onClick={() => {
                setMovementAmount('');
                setMovementReason('');
                setShowCashMovementModal('out');
              }}
              title="Retirar dinero para gastos (jabón, bolsas, insumos, etc.)"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              📤 - Registrar Gasto
            </button>

            <button
              type="button"
              onClick={() => {
                setCloseShiftCountedCash('');
                setCloseShiftNotes('');
                setShowCloseShiftModal(true);
              }}
              title="Cerrar turno de caja y realizar arqueo"
              style={{
                backgroundColor: '#38bdf8',
                color: '#0f172a',
                border: 'none',
                borderRadius: '6px',
                padding: '0.35rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              🏁 Corte de Turno
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO SEGÚN PESTAÑA */}
      {activeTab === 'pos' && (
        <div className="pos-layout" style={{ position: 'relative' }}>
          {/* BLOQUEO TOTAL CUANDO LA CAJA ESTÁ CERRADA */}
          {!activeShift && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(11, 17, 32, 0.92)',
              backdropFilter: 'blur(7px)',
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}>
              <div style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '16px',
                padding: '2.5rem 2rem',
                maxWidth: '520px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.2rem'
              }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '2px solid rgba(234, 179, 8, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <AlertTriangle size={36} color="#facc15" />
                </div>
                <div>
                  <h2 style={{ margin: '0 0 0.5rem 0', color: '#f8fafc', fontSize: '1.45rem', fontWeight: 800 }}>
                    Caja Cerrada (Turno Inactivo)
                  </h2>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.92rem', lineHeight: '1.5' }}>
                    Para poder agregar prendas al ticket, escanear con la pistola o registrar compras en mostrador, primero debes <strong>abrir un turno de caja</strong> con tu fondo inicial.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
                    setOpenShiftInitialCash('500');
                    setOpenShiftNotes('');
                    setShowOpenShiftModal(true);
                  }}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.85rem 1.8rem',
                    fontSize: '1rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  🟢 Abrir Turno de Caja
                </button>
              </div>
            </div>
          )}

          {/* SECCIÓN CATÁLOGO / PRODUCTOS */}
          <section className="pos-catalog-section" style={{ opacity: !activeShift ? 0.35 : 1, pointerEvents: !activeShift ? 'none' : 'auto' }}>
            {/* Buscador inteligente */}
            <div className="pos-search-bar">
              <div className="pos-search-input-wrap">
                <Search size={18} />
                <input 
                  type="text" 
                  placeholder={!activeShift ? "🔒 Caja cerrada - Abre turno para comenzar a vender..." : "Escribe el nombre de la prenda o código SKU (presiona Enter)..."}
                  disabled={!activeShift}
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
              {filteredProducts.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                  <Package size={40} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>No hay prendas con existencias disponibles en esta vista.</p>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: '#475569' }}>
                    Puedes consultar el almacén o reponer existencias en la pestaña <strong>📦 Inventario</strong>.
                  </p>
                </div>
              ) : (
                filteredProducts.map(p => {
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
                      <div className="pos-card-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span>{p.category || 'Ropa'}</span>
                        {p.size && (
                          <span style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>
                            Talla: {p.size}
                          </span>
                        )}
                        {(p.code || p.sku) && <span>SKU: {p.code || p.sku}</span>}
                        {p.availableOnline === false ? (
                          <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.35)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
                            🏬 Tienda
                          </span>
                        ) : (
                          <span style={{ backgroundColor: 'rgba(52, 211, 153, 0.12)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>
                            🌐 Web
                          </span>
                        )}
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
                        {isAdmin && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBarcodeProduct(p);
                            }}
                            className="pos-btn-barcode"
                            title="Ver e imprimir código de barras (Solo Administrador)"
                          >
                            <Barcode size={13} /> Código
                          </button>
                        )}
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
              }))}
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

              {/* Cobro exclusivamente en efectivo en mostrador */}
              <div className="pos-cash-details" style={{ marginTop: '0.75rem' }}>
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

              {!activeShift ? (
                <button 
                  type="button"
                  className="pos-checkout-btn"
                  onClick={() => {
                    soundAlert('error');
                    setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero');
                    setOpenShiftInitialCash('500');
                    setShowOpenShiftModal(true);
                  }}
                  style={{
                    backgroundColor: '#eab308',
                    color: '#0f172a',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  <AlertTriangle size={20} />
                  ⚠️ Abrir Turno para Cobrar
                </button>
              ) : (
                <button 
                  className="pos-checkout-btn"
                  disabled={ticketItems.length === 0 || isProcessingSale}
                  onClick={handleCompleteSale}
                >
                  <CheckCircle size={20} />
                  {isProcessingSale ? 'Registrando Venta...' : 'Completar Venta'}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* PESTAÑA: INVENTARIO EN LISTADO TIPO TABLA (SOLO ADMINISTRADOR) */}
      {(activeTab === 'inventory' && isAdmin) && (
        <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', backgroundColor: '#0b1120' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            {/* Header del Inventario */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.6rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Package size={26} /> Control de Inventario y Almacén
                </h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>
                  Listado compacto en tiempo real. Ajusta existencias, edita datos o consulta fotos con un solo clic.
                </p>
              </div>

              {/* Acciones superiores */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowQuickEntryModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 1rem',
                    backgroundColor: '#38bdf8',
                    color: '#0f172a',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  ⚡ Alta Rápida de Prenda
                </button>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 1rem',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  🏷️ Hoja de Etiquetas
                </button>
              </div>
            </div>

            {/* Tarjetas de Estadísticas Rápidas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Modelos Registrados</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>
                  {products.length} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b' }}>estilos</span>
                </div>
              </div>

              <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Piezas Físicas</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem' }}>
                  {totalPiecesInStock} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b' }}>prendas</span>
                </div>
              </div>

              <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Prendas Agotadas (0)</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: outOfStockCount > 0 ? '#ef4444' : '#64748b', marginTop: '0.2rem' }}>
                  {outOfStockCount} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b' }}>por resurtir</span>
                </div>
              </div>

              <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>En Catálogo Web</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.2rem' }}>
                  {webPublishedCount} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b' }}>con foto online</span>
                </div>
              </div>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Buscador de inventario */}
                <div style={{ flex: '1 1 280px', position: 'relative' }}>
                  <Search size={18} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Buscar por SKU, nombre, talla o categoría..."
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    className="pos-input-sm"
                    style={{
                      width: '100%',
                      paddingLeft: '38px',
                      paddingTop: '0.6rem',
                      paddingBottom: '0.6rem',
                      borderRadius: '8px'
                    }}
                  />
                  {invSearch && (
                    <button
                      type="button"
                      onClick={() => setInvSearch('')}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtro por Categoría */}
                <select
                  value={invCategoryFilter}
                  onChange={(e) => setInvCategoryFilter(e.target.value)}
                  className="pos-input-sm"
                  style={{ minWidth: '150px', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c === 'Todos' ? 'Todas las Categorías' : c}</option>
                  ))}
                </select>
              </div>

              {/* Pestañitas rápidas de estado */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `Todos (${products.length})` },
                  { id: 'in_stock', label: `✅ Con Existencias (${products.length - outOfStockCount})` },
                  { id: 'out_of_stock', label: `⚠️ Agotados (${outOfStockCount})` },
                  { id: 'web', label: `🌐 En Tienda Web (${webPublishedCount})` },
                  { id: 'store', label: `🏬 Solo Tienda Física (${products.length - webPublishedCount})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInvStatusFilter(tab.id)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: invStatusFilter === tab.id ? '#38bdf8' : '#0f172a',
                      color: invStatusFilter === tab.id ? '#0f172a' : '#94a3b8'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLA DE INVENTARIO EN LISTADO COMPACTO */}
            <div style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>SKU / Código</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Prenda / Artículo</th>
                      <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>Talla</th>
                      <th style={{ padding: '0.75rem 0.75rem' }}>Categoría</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Existencias (Stock)</th>
                      <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>Canal</th>
                      <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>Foto</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryProducts.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                          No se encontraron artículos con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredInventoryProducts.map((p, idx) => {
                        const rawStock = (p.stock === null || p.stock === undefined || isNaN(Number(p.stock))) ? 0 : Number(p.stock);
                        const hasStock = rawStock > 0;
                        const pImg = p.image || null;
                        const isEven = idx % 2 === 0;

                        return (
                          <tr 
                            key={p.id}
                            style={{
                              backgroundColor: isEven ? '#1e293b' : '#172033',
                              borderBottom: '1px solid #334155',
                              transition: 'background-color 0.15s ease'
                            }}
                          >
                            {/* SKU */}
                            <td style={{ padding: '0.7rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>
                              {p.code || p.sku || 'S/C'}
                            </td>

                            {/* Nombre y Autor */}
                            <td style={{ padding: '0.7rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: '#f8fafc' }}>{p.name}</div>
                              {(p.createdByName || p.createdBy) && (
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                                  👤 Alta por: {p.createdByName || p.createdBy?.split('@')[0]}
                                </div>
                              )}
                            </td>

                            {/* Talla */}
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center' }}>
                              <span style={{
                                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                fontSize: '0.75rem'
                              }}>
                                {p.size || 'M'}
                              </span>
                            </td>

                            {/* Categoría */}
                            <td style={{ padding: '0.7rem 0.75rem', color: '#cbd5e1' }}>
                              {p.category || 'General'}
                            </td>

                            {/* Precio */}
                            <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc', fontSize: '0.92rem' }}>
                              ${Number(p.price || 0).toFixed(2)}
                            </td>

                            {/* Stock con botones +/- rápidos de 1 clic */}
                            <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#0f172a', padding: '0.2rem 0.4rem', borderRadius: '6px', border: '1px solid #334155' }}>
                                <button
                                  type="button"
                                  onClick={() => handleQuickStockChange(p, -1)}
                                  disabled={rawStock <= 0}
                                  title="Restar 1 existencia"
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: rawStock <= 0 ? 'transparent' : '#334155',
                                    color: rawStock <= 0 ? '#475569' : '#fff',
                                    cursor: rawStock <= 0 ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  -
                                </button>
                                
                                <span style={{
                                  minWidth: '32px',
                                  textAlign: 'center',
                                  fontWeight: 800,
                                  fontSize: '0.88rem',
                                  color: hasStock ? '#34d399' : '#ef4444'
                                }}>
                                  {rawStock}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleQuickStockChange(p, 1)}
                                  title="Sumar 1 existencia"
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: '#334155',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            {/* Canal (Web / Tienda) */}
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleOnline(p)}
                                title="Clic para alternar publicación en la tienda web"
                                style={{
                                  background: p.availableOnline === false ? 'rgba(234, 179, 8, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                                  color: p.availableOnline === false ? '#facc15' : '#34d399',
                                  border: `1px solid ${p.availableOnline === false ? 'rgba(234, 179, 8, 0.4)' : 'rgba(52, 211, 153, 0.4)'}`,
                                  borderRadius: '6px',
                                  padding: '0.25rem 0.55rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {p.availableOnline === false ? '🏬 Solo Tienda' : '🌐 En Web'}
                              </button>
                            </td>

                            {/* Foto (Link Ver Foto) */}
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'center' }}>
                              {pImg ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage({ url: getProductImage(p), name: p.name, sku: p.code || p.sku, price: p.price })}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    border: '1px solid rgba(56, 189, 248, 0.35)',
                                    padding: '0.25rem 0.6rem',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Eye size={13} /> Ver Foto
                                </button>
                              ) : (
                                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Sin foto</span>
                              )}
                            </td>

                            {/* Acciones */}
                            <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditProduct(p)}
                                  title="Editar prenda"
                                  style={{
                                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                                    border: '1px solid rgba(56, 189, 248, 0.4)',
                                    color: '#38bdf8',
                                    borderRadius: '6px',
                                    padding: '0.35rem 0.55rem',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}
                                >
                                  <Edit size={13} /> Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setSelectedBarcodeProduct(p)}
                                  title="Imprimir código de barras"
                                  style={{
                                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    color: '#34d399',
                                    borderRadius: '6px',
                                    padding: '0.35rem 0.55rem',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}
                                >
                                  🏷️ Barcode
                                </button>

                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProduct(p)}
                                    title="Eliminar prenda (Solo Admin)"
                                    style={{
                                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                      border: '1px solid rgba(239, 68, 68, 0.4)',
                                      color: '#ef4444',
                                      borderRadius: '6px',
                                      padding: '0.35rem 0.55rem',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      fontWeight: 600
                                    }}
                                  >
                                    ✕
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
          </div>
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

                    {/* Barra de progreso de Surtido / Empaque */}
                    {(() => {
                      const totalItemsCount = (order.items || []).length;
                      const pickedCount = (order.items || []).filter((item, i) => pickedMap[`${order.id}_${item.id || i}`]).length;
                      const isOrderFullyPicked = totalItemsCount > 0 && pickedCount === totalItemsCount;
                      return (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '6px',
                          backgroundColor: isOrderFullyPicked ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                          border: `1px solid ${isOrderFullyPicked ? 'rgba(52, 211, 153, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                          fontSize: '0.78rem',
                          fontWeight: 600
                        }}>
                          <span style={{ color: isOrderFullyPicked ? '#34d399' : '#f59e0b' }}>
                            {isOrderFullyPicked ? '🎉 ¡Pedido 100% surtido en bolsa!' : `📦 Surtido: ${pickedCount} de ${totalItemsCount} prendas listas`}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            Toca la casilla para marcar
                          </span>
                        </div>
                      );
                    })()}

                    {/* Lista de prendas con Foto, SKU y Checkbox */}
                    <div className="pos-order-items-box" style={{ gap: '0.55rem', maxHeight: '240px' }}>
                      {(order.items || []).map((it, idx) => {
                        const productMatch = products.find(p => p.id === it.id);
                        const itemImg = it.image || productMatch?.image;
                        const itemSku = it.code || it.sku || productMatch?.code || productMatch?.sku;
                        const itemKey = `${order.id}_${it.id || idx}`;
                        const isPicked = !!pickedMap[itemKey];

                        return (
                          <div 
                            key={idx} 
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.65rem',
                              padding: '0.5rem',
                              borderRadius: '8px',
                              backgroundColor: isPicked ? 'rgba(52, 211, 153, 0.08)' : 'rgba(30, 41, 59, 0.6)',
                              border: `1px solid ${isPicked ? 'rgba(52, 211, 153, 0.35)' : 'rgba(51, 65, 85, 0.6)'}`,
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {/* Casilla de verificación de surtido */}
                            <button
                              type="button"
                              onClick={() => toggleItemPicked(order.id, it.id || idx)}
                              title={isPicked ? "Prenda surtida (clic para desmarcar)" : "Clic para marcar como surtida/en bolsa"}
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '6px',
                                border: `2px solid ${isPicked ? '#34d399' : '#64748b'}`,
                                backgroundColor: isPicked ? '#34d399' : 'transparent',
                                color: isPicked ? '#0f172a' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                flexShrink: 0,
                                padding: 0,
                                fontSize: '0.9rem',
                                fontWeight: 'bold'
                              }}
                            >
                              {isPicked ? '✓' : ''}
                            </button>

                            {/* Miniatura de la foto con ampliación al tocar */}
                            {itemImg ? (
                              <img 
                                src={itemImg} 
                                alt={it.name}
                                onClick={() => setPreviewImage({ url: itemImg, name: it.name, sku: itemSku, price: it.price })}
                                title="Toca para ver la foto en grande"
                                style={{
                                  width: '48px',
                                  height: '48px',
                                  objectFit: 'cover',
                                  borderRadius: '6px',
                                  border: '1px solid #475569',
                                  cursor: 'zoom-in',
                                  flexShrink: 0
                                }}
                                onError={(e) => { e.target.onerror = null; e.target.src = '/images/brand_logo_1774572391476.png'; }}
                              />
                            ) : (
                              <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '6px',
                                backgroundColor: '#334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.3rem',
                                flexShrink: 0
                              }}>
                                👗
                              </div>
                            )}

                            {/* Datos de la prenda */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '0.86rem',
                                fontWeight: 600,
                                color: isPicked ? '#94a3b8' : '#f8fafc',
                                textDecoration: isPicked ? 'line-through' : 'none',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {it.quantity > 1 && <span style={{ color: '#38bdf8', marginRight: '4px' }}>{it.quantity}x</span>}
                                {it.name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '3px', flexWrap: 'wrap' }}>
                                {itemSku && (
                                  <span style={{
                                    fontSize: '0.72rem',
                                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    padding: '0.1rem 0.45rem',
                                    borderRadius: '4px',
                                    fontFamily: 'monospace',
                                    fontWeight: 700
                                  }}>
                                    SKU: {itemSku}
                                  </span>
                                )}
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  ${Number(it.price).toFixed(2)} c/u
                                </span>
                                {isPicked && (
                                  <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600 }}>
                                    ✓ En bolsa
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Subtotal */}
                            <div style={{ textAlign: 'right', flexShrink: 0, fontWeight: 700, fontSize: '0.9rem', color: isPicked ? '#34d399' : '#f8fafc' }}>
                              ${((Number(it.price) || 0) * (Math.max(1, parseInt(it.quantity, 10) || 1))).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pos-order-total-bar">
                      <span>Total:</span>
                      <span style={{ color: '#34d399' }}>
                        ${((Number(order.total) > 0) ? Number(order.total) : (order.items || []).reduce((acc, it) => acc + ((Number(it.price) || 0) * (Math.max(1, parseInt(it.quantity, 10) || 1))), 0)).toFixed(2)} MXN
                      </span>
                    </div>

                    {/* Acciones del pedido */}
                    <div className="pos-order-actions">
                      <button 
                        onClick={() => openReceiptModal(order)}
                        className="pos-btn-print-order"
                        title="Imprimir ticket para anexar al paquete o entrega"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          padding: '0.6rem 0.5rem',
                          fontSize: '0.82rem',
                          margin: 0
                        }}
                      >
                        <Printer size={15} /> Imprimir Ticket
                      </button>

                      {cleanPhone ? (
                        <a 
                          href={waUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="pos-wa-btn"
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            padding: '0.6rem 0.5rem',
                            fontSize: '0.82rem',
                            margin: 0
                          }}
                        >
                          <MessageSquare size={15} /> WhatsApp
                        </a>
                      ) : (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          color: '#64748b',
                          background: '#1e293b',
                          borderRadius: '6px',
                          border: '1px solid #334155'
                        }}>
                          Sin teléfono
                        </div>
                      )}

                      {/* Estado del pedido con protección de auditoría */}
                      {(() => {
                        const isAudited = isOrderAudited(order);
                        const isDelivered = order.status === 'entregado';
                        const isLocked = isAudited || (!isAdmin && isDelivered);

                        return (
                          <>
                            <select 
                              value={order.status || 'pendiente'}
                              onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value, order)}
                              disabled={isLocked}
                              title={
                                isAudited 
                                  ? 'Pedido cerrado y auditado en corte de caja anterior' 
                                  : (!isAdmin && isDelivered ? 'Solo administradores pueden reabrir pedidos entregados' : 'Cambiar estado del pedido')
                              }
                              style={{
                                width: '100%',
                                background: isLocked ? '#1e293b' : '#334155',
                                border: '1px solid ' + (isLocked ? '#334155' : '#475569'),
                                color: isLocked ? '#94a3b8' : '#fff',
                                borderRadius: '6px',
                                padding: '0.55rem 0.5rem',
                                fontSize: '0.8rem',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                opacity: isLocked ? 0.75 : 1
                              }}
                            >
                              <option value="pendiente">⏳ Pendiente</option>
                              <option value="en_camino">🚚 En camino</option>
                              <option value="entregado">✅ Entregado</option>
                              <option value="cancelado">❌ Cancelado</option>
                            </select>

                            {/* Badge cuando está auditado en corte de turno previo */}
                            {isAudited ? (
                              <div style={{
                                marginTop: '0.4rem',
                                padding: '0.45rem 0.6rem',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                background: 'rgba(100, 116, 139, 0.2)',
                                border: '1px solid rgba(148, 163, 184, 0.3)',
                                color: '#94a3b8',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.2rem'
                              }}>
                                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f1f5f9' }}>
                                  <span>🔒</span>
                                  <span>Cerrado en Corte Anterior</span>
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
                                  Atendido por: <strong>{order.shiftClosedCashier || order.deliveredBy || order.deliveredByEmail || 'Turno anterior'}</strong>
                                </div>
                                <div style={{ fontSize: '0.66rem', color: order.addedToCash ? '#34d399' : '#38bdf8' }}>
                                  {order.addedToCash ? '🛵 Mandaditos (Efectivo ya auditado)' : '💳 Transferencia Bancaria'}
                                </div>
                              </div>
                            ) : (
                              /* Indicador de método de cobro cuando ya está entregado en el turno en curso */
                              isDelivered && (
                                <div style={{
                                  marginTop: '0.4rem',
                                  padding: '0.45rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.74rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.2rem',
                                  background: order.addedToCash ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                  border: '1px solid ' + (order.addedToCash ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)'),
                                  color: order.addedToCash ? '#34d399' : '#38bdf8'
                                }}>
                                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                                    <span>{order.addedToCash ? '🛵 Mandaditos' : '💳 Transferencia'}</span>
                                    <span style={{ fontSize: '0.68rem', opacity: 0.9, fontWeight: 800 }}>
                                      {order.addedToCash ? '+ ENTRA A CAJA' : 'BANCO (NO CAJA)'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.66rem', color: '#cbd5e1' }}>
                                    Atendido por: <strong>{order.deliveredBy || 'Cajero'}</strong>
                                  </div>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeliveringOrder(order);
                                        setShowDeliverPaymentModal(true);
                                      }}
                                      style={{
                                        marginTop: '0.25rem',
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        color: '#cbd5e1',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '0.68rem',
                                        cursor: 'pointer',
                                        textAlign: 'center'
                                      }}
                                    >
                                      ✏️ Cambiar Cobro
                                    </button>
                                  )}
                                </div>
                              )
                            )}
                          </>
                        );
                      })()}

                      {isAdmin ? (
                        <button 
                          onClick={() => handleDeleteWebOrder(order)}
                          style={{
                            width: '100%',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#ef4444',
                            borderRadius: '6px',
                            padding: '0.55rem 0.5rem',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.35rem',
                            fontWeight: 600,
                            transition: 'all 0.15s ease'
                          }}
                          title="Eliminar pedido web permanentemente (Solo Administrador)"
                        >
                          <Trash2 size={14} /> Borrar
                        </button>
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA: CAJA Y TURNO DEL DÍA (OPERACIÓN DIARIA PARA CAJEROS Y ADMIN) */}
      {(activeTab === 'cash' || (activeTab === 'report' && !isAdmin)) && (
        <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', backgroundColor: '#0b1120' }}>
          <div style={{ maxWidth: '1080px', margin: '0 auto' }}>

            {/* ENCABEZADO DE CAJA */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.6rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Wallet size={26} /> Caja y Turno del Día
                </h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                  Apertura de turno, ingreso de feria de tu bolsa, registro de gastos menores y corte de caja al salir.
                </p>
              </div>

              {!activeShift ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero 1');
                    setOpenShiftInitialCash('500');
                    setOpenShiftNotes('');
                    setShowOpenShiftModal(true);
                  }}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.75rem 1.4rem',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  🟢 Abrir Turno de Caja
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementAmount('');
                      setMovementReason('');
                      setShowCashMovementModal('in');
                    }}
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '8px',
                      padding: '0.6rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📥 + Ingresar Feria (Cambio)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementAmount('');
                      setMovementReason('');
                      setShowCashMovementModal('out');
                    }}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '8px',
                      padding: '0.6rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📤 - Registrar Gasto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCloseShiftCountedCash('');
                      setCloseShiftNotes('');
                      setShowCloseShiftModal(true);
                    }}
                    style={{
                      backgroundColor: '#38bdf8',
                      color: '#0f172a',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.6rem 1.2rem',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    🏁 Cerrar Turno / Corte
                  </button>
                </div>
              )}
            </div>

            {/* SI NO HAY TURNO ACTIVO */}
            {!activeShift ? (
              <div style={{
                background: '#1e293b',
                border: '1px dashed #475569',
                borderRadius: '12px',
                padding: '3rem 2rem',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <Wallet size={48} style={{ opacity: 0.4, marginBottom: '0.8rem' }} />
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#f8fafc', fontSize: '1.25rem' }}>
                  No hay ningún turno de caja abierto en este momento
                </h3>
                <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.9rem', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Para comenzar a cobrar prendas en mostrador, pulsa el botón verde para indicar con cuánto dinero en efectivo arrancas tu turno.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpenShiftCashier(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cajero 1');
                    setOpenShiftInitialCash('500');
                    setOpenShiftNotes('');
                    setShowOpenShiftModal(true);
                  }}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.8rem 1.8rem',
                    fontWeight: 800,
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  🟢 Abrir Turno de Caja
                </button>
              </div>
            ) : (
              <div>
                {/* TARJETA DEL TURNO ACTUAL / ARQUEO EN VIVO */}
                <div style={{
                  background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.75rem',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#34d399', boxShadow: '0 0 8px #34d399' }} />
                      <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc' }}>
                        Turno Abierto: <strong style={{ color: '#38bdf8' }}>{activeShift.cashierName}</strong>
                      </h3>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        (Inició: {activeShift.openedAtMillis ? new Date(activeShift.openedAtMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Hoy'})
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                      Registrado por: <strong>{activeShift.openedByEmail}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Fondo Inicial</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
                        ${Number(activeShift.initialCash || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>Monedas y cambio base</div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Ventas en Efectivo</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem' }}>
                        ${currentShiftCashSales.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {currentShiftSales.filter(s => s.paymentMethod === 'efectivo').length} ventas en mostrador
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#10b981', textTransform: 'uppercase', fontWeight: 600 }}>+ Feria de Bolsa</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
                        +${currentShiftTotalIn.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {currentShiftMovements.filter(m => m.type === 'in').length} ingresos de cambio
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.75rem', color: '#ef4444', textTransform: 'uppercase', fontWeight: 600 }}>- Gastos / Salidas</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', marginTop: '0.25rem' }}>
                        -${currentShiftTotalOut.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {currentShiftMovements.filter(m => m.type === 'out').length} gastos (jabón, bolsas, etc.)
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.12)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>Efectivo Esperado</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8', marginTop: '0.25rem' }}>
                        ${currentShiftExpectedCash.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>Lo que debe haber en el cajón</div>
                    </div>
                  </div>
                </div>

                {/* MOVIMIENTOS REGISTRADOS EN ESTE TURNO */}
                <div style={{ background: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', padding: '1rem', marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#f8fafc', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📋 Movimientos de Feria y Gastos de Este Turno ({currentShiftMovements.length})
                  </h4>
                  {currentShiftMovements.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>
                      No has ingresado feria ni registrado gastos durante este turno.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.72rem' }}>
                          <th style={{ padding: '0.5rem' }}>Hora</th>
                          <th style={{ padding: '0.5rem' }}>Tipo</th>
                          <th style={{ padding: '0.5rem' }}>Monto</th>
                          <th style={{ padding: '0.5rem' }}>Motivo</th>
                          <th style={{ padding: '0.5rem' }}>Registró</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentShiftMovements.map((m, idx) => {
                          const isEntry = m.type === 'in';
                          return (
                            <tr key={m.id || idx} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>{m.timeFormatted || 'Hoy'}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <span style={{
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  backgroundColor: isEntry ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: isEntry ? '#34d399' : '#ef4444'
                                }}>
                                  {isEntry ? '📥 Entrada (Feria)' : '📤 Salida (Gasto)'}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem', fontWeight: 800, color: isEntry ? '#34d399' : '#ef4444' }}>
                                {isEntry ? '+' : '-'}${Number(m.amount || 0).toFixed(2)}
                              </td>
                              <td style={{ padding: '0.5rem', color: '#f8fafc' }}>{m.reason}</td>
                              <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{m.performedBy || 'Cajero'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* AVISO EXCLUSIVO PARA ADMINISTRADOR */}
            {isAdmin && (
              <div style={{
                marginTop: '1.5rem',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '10px',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div>
                  <strong style={{ color: '#fbbf24', fontSize: '0.92rem' }}>👑 ¿Deseas consultar balances por periodo o el historial de todos los cortes anteriores?</strong>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    Como Administrador, tienes el módulo contable por semana/mes y eliminación de registros en la pestaña de Administración.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('admin');
                    setAdminSection('reports');
                  }}
                  style={{
                    backgroundColor: '#f59e0b',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 1rem',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Ir a Administración 👑
                </button>
              </div>
            )}

            {/* ÚLTIMOS CORTES DE CAJA REGISTRADOS */}
            <div style={{ background: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', padding: '1.25rem', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📑 Cortes de Caja y Turnos Anteriores
                </h4>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('admin');
                      setAdminSection('reports');
                      setReportSubTab('shifts');
                    }}
                    style={{
                      background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.82rem',
                      fontWeight: 600, cursor: 'pointer', textDecoration: 'underline'
                    }}
                  >
                    Ver historial completo en Administración →
                  </button>
                )}
              </div>

              {shiftsList.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                  Aún no hay turnos registrados en la base de datos.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.72rem' }}>
                        <th style={{ padding: '0.6rem' }}>Cajero</th>
                        <th style={{ padding: '0.6rem' }}>Apertura</th>
                        <th style={{ padding: '0.6rem' }}>Cierre</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>Fondo</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>Ventas Efec.</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>Esperado</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>Físico</th>
                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>Diferencia</th>
                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>Ticket Corte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftsList.slice(0, 10).map(s => {
                        const openedTime = s.openedAtMillis 
                          ? new Date(s.openedAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : (s.openedAt?.seconds ? new Date(s.openedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A');

                        const closedTime = s.closedAtMillis
                          ? new Date(s.closedAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : (s.closedAt?.seconds ? new Date(s.closedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : null);

                        const isOpen = s.status === 'open';
                        const diff = Number(s.difference || 0);
                        const expected = Number(s.expectedCash != null ? s.expectedCash : (Number(s.initialCash || 0) + Number(s.salesCash || 0) + Number(s.totalIn || 0) - Number(s.totalOut || 0)));

                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '0.6rem', fontWeight: 600, color: '#f8fafc' }}>
                              {s.cashierName || 'Cajero'}
                              {isOpen && (
                                <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', backgroundColor: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                  Activo
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>{openedTime}</td>
                            <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>{isOpen ? <span style={{ color: '#fbbf24' }}>En curso</span> : (closedTime || 'Cerrado')}</td>
                            <td style={{ padding: '0.6rem', textAlign: 'right', color: '#cbd5e1' }}>${Number(s.initialCash || 0).toFixed(2)}</td>
                            <td style={{ padding: '0.6rem', textAlign: 'right', color: '#38bdf8', fontWeight: 700 }}>${Number(s.salesCash || 0).toFixed(2)}</td>
                            <td style={{ padding: '0.6rem', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>${expected.toFixed(2)}</td>
                            <td style={{ padding: '0.6rem', textAlign: 'right', color: isOpen ? '#94a3b8' : '#34d399', fontWeight: 700 }}>{isOpen ? '--' : `$${Number(s.actualCash || 0).toFixed(2)}`}</td>
                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                              {isOpen ? (
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Pendiente</span>
                              ) : diff === 0 ? (
                                <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 700 }}>Exacto</span>
                              ) : diff > 0 ? (
                                <span style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 700 }}>+${diff.toFixed(2)}</span>
                              ) : (
                                <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}>-${Math.abs(diff).toFixed(2)}</span>
                              )}
                            </td>
                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => openShiftReceiptModal(s)}
                                style={{
                                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.35)',
                                  borderRadius: '4px',
                                  padding: '0.25rem 0.6rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                <FileText size={12} /> Ver Corte
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA: MÓDULO ADMINISTRATIVO CONSOLIDADO (SOLO ADMINISTRADORES) */}
      {(activeTab === 'admin' || (activeTab === 'report' && isAdmin)) && isAdmin && (
        <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', backgroundColor: '#0b1120' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

            {/* BARRA DE NAVEGACIÓN ADMINISTRATIVA */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              backgroundColor: '#1e293b',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              border: '1px solid #334155',
              flexWrap: 'wrap',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fbbf24', marginRight: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  👑 ADMINISTRACIÓN:
                </span>
                <button
                  type="button"
                  onClick={() => setAdminSection('reports')}
                  style={{
                    backgroundColor: adminSection === 'reports' ? '#38bdf8' : '#0f172a',
                    color: adminSection === 'reports' ? '#0f172a' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📊 Reportes y Finanzas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminSection('labels');
                    setShowBatchModal(true);
                  }}
                  style={{
                    backgroundColor: adminSection === 'labels' ? '#34d399' : '#0f172a',
                    color: adminSection === 'labels' ? '#0f172a' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🏷️ Hoja de Etiquetas
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSection('staff')}
                  style={{
                    backgroundColor: adminSection === 'staff' ? '#38bdf8' : '#0f172a',
                    color: adminSection === 'staff' ? '#0f172a' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  👥 Control de Personal
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSection('config')}
                  style={{
                    backgroundColor: adminSection === 'config' ? '#38bdf8' : '#0f172a',
                    color: adminSection === 'config' ? '#0f172a' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ⚙️ Configuración del Sistema
                </button>
              </div>

              {/* ENLACES RÁPIDOS EXTERNOS */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Link 
                  to="/admin" 
                  style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.82rem', padding: '0.45rem 0.8rem', background: '#334155', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <ExternalLink size={14} /> Panel Admin (/admin)
                </Link>
                <Link 
                  to="/" 
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.82rem', padding: '0.45rem 0.8rem', background: 'rgba(56,189,248,0.15)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Eye size={14} /> Ver Tienda Web
                </Link>
              </div>
            </div>

            {/* CONTENIDO 1: REPORTES Y FINANZAS */}
            {adminSection === 'reports' && (
              <div>

            {/* SELECTOR DE PERIODO (DÍA, SEMANA, QUINCENA, MES, AÑO, TODAS) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
              backgroundColor: '#1e293b',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', marginRight: '0.25rem' }}>
                  📅 FILTRAR PERIODO:
                </span>
                {[
                  { id: 'today', label: '📅 Hoy' },
                  { id: 'week', label: '🗓️ Esta Semana (7d)' },
                  { id: 'fortnight', label: '🌓 Esta Quincena (15d)' },
                  { id: 'month', label: '📆 Este Mes' },
                  { id: 'year', label: '📊 Este Año' },
                  { id: 'all', label: '🌐 Todo el Historial' },
                ].map(period => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => setReportDateFilter(period.id)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      backgroundColor: reportDateFilter === period.id ? '#38bdf8' : '#0f172a',
                      color: reportDateFilter === period.id ? '#0f172a' : '#cbd5e1',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {period.label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Mostrando <strong style={{ color: '#f8fafc' }}>{periodSales.length}</strong> ventas registradas
              </div>
            </div>

            {/* TARJETAS DE MÉTRICAS DEL PERIODO */}
            <div className="pos-stats-grid" style={{ marginBottom: '1.75rem' }}>
              <div className="pos-stat-card">
                <h5>VENTAS TOTALES DEL PERIODO</h5>
                <div className="stat-num" style={{ color: '#34d399' }}>
                  ${periodTotal.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                  Mostrador: <strong>${periodPosTotal.toFixed(2)}</strong> • Web: <strong>${periodWebTotal.toFixed(2)}</strong>
                </div>
              </div>

              <div className="pos-stat-card">
                <h5>VENTAS EN EFECTIVO</h5>
                <div className="stat-num" style={{ color: '#38bdf8' }}>
                  ${periodCashTotal.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                  Cobrado en caja física
                </div>
              </div>

              <div className="pos-stat-card">
                <h5>TARJETA Y TRANSFERENCIA</h5>
                <div className="stat-num" style={{ color: '#fbbf24' }}>
                  ${(periodCardTotal + periodTransferTotal).toFixed(2)}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                  Tarjeta: ${periodCardTotal.toFixed(2)} • Transf: ${periodTransferTotal.toFixed(2)}
                </div>
              </div>

              <div className="pos-stat-card">
                <h5>MOVIMIENTOS DE CAJA</h5>
                <div className="stat-num" style={{ color: '#cbd5e1', fontSize: '1.3rem' }}>
                  <span style={{ color: '#10b981' }}>+${periodMovementsInTotal.toFixed(2)}</span> / <span style={{ color: '#ef4444' }}>-${periodMovementsOutTotal.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                  Feria agregada vs Gastos menores
                </div>
              </div>
            </div>

            {/* SUBPESTAÑAS DE TABLAS: VENTAS, MOVIMIENTOS Y TURNOS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '2px solid #334155', paddingBottom: '0.5rem', width: '100%', maxWidth: '600px' }}>
                <button
                  type="button"
                  onClick={() => setReportSubTab('sales')}
                  style={{
                    background: reportSubTab === 'sales' ? '#38bdf8' : 'transparent',
                    color: reportSubTab === 'sales' ? '#0f172a' : '#94a3b8',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📋 Ventas del Periodo ({displayedReportSales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReportSubTab('movements')}
                  style={{
                    background: reportSubTab === 'movements' ? '#38bdf8' : 'transparent',
                    color: reportSubTab === 'movements' ? '#0f172a' : '#94a3b8',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  💸 Feria y Gastos ({periodAllMovements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReportSubTab('shifts')}
                  style={{
                    background: reportSubTab === 'shifts' ? '#38bdf8' : 'transparent',
                    color: reportSubTab === 'shifts' ? '#0f172a' : '#94a3b8',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📑 Historial de Turnos ({periodShifts.length})
                </button>
              </div>

              {reportSubTab === 'sales' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Buscar por cliente, folio o método..." 
                    value={reportSearch} 
                    onChange={(e) => setReportSearch(e.target.value)} 
                    className="pos-input-sm"
                    style={{ width: '250px', padding: '0.5rem 0.8rem', borderRadius: '6px' }}
                  />
                </div>
              )}
            </div>

            {/* 1. SUBTAB: VENTAS DEL PERIODO */}
            {reportSubTab === 'sales' && (
              <div style={{ background: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.74rem', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Folio</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Fecha/Hora</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Canal</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Cajero / Cliente</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Método</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedReportSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                          No se encontraron ventas para el periodo o búsqueda seleccionada.
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
                                fontSize: '0.82rem'
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
                                fontWeight: 700,
                                backgroundColor: sale.type === 'pos' ? 'rgba(56,189,248,0.15)' : 'rgba(251,191,36,0.15)',
                                color: sale.type === 'pos' ? '#38bdf8' : '#fbbf24',
                                border: `1px solid ${sale.type === 'pos' ? 'rgba(56,189,248,0.3)' : 'rgba(251,191,36,0.3)'}`
                              }}>
                                {sale.type === 'pos' ? '🏬 Mostrador' : '🌐 Web'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: '#f8fafc' }}>{sale.clientName}</div>
                              {sale.cashierName && (
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                  Atendió: {sale.cashierName}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                              <span style={{
                                backgroundColor: sale.paymentMethod === 'efectivo' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(147, 51, 234, 0.15)',
                                color: sale.paymentMethod === 'efectivo' ? '#34d399' : '#c084fc',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontWeight: 600,
                                fontSize: '0.78rem'
                              }}>
                                {sale.paymentMethod || 'Web'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#34d399', fontSize: '0.95rem' }}>
                              ${(Number(sale.total) || 0).toFixed(2)}
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
            )}

            {/* 2. SUBTAB: MOVIMIENTOS DE CAJA (FERIA Y GASTOS) */}
            {reportSubTab === 'movements' && (
              <div style={{ background: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.74rem', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Hora / Fecha</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Monto</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Concepto / Motivo</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Registró</th>
                      {isAdmin && <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {periodAllMovements.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                          No hay entradas de feria ni retiros de gastos registrados en este periodo.
                        </td>
                      </tr>
                    ) : (
                      periodAllMovements.map((mov, idx) => {
                        const isEntry = mov.type === 'in';
                        return (
                          <tr key={mov.id || idx} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                              {mov.timeMillis ? new Date(mov.timeMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : mov.timeFormatted || 'Hoy'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span style={{
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: isEntry ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: isEntry ? '#34d399' : '#ef4444',
                                border: `1px solid ${isEntry ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`
                              }}>
                                {isEntry ? '📥 + Entrada (Feria)' : '📤 - Salida (Gasto)'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 800, fontSize: '0.95rem', color: isEntry ? '#34d399' : '#ef4444' }}>
                              {isEntry ? '+' : '-'}${Number(mov.amount || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: '#f8fafc', fontWeight: 500 }}>
                              {mov.reason}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>
                              👤 {mov.performedBy || mov.cashier || 'Cajero'}
                            </td>
                            {isAdmin && (
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMovement(mov)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    color: '#ef4444',
                                    borderRadius: '5px',
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    fontWeight: 700
                                  }}
                                  title="Eliminar movimiento de caja (Solo Administrador)"
                                >
                                  <Trash2 size={13} /> Borrar
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. SUBTAB: HISTORIAL DE TURNOS Y CORTES DE CAJA */}
            {reportSubTab === 'shifts' && (
              <div style={{ background: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.74rem', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Cajero / Turno</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Apertura</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Cierre / Corte</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Fondo</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Ventas Efec.</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Esperado</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Físico</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Diferencia</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodShifts.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                          No hay turnos ni cortes de caja registrados en este periodo.
                        </td>
                      </tr>
                    ) : (
                      periodShifts.map(shift => {
                        const openedTime = shift.openedAtMillis 
                          ? new Date(shift.openedAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : (shift.openedAt?.seconds ? new Date(shift.openedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A');

                        const closedTime = shift.closedAtMillis
                          ? new Date(shift.closedAtMillis).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                          : (shift.closedAt?.seconds ? new Date(shift.closedAt.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : null);

                        const isOpen = shift.status === 'open';
                        const diff = Number(shift.difference || 0);
                        const expected = Number(shift.expectedCash != null ? shift.expectedCash : (Number(shift.initialCash || 0) + Number(shift.salesCash || 0) + Number(shift.totalIn || 0) - Number(shift.totalOut || 0)));

                        return (
                          <tr key={shift.id} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {shift.cashierName || 'Cajero'}
                                {isOpen ? (
                                  <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                                    ● En Curso
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                    Cerrado
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {shift.openedByEmail}
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1', fontSize: '0.82rem' }}>
                              {openedTime}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1', fontSize: '0.82rem' }}>
                              {isOpen ? (
                                <span style={{ color: '#fbbf24', fontStyle: 'italic' }}>Turno Activo</span>
                              ) : (
                                closedTime || 'Cerrado'
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                              ${Number(shift.initialCash || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                              ${Number(shift.salesCash || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                              ${expected.toFixed(2)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: isOpen ? '#94a3b8' : '#34d399' }}>
                              {isOpen ? '--' : `$${Number(shift.actualCash || 0).toFixed(2)}`}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              {isOpen ? (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Pendiente</span>
                              ) : diff === 0 ? (
                                <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                  Exacto $0.00
                                </span>
                              ) : diff > 0 ? (
                                <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                                  +Sobró ${diff.toFixed(2)}
                                </span>
                              ) : (
                                <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                  -Faltó ${Math.abs(diff).toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => openShiftReceiptModal(shift)}
                                  style={{
                                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    border: '1px solid rgba(56, 189, 248, 0.35)',
                                    borderRadius: '5px',
                                    padding: '0.35rem 0.65rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}
                                  title="Ver arqueo detallado y ticket de corte de este turno"
                                >
                                  <FileText size={13} /> Ver Corte
                                </button>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteShift(shift)}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.15)',
                                      border: '1px solid rgba(239, 68, 68, 0.4)',
                                      color: '#ef4444',
                                      borderRadius: '5px',
                                      padding: '0.35rem 0.6rem',
                                      fontSize: '0.78rem',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      fontWeight: 700
                                    }}
                                    title="Eliminar este turno del historial (Solo Administrador)"
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
            )}
            </div>
          )}

          {/* SECCIÓN 2: HOJA DE ETIQUETAS */}
          {adminSection === 'labels' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '2.5rem', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(52, 211, 153, 0.15)', border: '2px solid rgba(52, 211, 153, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
                <Barcode size={32} color="#34d399" />
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#f8fafc', fontSize: '1.4rem' }}>
                Impresión Masiva de Etiquetas en Hoja Carta
              </h3>
              <p style={{ margin: '0 auto 1.5rem auto', color: '#94a3b8', fontSize: '0.92rem', maxWidth: '560px', lineHeight: '1.5' }}>
                Genera e imprime planillas de 24 etiquetas adhesivas por hoja carta para etiquetar las prendas de la tienda física. Incluye código SKU, precio, talla y nombre de la prenda.
              </p>
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                style={{
                  backgroundColor: '#10b981',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.85rem 2rem',
                  fontSize: '1rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                }}
              >
                <Barcode size={18} /> Abrir Creador de Hojas de Etiquetas
              </button>
            </div>
          )}

          {/* SECCIÓN 3: CONTROL DE PERSONAL (STAFF) */}
          {adminSection === 'staff' && (
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
        )}

          {/* SECCIÓN 4: CONFIGURACIÓN DEL SISTEMA */}
          {adminSection === 'config' && (
            <div style={{ maxWidth: '750px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.6rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Settings size={28} /> Configuración del Sistema
            </h2>

            {/* CATEGORÍAS DINÁMICAS */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏷️ Categorías Dinámicas
              </h3>
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="pos-input-sm"
                  style={{ flex: 1, padding: '0.6rem 0.85rem' }}
                  placeholder="Nueva categoría..."
                />
                <button type="submit" className="pos-btn" style={{ background: '#38bdf8', color: '#0f172a', fontWeight: 700, border: 'none', borderRadius: '6px', padding: '0.6rem 1.2rem', cursor: 'pointer' }}>
                  Añadir
                </button>
              </form>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {configCategories.map(c => (
                  <span key={c} style={{ padding: '0.3rem 0.9rem', border: '1px solid #334155', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#0f172a', fontSize: '0.85rem' }}>
                    {c}
                    <b onClick={() => handleRemoveCategory(c)} style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 900, lineHeight: 1 }}>×</b>
                  </span>
                ))}
              </div>
            </div>

            {/* EMPRESA Y CONTACTO */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>🏪 Empresa y Contacto</h3>
              <form onSubmit={handleSaveStoreInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Descripción de Nosotros</label>
                  <textarea
                    value={storeInfo.description || ''}
                    onChange={(e) => setStoreInfo({ ...storeInfo, description: e.target.value })}
                    className="pos-input-sm"
                    rows={3}
                    style={{ width: '100%', padding: '0.6rem 0.85rem', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Dirección</label>
                    <input type="text" value={storeInfo.address || ''} onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })} className="pos-input-sm" style={{ width: '100%', padding: '0.6rem 0.85rem' }} placeholder="Dirección física" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Teléfono (WhatsApp)</label>
                    <input type="text" value={storeInfo.phone || ''} onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })} className="pos-input-sm" style={{ width: '100%', padding: '0.6rem 0.85rem' }} placeholder="10 dígitos" />
                  </div>
                </div>
                <button disabled={savingInfo} type="submit" style={{ alignSelf: 'flex-start', background: '#38bdf8', color: '#0f172a', fontWeight: 700, border: 'none', borderRadius: '6px', padding: '0.65rem 1.5rem', cursor: 'pointer' }}>
                  {savingInfo ? 'Guardando...' : 'Actualizar'}
                </button>
              </form>
            </div>

            {/* CONTROL Y REINICIO DE FOLIO DE ETIQUETAS */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🏷️ Folios y Numeración de Etiquetas (SKU)
                  </h3>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                    Ajusta o reinicia el número consecutivo para las etiquetas de código de barras de ropa.
                  </p>
                </div>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                  Próxima: ALN-{String(nextSkuPreview).padStart(5, '0')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontFamily: 'monospace' }}>ALN-</span>
                  <input
                    type="number"
                    min="1"
                    value={skuInputVal}
                    onChange={(e) => setSkuInputVal(e.target.value)}
                    style={{
                      width: '120px',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      background: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontFamily: 'monospace'
                    }}
                    placeholder="Ej. 1 o 1001"
                  />
                </div>

                <button
                  type="button"
                  disabled={isUpdatingSkuSeq}
                  onClick={async () => {
                    const val = parseInt(skuInputVal, 10);
                    if (isNaN(val) || val < 1) {
                      alert("Ingresa un número válido mayor o igual a 1");
                      return;
                    }
                    if (!window.confirm(`¿Confirmas reiniciar el contador de etiquetas para que la siguiente sea ALN-${String(val).padStart(5, '0')}?`)) return;
                    setIsUpdatingSkuSeq(true);
                    try {
                      const newSeq = await resetSkuSequence(val);
                      setNextSkuPreview(newSeq);
                      alert(`✅ Folio de etiquetas reiniciado exitosamente a ALN-${String(newSeq).padStart(5, '0')}`);
                    } catch (e) {
                      alert("Error al actualizar folio: " + e.message);
                    } finally {
                      setIsUpdatingSkuSeq(false);
                    }
                  }}
                  style={{
                    background: '#10b981',
                    color: '#0f172a',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.6rem 1.25rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {isUpdatingSkuSeq ? 'Guardando...' : '💾 Establecer Folio'}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("¿Confirmas reiniciar el folio de etiquetas desde el número 1 (ALN-00001)?")) return;
                    setIsUpdatingSkuSeq(true);
                    try {
                      const newSeq = await resetSkuSequence(1);
                      setNextSkuPreview(newSeq);
                      setSkuInputVal('1');
                      alert("✅ Folio reiniciado a 1 (ALN-00001).");
                    } catch (e) {
                      alert("Error: " + e.message);
                    } finally {
                      setIsUpdatingSkuSeq(false);
                    }
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '0.6rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  🔄 Reiniciar a 1 (ALN-00001)
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("¿Confirmas reiniciar el folio de etiquetas desde el número 1001 (ALN-01001)?")) return;
                    setIsUpdatingSkuSeq(true);
                    try {
                      const newSeq = await resetSkuSequence(1001);
                      setNextSkuPreview(newSeq);
                      setSkuInputVal('1001');
                      alert("✅ Folio reiniciado a 1001 (ALN-01001).");
                    } catch (e) {
                      alert("Error: " + e.message);
                    } finally {
                      setIsUpdatingSkuSeq(false);
                    }
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '0.6rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  🔄 Reiniciar a 1001 (ALN-01001)
                </button>
              </div>
            </div>

            {/* APIs Y CANALES */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>🔧 Configuración del Sistema (APIs y Canales)</h3>
              <form onSubmit={handleSaveApiSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Telegram Bot Token</label>
                  <input type="text" value={apiSettings.telegramToken} onChange={(e) => setApiSettings({ ...apiSettings, telegramToken: e.target.value })} className="pos-input-sm" style={{ width: '100%', padding: '0.6rem 0.85rem', fontFamily: 'monospace' }} placeholder="Bot Token" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Telegram Chat ID</label>
                  <input type="text" value={apiSettings.telegramChatId} onChange={(e) => setApiSettings({ ...apiSettings, telegramChatId: e.target.value })} className="pos-input-sm" style={{ width: '100%', padding: '0.6rem 0.85rem', fontFamily: 'monospace' }} placeholder="Chat ID" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem' }}>ImgBB API Key (Subida de Imágenes)</label>
                  <input type="text" value={apiSettings.imgbbApiKey} onChange={(e) => setApiSettings({ ...apiSettings, imgbbApiKey: e.target.value })} className="pos-input-sm" style={{ width: '100%', padding: '0.6rem 0.85rem', fontFamily: 'monospace' }} placeholder="API Key de ImgBB" />
                </div>
                <button disabled={savingApi} type="submit" style={{ alignSelf: 'flex-start', background: '#38bdf8', color: '#0f172a', fontWeight: 700, border: 'none', borderRadius: '6px', padding: '0.65rem 1.5rem', cursor: 'pointer' }}>
                  {savingApi ? 'Guardando...' : 'Actualizar Llaves'}
                </button>
              </form>
            </div>

            {/* ADMINS AUTORIZADOS */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>👑 Admins Autorizados</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {adminEmails.map(email => (
                  <span key={email} style={{ padding: '0.3rem 0.9rem', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '20px', background: 'rgba(251,191,36,0.08)', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    {email}
                    {email !== 'jomartin8264@gmail.com' && (
                      <b
                        onClick={async () => {
                          if (!window.confirm(`¿Revocar admin a ${email}?`)) return;
                          const updated = adminEmails.filter(e => e !== email);
                          await setDoc(doc(db, "config", "admins"), { emails: updated });
                          setAdminEmails(updated);
                          const updatedStaff = staffUsers.map(u => u.email.toLowerCase() === email.toLowerCase() ? { ...u, role: 'employee' } : u);
                          await setDoc(doc(db, "config", "staff"), { users: updatedStaff });
                          setStaffUsers(updatedStaff);
                        }}
                        style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 900 }}
                      >×</b>
                    )}
                  </span>
                ))}
              </div>
              <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Para añadir o cambiar administradores ve a la pestaña <strong>Control de Personal</strong>.
              </p>
            </div>

          </div>
        )}

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
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ maxWidth: '72%', wordBreak: 'break-word' }}>
                      <strong>{it.quantity}x {it.name}</strong>
                      {(it.code || it.sku) && (
                        <div style={{ fontSize: '0.68rem', color: '#555', fontFamily: 'monospace' }}>
                          SKU: {it.code || it.sku}
                        </div>
                      )}
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

      {/* MODAL DE VISTA PREVIA DE FOTO EN GRANDE (PARA SURTIDO DE PEDIDOS) */}
      {previewImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '1rem',
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div 
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.25rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              color: '#f8fafc',
              position: 'relative',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#38bdf8' }}>{previewImage.name}</h3>
                {previewImage.sku && (
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 600 }}>
                    SKU: {previewImage.sku}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setPreviewImage(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{
              borderRadius: '12px',
              overflow: 'hidden',
              backgroundColor: '#0f172a',
              maxHeight: '420px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <img 
                src={previewImage.url} 
                alt={previewImage.name}
                style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.6rem', borderTop: '1px solid #334155' }}>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Precio en catálogo:</span>
              <strong style={{ fontSize: '1.25rem', color: '#34d399' }}>${Number(previewImage.price || 0).toFixed(2)} MXN</strong>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE EDICIÓN RÁPIDA DE PRENDA DESDE INVENTARIO POS */}
      {editingProductInPOS && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            border: '1px solid #334155',
            maxWidth: '480px',
            width: '100%',
            padding: '1.5rem',
            color: '#fff',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ✏️ Editar Prenda
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                  SKU: {editProdForm.code || editingProductInPOS.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingProductInPOS(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Nombre de la Prenda
                </label>
                <input
                  type="text"
                  required
                  value={editProdForm.name}
                  onChange={(e) => setEditProdForm({ ...editProdForm, name: e.target.value })}
                  className="pos-input"
                  style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Precio ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={editProdForm.price}
                    onChange={(e) => setEditProdForm({ ...editProdForm, price: e.target.value })}
                    className="pos-input"
                    style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#38bdf8', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Existencias / Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editProdForm.stock}
                    onChange={(e) => setEditProdForm({ ...editProdForm, stock: e.target.value })}
                    className="pos-input"
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderColor: '#38bdf8' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Talla
                  </label>
                  <input
                    type="text"
                    value={editProdForm.size}
                    onChange={(e) => setEditProdForm({ ...editProdForm, size: e.target.value })}
                    className="pos-input"
                    style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Categoría
                  </label>
                  <select
                    value={editProdForm.category}
                    onChange={(e) => setEditProdForm({ ...editProdForm, category: e.target.value })}
                    className="pos-input"
                    style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                  >
                    {categories.filter(c => c !== 'Todos').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(51, 65, 85, 0.4)',
                border: '1px solid #334155'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                    Publicar en Tienda Web
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Si está desactivado, sólo estará disponible en la tienda física
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!!editProdForm.availableOnline}
                  onChange={(e) => setEditProdForm({ ...editProdForm, availableOnline: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#10b981' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingProductInPOS(null)}
                  className="pos-btn-secondary"
                  style={{ flex: 1, padding: '0.7rem' }}
                  disabled={isSavingEditProd}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pos-btn-pay"
                  style={{ flex: 1, padding: '0.7rem' }}
                  disabled={isSavingEditProd}
                >
                  {isSavingEditProd ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GENERADOR DE HOJA DE ETIQUETAS EN LOTE */}
      {showBatchModal && (
        <BatchBarcodeModal 
          products={products} 
          onClose={() => setShowBatchModal(false)} 
        />
      )}

      {/* MODAL DE ALTA RÁPIDA DE PRENDAS (PC Y CELULAR) */}
      {showQuickEntryModal && (
        <QuickProductEntryModal
          isOpen={showQuickEntryModal}
          onClose={() => setShowQuickEntryModal(false)}
          categories={categories.filter(c => c !== 'Todos')}
        />
      )}

      {/* 1. MODAL: APERTURA DE TURNO DE CAJA */}
      {showOpenShiftModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid #334155',
            maxWidth: '440px', width: '100%', padding: '1.75rem', color: '#fff',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🟢 Apertura de Turno de Caja
              </h3>
              <button
                type="button"
                onClick={() => setShowOpenShiftModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOpenShift} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Nombre del Cajero / Empleado
                </label>
                <input
                  type="text"
                  required
                  value={openShiftCashier}
                  onChange={(e) => setOpenShiftCashier(e.target.value)}
                  placeholder="Ej. Juan Pérez / Empleada 1"
                  className="pos-input"
                  style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#38bdf8', marginBottom: '0.35rem', fontWeight: 700 }}>
                  Fondo Inicial de Caja en Efectivo ($ MXN)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={openShiftInitialCash}
                  onChange={(e) => setOpenShiftInitialCash(e.target.value)}
                  placeholder="500.00"
                  className="pos-input"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderColor: '#38bdf8', fontSize: '1.1rem', fontWeight: 800 }}
                />
                <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginTop: '0.25rem' }}>
                  Dinero en monedas y billetes chicos con el que arranca el turno.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Notas u Observaciones (Opcional)
                </label>
                <textarea
                  value={openShiftNotes}
                  onChange={(e) => setOpenShiftNotes(e.target.value)}
                  placeholder="Ej. Se reciben 10 monedas de $10 y 4 billetes de $50..."
                  rows={2}
                  className="pos-input"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowOpenShiftModal(false)}
                  className="pos-btn-secondary"
                  style={{ flex: 1, padding: '0.75rem' }}
                  disabled={isSavingShift}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pos-btn-pay"
                  style={{ flex: 1, padding: '0.75rem', backgroundColor: '#10b981', color: '#0f172a', fontWeight: 800 }}
                  disabled={isSavingShift}
                >
                  {isSavingShift ? 'Abriendo...' : 'Iniciar Turno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MODAL: MOVIMIENTO DE CAJA (ENTRADA DE FERIA O GASTO/RETIRO) */}
      {showCashMovementModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid #334155',
            maxWidth: '440px', width: '100%', padding: '1.75rem', color: '#fff',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{
                margin: 0, fontSize: '1.2rem',
                color: showCashMovementModal === 'in' ? '#34d399' : '#ef4444',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}>
                {showCashMovementModal === 'in' ? '📥 Ingresar Feria / Dinero a Caja' : '📤 Retirar Dinero / Registrar Gasto'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCashMovementModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{
              backgroundColor: showCashMovementModal === 'in' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${showCashMovementModal === 'in' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px',
              padding: '0.75rem',
              fontSize: '0.8rem',
              color: showCashMovementModal === 'in' ? '#34d399' : '#f87171',
              marginBottom: '1rem'
            }}>
              {showCashMovementModal === 'in'
                ? '💡 Usa esta opción para agregar dinero de tu bolsa para feria/cambio. Se sumará al total esperado en caja.'
                : '💡 Usa esta opción al sacar dinero del cajón para jabón, bolsas, insumos, etc. Se restará del total para no generar faltante.'
              }
            </div>

            <form onSubmit={handleSaveCashMovement} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Monto en Efectivo ($ MXN)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.5"
                  required
                  autoFocus
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="0.00"
                  className="pos-input"
                  style={{
                    width: '100%', padding: '0.65rem 0.85rem',
                    fontSize: '1.15rem', fontWeight: 800,
                    borderColor: showCashMovementModal === 'in' ? '#34d399' : '#ef4444'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Concepto / Motivo
                </label>
                <input
                  type="text"
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder={showCashMovementModal === 'in' ? "Ej. Cambio de $200 en billetes chicos y monedas" : "Ej. Compra de jabón y bolsas para entrega"}
                  className="pos-input"
                  style={{ width: '100%', padding: '0.65rem 0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCashMovementModal(null)}
                  className="pos-btn-secondary"
                  style={{ flex: 1, padding: '0.75rem' }}
                  disabled={isSavingMovement}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1, padding: '0.75rem',
                    backgroundColor: showCashMovementModal === 'in' ? '#10b981' : '#ef4444',
                    color: '#fff', border: 'none', borderRadius: '6px',
                    fontWeight: 800, cursor: 'pointer'
                  }}
                  disabled={isSavingMovement}
                >
                  {isSavingMovement ? 'Guardando...' : (showCashMovementModal === 'in' ? 'Registrar Feria' : 'Registrar Gasto')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. MODAL: CIERRE DE TURNO Y ARQUEO DE CAJA */}
      {showCloseShiftModal && activeShift && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid #334155',
            maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            padding: '1.75rem', color: '#fff', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🏁 Cierre de Turno y Arqueo
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Cajero: <strong>{activeShift.cashierName}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Desglose de cuentas en el turno */}
            <div style={{
              backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155',
              padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: '#cbd5e1' }}>
                <span>Fondo Inicial de Caja:</span>
                <strong>+${Number(activeShift.initialCash || 0).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: '#38bdf8' }}>
                <span>(+) Ventas Mostrador en Efectivo:</span>
                <strong>+${currentShiftCashSales.toFixed(2)}</strong>
              </div>
              {currentShiftTotalIn > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: '#10b981' }}>
                  <span>(+) Entradas de Feria de Bolsa:</span>
                  <strong>+${currentShiftTotalIn.toFixed(2)}</strong>
                </div>
              )}
              {currentShiftTotalOut > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', color: '#ef4444' }}>
                  <span>(-) Salidas / Gastos (jabón, bolsas, etc.):</span>
                  <strong>-${currentShiftTotalOut.toFixed(2)}</strong>
                </div>
              )}

              <div style={{ borderTop: '2px solid #334155', margin: '0.6rem 0', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>(=) Efectivo Esperado en el Cajón:</strong>
                <strong style={{ fontSize: '1.2rem', color: '#38bdf8' }}>
                  ${currentShiftExpectedCash.toFixed(2)} MXN
                </strong>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', borderTop: '1px dashed #334155', paddingTop: '0.4rem' }}>
                Otras ventas del turno: Tarjeta: ${currentShiftCardSales.toFixed(2)} | Transf: ${currentShiftTransferSales.toFixed(2)} | Total piezas: {currentShiftPiecesCount} pzs
              </div>
            </div>

            <form onSubmit={handleCloseShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#f8fafc', marginBottom: '0.35rem', fontWeight: 700 }}>
                  💵 Efectivo Físico Contado en el Cajón ($ MXN)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  autoFocus
                  value={closeShiftCountedCash}
                  onChange={(e) => setCloseShiftCountedCash(e.target.value)}
                  placeholder="Cuenta tus billetes y monedas y anótalo aquí..."
                  className="pos-input"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1.2rem', fontWeight: 800, borderColor: '#38bdf8' }}
                />
              </div>

              {/* Cálculo en vivo de la diferencia */}
              {closeShiftCountedCash !== '' && !isNaN(Number(closeShiftCountedCash)) && (() => {
                const diff = Number(closeShiftCountedCash) - currentShiftExpectedCash;
                const isExact = Math.abs(diff) < 0.01;
                const isSurplus = diff > 0.01;
                return (
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    backgroundColor: isExact ? 'rgba(52, 211, 153, 0.15)' : (isSurplus ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                    border: `1px solid ${isExact ? '#34d399' : (isSurplus ? '#38bdf8' : '#ef4444')}`,
                    color: isExact ? '#34d399' : (isSurplus ? '#38bdf8' : '#ef4444'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>
                      {isExact ? '✅ Caja Cuadrada Exacta' : (isSurplus ? '🔵 Sobrante en Caja:' : '🔴 Faltante en Caja:')}
                    </span>
                    <span style={{ fontSize: '1.1rem' }}>
                      {isExact ? '$0.00' : (isSurplus ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`)}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Notas Finales de Entrega de Turno
                </label>
                <textarea
                  value={closeShiftNotes}
                  onChange={(e) => setCloseShiftNotes(e.target.value)}
                  placeholder="Ej. Se dejan $500 de fondo para el turno de la tarde y el resto se guarda en el sobre..."
                  rows={2}
                  className="pos-input"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCloseShiftModal(false)}
                  className="pos-btn-secondary"
                  style={{ flex: 1, padding: '0.75rem' }}
                  disabled={isSavingShift}
                >
                  Regresar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1, padding: '0.75rem',
                    backgroundColor: '#38bdf8', color: '#0f172a',
                    border: 'none', borderRadius: '6px',
                    fontWeight: 800, cursor: 'pointer'
                  }}
                  disabled={isSavingShift}
                >
                  {isSavingShift ? 'Cerrando...' : 'Confirmar Corte y Cerrar Turno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL DE IMPRESIÓN DE TICKET DE CORTE DE CAJA (ARQUEO / CORTE Z) */}
      {lastClosedShiftReceipt && (
        <div className="pos-receipt-modal" onClick={() => setLastClosedShiftReceipt(null)}>
          <div className="pos-receipt-box" onClick={(e) => e.stopPropagation()}>
            {/* TICKET IMPRESO */}
            <div id="printable-shift-receipt" style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: '12px',
              lineHeight: '1.35',
              color: '#000',
              padding: '10px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              boxShadow: '0 0 10px rgba(0,0,0,0.1)'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 900, fontSize: '15px' }}>{ticketConfig.storeName || 'TIENDA ALINA'}</div>
                <div style={{ fontSize: '11px', color: '#333' }}>{ticketConfig.storeSubtitle || 'Jiménez American Style'}</div>
                <div style={{ fontSize: '10px', color: '#555' }}>{ticketConfig.storeAddress}</div>
                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
                <div style={{ fontWeight: 900, fontSize: '13px' }}>CORTE DE CAJA / CAMBIO DE TURNO</div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>FOLIO CORTE: {lastClosedShiftReceipt.id?.slice(-8).toUpperCase() || 'TURNO'}</div>
              </div>

              <div style={{ fontSize: '11px', marginBottom: '6px' }}>
                <div><strong>Cajero:</strong> {lastClosedShiftReceipt.cashierName}</div>
                <div><strong>Apertura:</strong> {lastClosedShiftReceipt.dateOpenedFormatted}</div>
                <div><strong>Cierre:</strong> {lastClosedShiftReceipt.dateClosedFormatted}</div>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              <div style={{ fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fondo Inicial:</span>
                  <span>${Number(lastClosedShiftReceipt.initialCash || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(+) Ventas Efectivo:</span>
                  <span>+${Number(lastClosedShiftReceipt.salesCash || 0).toFixed(2)}</span>
                </div>
                {Number(lastClosedShiftReceipt.totalIn || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>(+) Entradas de Feria:</span>
                    <span>+${Number(lastClosedShiftReceipt.totalIn).toFixed(2)}</span>
                  </div>
                )}
                {Number(lastClosedShiftReceipt.totalOut || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>(-) Gastos / Salidas:</span>
                    <span>-${Number(lastClosedShiftReceipt.totalOut).toFixed(2)}</span>
                  </div>
                )}

                <div style={{ borderBottom: '1px solid #000', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px' }}>
                  <span>(=) TOTAL ESPERADO:</span>
                  <span>${Number(lastClosedShiftReceipt.expectedCash || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px' }}>
                  <span>EFECTIVO CONTADO:</span>
                  <span>${Number(lastClosedShiftReceipt.actualCash || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px', marginTop: '2px' }}>
                  <span>DIFERENCIA:</span>
                  <span>
                    {Number(lastClosedShiftReceipt.difference || 0) === 0
                      ? 'EXACTO $0.00'
                      : (Number(lastClosedShiftReceipt.difference) > 0 ? `+SOBRANTE $${Number(lastClosedShiftReceipt.difference).toFixed(2)}` : `-FALTANTE $${Math.abs(Number(lastClosedShiftReceipt.difference)).toFixed(2)}`)}
                  </span>
                </div>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              <div style={{ fontSize: '10px' }}>
                <div><strong>OTRAS FORMAS DE PAGO:</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tarjeta:</span>
                  <span>${Number(lastClosedShiftReceipt.salesCard || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Transferencia:</span>
                  <span>${Number(lastClosedShiftReceipt.salesTransfer || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px dotted #888', paddingTop: '2px', marginTop: '2px' }}>
                  <span>TOTAL GENERAL VENDIDO:</span>
                  <span>${Number(lastClosedShiftReceipt.salesTotal || 0).toFixed(2)}</span>
                </div>
                <div>Prendas vendidas en turno: {lastClosedShiftReceipt.salesCount || 0} transacciones</div>
              </div>

              {/* Desglose de movimientos si hubo */}
              {Array.isArray(lastClosedShiftReceipt.movements) && lastClosedShiftReceipt.movements.length > 0 && (
                <>
                  <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
                  <div style={{ fontSize: '10px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '2px' }}>DETALLE DE MOVIMIENTOS:</div>
                    {lastClosedShiftReceipt.movements.map((m, mi) => (
                      <div key={mi} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '1px' }}>
                        <span>{m.type === 'in' ? '[+]' : '[-]'} {m.reason?.slice(0, 22)}</span>
                        <span>${Number(m.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {lastClosedShiftReceipt.closedNotes && (
                <div style={{ fontSize: '10px', marginTop: '6px', fontStyle: 'italic' }}>
                  Nota: {lastClosedShiftReceipt.closedNotes}
                </div>
              )}

              <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '10px' }}>
                <div style={{ borderTop: '1px solid #000', width: '80%', margin: '0 auto 4px auto' }} />
                <div>Firma Cajero Saliente</div>
                <div style={{ marginTop: '20px', borderTop: '1px solid #000', width: '80%', margin: '20px auto 4px auto' }} />
                <div>Firma Receptor / Dueño</div>
              </div>
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setLastClosedShiftReceipt(null)}
                  style={{
                    flex: 1, padding: '0.65rem', backgroundColor: '#e2e8f0',
                    color: '#0f172a', border: 'none', borderRadius: '6px',
                    fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    flex: 1, padding: '0.65rem', backgroundColor: '#10b981',
                    color: '#0f172a', border: 'none', borderRadius: '6px',
                    fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                  }}
                >
                  <Printer size={16} /> Imprimir Ticket de Corte
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setLastClosedShiftReceipt(null);
                  await executeLogout();
                }}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem'
                }}
              >
                <LogOut size={15} /> Salir y Cambiar de Usuario Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: CONFIRMACIÓN DE CAMBIO DE USUARIO CON TURNO ABIERTO */}
      {showLogoutConfirmModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid #334155',
            maxWidth: '460px', width: '100%', padding: '1.75rem', color: '#fff',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fbbf24', marginBottom: '1rem' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
                ¿Cerrar sesión y cambiar de usuario?
              </h3>
            </div>

            <div style={{
              backgroundColor: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: '8px',
              padding: '0.85rem',
              fontSize: '0.85rem',
              color: '#cbd5e1',
              marginBottom: '1.25rem',
              lineHeight: 1.45
            }}>
              Tienes un <strong>turno de caja abierto</strong> a tu nombre con un total esperado de <strong style={{ color: '#38bdf8' }}>${currentShiftExpectedCash.toFixed(2)} MXN</strong> en efectivo.
              <br /><br />
              Se recomienda hacer el <strong>Corte de Turno</strong> para que la persona que entre a suplirte (o el dueño) inicie con cuentas claras y sin revolver el dinero.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirmModal(false);
                  setCloseShiftCountedCash('');
                  setCloseShiftNotes('');
                  setShowCloseShiftModal(true);
                }}
                style={{
                  backgroundColor: '#38bdf8', color: '#0f172a',
                  border: 'none', borderRadius: '8px', padding: '0.75rem',
                  fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                }}
              >
                🏁 Hacer Corte de Caja Primero (Recomendado)
              </button>

              <button
                type="button"
                onClick={executeLogout}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '0.65rem',
                  fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                }}
              >
                🚪 Salir y Cambiar de Usuario Sin Corte
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutConfirmModal(false)}
                className="pos-btn-secondary"
                style={{ padding: '0.65rem', marginTop: '0.25rem' }}
              >
                Cancelar (Quedarme aquí)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL / NOTA: CORTE DE CAJA PENDIENTE DEL USUARIO ANTERIOR */}
      {showPendingForeignCutModal && isForeignShiftOpen && activeShift && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem', backdropFilter: 'blur(6px)'
        }}>
          <div style={{
            background: '#1e293b',
            border: '2px solid #ef4444',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.45)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
            <h2 style={{ color: '#f87171', margin: '0 0 0.5rem 0', fontSize: '1.35rem', fontWeight: 800 }}>
              AVISO: CORTE DE CAJA PENDIENTE
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              El cajero anterior <strong style={{ color: '#38bdf8' }}>{activeShift.cashierName || activeShift.openedByEmail}</strong> dejó el turno abierto sin realizar corte de caja.
            </p>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px dashed #ef4444', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem', textAlign: 'left', fontSize: '0.88rem' }}>
              <p style={{ margin: '0 0 0.35rem 0', color: '#fca5a5' }}>
                • <strong>Fondo inicial:</strong> ${Number(activeShift.initialCash || 0).toFixed(2)}
              </p>
              <p style={{ margin: '0 0 0.35rem 0', color: '#fca5a5' }}>
                • <strong>Ventas registradas:</strong> ${currentShiftCashSales.toFixed(2)}
              </p>
              <p style={{ margin: 0, color: '#fca5a5' }}>
                • <strong>Efectivo esperado en caja:</strong> ${currentShiftExpectedCash.toFixed(2)}
              </p>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '1.5rem', lineHeight: 1.4 }}>
              Para evitar revolver el dinero entre turnos, realiza el corte de entrega antes de que comiences a vender con tu cuenta (<strong style={{ color: '#f8fafc' }}>{currentUser?.email}</strong>).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowPendingForeignCutModal(false);
                  setCloseShiftCountedCash(currentShiftExpectedCash.toString());
                  setCloseShiftNotes(`Turno cerrado por cambio de usuario (${currentUser?.displayName || currentUser?.email})`);
                  setShowCloseShiftModal(true);
                }}
                style={{
                  background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.85rem 1.5rem',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                🏁 Realizar Corte de Entrega de {activeShift.cashierName}
              </button>
              <button
                type="button"
                onClick={() => setShowPendingForeignCutModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Continuar a la Pantalla de Turnos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA ELEGIR MÉTODO DE COBRO AL ENTREGAR PEDIDO WEB (MANDADITOS VS TRANSFERENCIA) */}
      {showDeliverPaymentModal && deliveringOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>📦</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#38bdf8' }}>
                    Confirmar Entrega de Pedido
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                  ¿Cómo se realizó el cobro de esta venta web?
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeliverPaymentModal(false);
                  setDeliveringOrder(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Ficha Resumen del Pedido */}
            <div style={{
              background: '#0f172a',
              borderRadius: '10px',
              padding: '1rem',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>
                  FOLIO: {deliveringOrder.folio || (deliveringOrder.id ? deliveringOrder.id.slice(0, 10).toUpperCase() : 'WEB')}
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>
                  ${Number(deliveringOrder.total || 0).toFixed(2)} MXN
                </span>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>
                👤 {deliveringOrder.clientName || 'Cliente Web'}
                {deliveringOrder.clientPhone && (
                  <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                    ({deliveringOrder.clientPhone})
                  </span>
                )}
              </div>
              {deliveringOrder.address && (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  📍 {deliveringOrder.address}
                </div>
              )}
              {deliveringOrder.items && deliveringOrder.items.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', borderTop: '1px dashed #334155', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                  👗 {deliveringOrder.items.map(it => `${it.name || 'Prenda'} (${it.size || 'U'})`).join(', ')}
                </div>
              )}
            </div>

            {/* Opciones de Cobro */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Opción 1: MANDADITOS (EFECTIVO - SUMA A CAJA) */}
              <button
                type="button"
                onClick={() => handleConfirmDeliveryPayment('mandaditos')}
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.3) 100%)',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  fontSize: '2rem',
                  background: 'rgba(16, 185, 129, 0.25)',
                  width: '52px',
                  height: '52px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  🛵
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#34d399', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>Por Mandaditos (Efectivo)</span>
                    <span style={{ background: '#10b981', color: '#0f172a', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      + ENTRA A CAJA
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                    El repartidor cobró al entregar y trajo el dinero en efectivo a la tienda. <strong>Suma ${Number(deliveringOrder.total || 0).toFixed(2)} MXN al arqueo del turno actual.</strong>
                  </div>
                </div>
              </button>

              {/* Opción 2: TRANSFERENCIA BANCARIA (NO SUMA A CAJA) */}
              <button
                type="button"
                onClick={() => handleConfirmDeliveryPayment('transferencia')}
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.25) 100%)',
                  border: '1px solid #3b82f6',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  fontSize: '2rem',
                  background: 'rgba(59, 130, 246, 0.2)',
                  width: '52px',
                  height: '52px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  💳
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#60a5fa', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>Por Transferencia Bancaria</span>
                    <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      BANCO (SIN CAJA)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                    El cliente transfirió directo a la cuenta de banco. <strong>NO entra a la caja física</strong> ni afecta el arqueo de efectivo del cajero.
                  </div>
                </div>
              </button>
            </div>

            {/* Info de estado de caja */}
            <div style={{
              background: activeShift ? 'rgba(16, 185, 129, 0.08)' : 'rgba(234, 179, 8, 0.08)',
              border: `1px solid ${activeShift ? 'rgba(16, 185, 129, 0.25)' : 'rgba(234, 179, 8, 0.25)'}`,
              borderRadius: '8px',
              padding: '0.6rem 0.8rem',
              fontSize: '0.78rem',
              color: activeShift ? '#86efac' : '#fde047',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>{activeShift ? '🟢' : '⚠️'}</span>
              <span>
                {activeShift 
                  ? `Turno activo a nombre de: ${activeShift.cashierName || activeShift.openedByEmail}. Si eliges Mandaditos, se sumará a este corte.`
                  : 'Caja cerrada: No hay turno activo en este momento. Si cobras en efectivo, abre turno para que compute en tu corte.'}
              </span>
            </div>

            {/* Botón cancelar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #334155', paddingTop: '0.85rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeliverPaymentModal(false);
                  setDeliveringOrder(null);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
