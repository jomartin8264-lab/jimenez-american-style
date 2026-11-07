import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import { 
  collection, onSnapshot, doc, getDoc, setDoc, writeBatch, 
  increment, addDoc, serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { 
  ShoppingCart, Search, Plus, Minus, Trash2, Printer, 
  CheckCircle, Clock, Phone, MessageSquare, DollarSign, 
  CreditCard, RefreshCw, Barcode, Volume2, VolumeX, 
  ArrowLeft, Store, AlertCircle, Calendar, Users, ShieldCheck, UserPlus, Trash
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

  // Pedidos Web en Tiempo Real
  const [webOrders, setWebOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('todos'); // 'todos', 'pendiente', 'en_camino', 'entregado'
  const knownOrderIds = useRef(new Set());
  const initialLoadDone = useRef(false);

  // Modal de código de barras
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState(null);

  // Gestión de Permisos para Celular / Administradores
  const [adminEmails, setAdminEmails] = useState(['jomartin8264@gmail.com']);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Reloj en tiempo real
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Verificación de Administrador
  useEffect(() => {
    const checkAdmin = async () => {
      if (!currentUser) {
        navigate('/login');
        return;
      }
      try {
        const snap = await getDoc(doc(db, "config", "admins"));
        let emails = ['jomartin8264@gmail.com'];
        if (snap.exists() && snap.data().emails) {
          emails = snap.data().emails;
        }
        setAdminEmails(emails);
        if (emails.includes(currentUser.email)) {
          setIsAdmin(true);
        } else {
          alert("Acceso no autorizado al Punto de Venta.");
          navigate('/');
        }
      } catch (err) {
        console.error("Error verificando admin:", err);
      } finally {
        setLoadingAuth(false);
      }
    };
    checkAdmin();
  }, [currentUser, navigate]);

  // Manejo de permisos para registrar productos desde celular
  const handleAddAdminEmail = async (e) => {
    e.preventDefault();
    const emailToAdd = newAdminEmail.trim().toLowerCase();
    if (!emailToAdd || !emailToAdd.includes('@')) {
      alert("Por favor ingresa un correo electrónico válido.");
      return;
    }
    if (adminEmails.includes(emailToAdd)) {
      alert("Este correo ya tiene permisos de administrador.");
      return;
    }
    try {
      const updated = [...adminEmails, emailToAdd];
      await setDoc(doc(db, "config", "admins"), { emails: updated });
      setAdminEmails(updated);
      setNewAdminEmail('');
      alert(`¡Permiso concedido! Ahora ${emailToAdd} puede iniciar sesión desde su celular para registrar prendas.`);
    } catch (err) {
      console.error(err);
      alert("Error al guardar permiso: " + (err.message || err));
    }
  };

  const handleRemoveAdminEmail = async (emailToRemove) => {
    if (emailToRemove === 'jomartin8264@gmail.com') {
      alert("No se puede eliminar el correo del propietario principal.");
      return;
    }
    if (!window.confirm(`¿Revocar acceso al correo ${emailToRemove}? Ya no podrá entrar a registrar prendas.`)) {
      return;
    }
    try {
      const updated = adminEmails.filter(e => e !== emailToRemove);
      await setDoc(doc(db, "config", "admins"), { emails: updated });
      setAdminEmails(updated);
      alert(`Permiso revocado para ${emailToRemove}`);
    } catch (err) {
      console.error(err);
      alert("Error al revocar permiso: " + (err.message || err));
    }
  };

  // 2. Suscripción en Tiempo Real a Productos / Inventario
  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  // 3. Suscripción en Tiempo Real a Pedidos (Web + POS)
  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin, soundEnabled]);

  // Manejo de búsqueda y pistola de código de barras
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      e.preventDefault();
      const code = searchQuery.trim().toLowerCase();
      // Buscar coincidencia exacta por código SKU
      const found = products.find(p => p.code && p.code.toLowerCase() === code);
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
      // 1. Descontar inventario en lote (Batch)
      const batch = writeBatch(db);
      for (const item of ticketItems) {
        const ref = doc(db, "products", item.id);
        batch.update(ref, { stock: increment(-item.quantity) });
      }
      await batch.commit();

      // 2. Guardar venta en la colección 'orders' con tipo 'pos'
      const saleData = {
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
          category: item.category || ''
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

      if (soundEnabled) soundAlert.playBeep();

      // Mostrar ticket para imprimir
      setLastReceipt({
        id: docRef.id,
        ...saleData,
        dateFormatted: new Date().toLocaleString()
      });

      // Limpiar ticket
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
      p.category?.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // Pedidos Web filtrados
  const filteredWebOrders = webOrders.filter(o => {
    if (o.type !== 'web') return false;
    if (orderFilter === 'todos') return true;
    return o.status === orderFilter;
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
          <button 
            className={`pos-tab-btn ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            <Users size={18} /> Permisos Celular
          </button>
        </div>

        {/* CONTROLES DERECHA */}
        <div className="pos-actions-top">
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
            Panel Admin
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
                        onError={(e) => { e.target.src = '/images/brand_logo_1774572391476.png'; }}
                      />
                    </div>
                    <div className="pos-card-body">
                      <div className="pos-card-title" title={p.name}>{p.name}</div>
                      <div className="pos-card-meta">
                        <span>{p.category || 'Ropa'}</span>
                        {p.code && <span>SKU: {p.code}</span>}
                      </div>
                      <div className="pos-card-footer">
                        <span className="pos-card-price">${Number(p.price).toFixed(2)}</span>
                        <span className={`pos-stock-badge ${badgeClass}`}>
                          {isOutOfStock ? 'Agotado' : `${p.stock} disp.`}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBarcodeProduct(p);
                        }}
                        style={{
                          marginTop: '0.5rem',
                          background: 'transparent',
                          border: '1px dashed #475569',
                          color: '#94a3b8',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          padding: '0.2rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}
                        title="Ver e imprimir código de barras"
                      >
                        <Barcode size={12} /> Código de barras
                      </button>
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
              {ticketItems.length > 0 && (
                <button 
                  onClick={() => setTicketItems([])} 
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                >
                  <Trash2 size={14} /> Vaciar
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
                      <div className="pos-row-name">{item.name}</div>
                      <div className="pos-row-sub">${item.price.toFixed(2)} c/u</div>
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

            {/* Filtros de estado */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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

          <h3 style={{ marginBottom: '1rem' }}>Movimientos de Hoy</h3>
          <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Hora</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Cliente</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Método</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {todaySales.map(sale => {
                  const time = sale.createdAt?.seconds 
                    ? new Date(sale.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    : (sale.createdAtMillis ? new Date(sale.createdAtMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--');

                  return (
                    <tr key={sale.id} style={{ borderBottom: '1px solid #334155' }}>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: GESTIÓN DE PERMISOS PARA CELULAR */}
      {activeTab === 'team' && (
        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.6rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldCheck size={28} /> Control de Accesos y Permisos
              </h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Aquí defines qué correos electrónicos tienen permiso para entrar a la sección de <strong>registro de prendas desde su celular</strong> con cámara y código de barras automático.
                Los clientes comunes en la página web <strong>nunca podrán ver ni acceder</strong> a estas herramientas.
              </p>
            </div>

            {/* Formulario para agregar nuevo usuario */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={20} color="#38bdf8" /> Autorizar Nuevo Correo de Acceso
              </h3>
              <form onSubmit={handleAddAdminEmail} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input 
                  type="email" 
                  required
                  placeholder="ejemplo: empleado@gmail.com" 
                  value={newAdminEmail} 
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  style={{
                    flex: '1 1 300px',
                    padding: '0.75rem 1rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '1rem',
                    outline: 'none'
                  }}
                />
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <UserPlus size={18} /> Dar Permiso de Acceso
                </button>
              </form>
            </div>

            {/* Lista de usuarios con acceso */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>
                Cuentas Autorizadas ({adminEmails.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {adminEmails.map(email => {
                  const isMaster = email === 'jomartin8264@gmail.com';
                  return (
                    <div 
                      key={email}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '1rem',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ShieldCheck size={20} color={isMaster ? '#fbbf24' : '#38bdf8'} />
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>{email}</span>
                          {isMaster && (
                            <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', background: 'rgba(251,191,36,0.2)', color: '#fbbf24', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                              👑 Dueño Principal
                            </span>
                          )}
                        </div>
                      </div>

                      {!isMaster ? (
                        <button
                          onClick={() => handleRemoveAdminEmail(email)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: '#ef4444',
                            borderRadius: '6px',
                            padding: '0.4rem 0.8rem',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <Trash size={14} /> Revocar Permiso
                        </button>
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
        <div className="pos-receipt-modal">
          <div className="pos-receipt-box">
            <div id="printable-ticket" className="pos-receipt-paper">
              <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>JIMÉNEZ AMERICAN STYLE</div>
                <div style={{ fontSize: '0.75rem', color: '#555' }}>Tienda de Ropa • Venta en Mostrador</div>
                <div style={{ fontSize: '0.75rem', color: '#555' }}>Fecha: {lastReceipt.dateFormatted}</div>
                <div style={{ fontSize: '0.75rem', color: '#555' }}>Folio: #{lastReceipt.id.slice(-6).toUpperCase()}</div>
              </div>
              <div style={{ borderBottom: '1px dashed #aaa', margin: '0.5rem 0' }} />
              <div>
                {(lastReceipt.items || []).map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span>{it.quantity}x {it.name}</span>
                    <span>${(it.price * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderBottom: '1px dashed #aaa', margin: '0.5rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem' }}>
                <span>TOTAL:</span>
                <span>${lastReceipt.total.toFixed(2)} MXN</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#555', marginTop: '0.25rem' }}>
                Método: {lastReceipt.paymentMethod?.toUpperCase()}
              </div>
              {lastReceipt.paymentMethod === 'efectivo' && (
                <div style={{ fontSize: '0.8rem', color: '#555' }}>
                  Recibido: ${lastReceipt.cashGiven?.toFixed(2)} | Cambio: ${lastReceipt.change?.toFixed(2)}
                </div>
              )}
              <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem' }}>
                ¡Gracias por tu compra! ✨
              </div>
            </div>

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
                Listo
              </button>
            </div>
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
