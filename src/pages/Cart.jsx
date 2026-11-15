import React, { useState, useEffect } from 'react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import { Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, increment, writeBatch, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import useSEO from '../hooks/useSEO';

const Cart = () => {
  const { cartItems, cartTotal, removeFromCart, updateQuantity, clearCart } = useCart();

  useSEO({
    title: 'Tu Carrito de Compra - Jiménez American Style',
    description: 'Revisa y finaliza tu pedido de prendas exclusivas y recíbelo directamente a tu domicilio con envíos rápidos.'
  });
  const { currentUser, userData } = useAuth();
  const [checkoutData, setCheckoutData] = useState({
    name: '', phone: '', address: '', notes: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Cargar credenciales de Telegram dinámicamente desde Firestore o usar valores por defecto
  const [apiSettings, setApiSettings] = useState({
    telegramToken: '8521379806:AAEWEBEGbKFp7_lRozQKzLGRC1TjUuRRbqU',
    telegramChatId: '8420282387'
  });

  useEffect(() => {
    const fetchApiSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "config", "apiSettings"));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setApiSettings({
            telegramToken: data.telegramToken || '8521379806:AAEWEBEGbKFp7_lRozQKzLGRC1TjUuRRbqU',
            telegramChatId: data.telegramChatId || '8420282387'
          });
        }
      } catch (err) {
        console.error("Error loading Telegram API settings from Firestore:", err);
      }
    };
    fetchApiSettings();
  }, []);

  useEffect(() => {
    if (userData) {
      setCheckoutData({
        name: userData.name || '',
        phone: userData.phone || '',
        address: userData.address || '',
        notes: userData.notes || ''
      });
    }
  }, [userData]);

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Por favor inicia sesión para realizar tu pedido.");
      return;
    }
    if (!checkoutData.name || !checkoutData.phone || !checkoutData.address) {
      alert("Por favor llena los datos de envío (Nombre, Teléfono y Dirección).");
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // 1. VERIFICACIÓN DE INVENTARIO FINAL
      const stockUpdates = [];
      for (const item of cartItems) {
        const pRef = doc(db, "products", item.id);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists() || pSnap.data().stock < item.quantity) {
          alert(`¡Lo sentimos! La prenda "${item.name}" se agotó o el stock disminuyó mientras comprabas. Por favor ajusta tu carrito.`);
          setIsProcessing(false);
          return;
        }
        stockUpdates.push({ ref: pRef, qty: item.quantity });
      }

      // 2. DECREMENTAR STOCK EN FIRESTORE EN UN LOTE (BATCH)
      const batch = writeBatch(db);
      stockUpdates.forEach(update => {
        batch.update(update.ref, { stock: increment(-update.qty) });
      });
      await batch.commit();

      // 2.5 Guardar orden en Firestore con su folio oficial
      const webFolio = `WEB-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
      const cleanItems = cartItems.map(item => {
        const cleanPrice = Number(item.price) || 0;
        const cleanQuantity = Math.max(1, parseInt(item.quantity, 10) || 1);
        return {
          id: item.id,
          name: item.name,
          price: cleanPrice,
          quantity: cleanQuantity,
          code: item.code || item.sku || '',
          sku: item.sku || item.code || '',
          image: item.image || ''
        };
      });
      const verifiedTotal = cleanItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);

      try {
        await addDoc(collection(db, "orders"), {
          folio: webFolio,
          clientName: checkoutData.name,
          clientEmail: currentUser.email,
          clientPhone: checkoutData.phone,
          clientAddress: checkoutData.address,
          clientNotes: checkoutData.notes || '',
          items: cleanItems,
          total: verifiedTotal,
          status: 'pendiente',
          type: 'web',
          createdAt: serverTimestamp(),
          createdAtMillis: Date.now()
        });
      } catch (orderDbErr) {
        console.warn("Aviso: 'orders' en Firestore requiere actualizar reglas de seguridad:", orderDbErr);
      }

      // 3. Notificación a Telegram (en bloque aislado para que no bloquee el pedido si falla)
      try {
        if (apiSettings.telegramChatId && apiSettings.telegramChatId !== 'TU_CHAT_ID_AQUI') {
          let message = `🛒 *NUEVO PEDIDO - Jiménez American Style*\n\n`;
          message += `🔖 *Folio:* \`${webFolio}\`\n`;
          message += `👤 *Cliente:* ${checkoutData.name} (${currentUser.email})\n`;
          message += `📞 *Teléfono:* ${checkoutData.phone}\n`;
          message += `🏠 *Dirección:* ${checkoutData.address}\n`;
          if (checkoutData.notes) message += `📝 *Observaciones:* ${checkoutData.notes}\n`;
          
          message += `\n*Artículos:*\n`;
          cartItems.forEach(item => {
            message += `\n📦 *${item.name}* (x${item.quantity}) - $${(item.price * item.quantity).toFixed(2)}\n`;
            if (item.code) message += `   ▪️ SKU: ${item.code}\n`;
          });
          message += `\n💰 *TOTAL A COBRAR: $${cartTotal.toFixed(2)}*\n\n`;
          message += `Por favor contacta al cliente para procesar el pago o entrega.`;

          await fetch(`https://api.telegram.org/bot${apiSettings.telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: apiSettings.telegramChatId,
              text: message,
              parse_mode: 'Markdown'
            })
          });
        }
      } catch (tgErr) {
        console.warn("Aviso de Telegram no enviado:", tgErr);
      }

      alert("¡Tu pedido ha sido enviado con éxito! En breve te contactaremos.");
      clearCart();
    } catch (error) {
      console.error("Error en checkout:", error);
      alert("Hubo un error procesando el pedido: " + (error.message || error));
    }
    
    setIsProcessing(false);
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '100px', minHeight: '80vh', paddingBottom: '3rem' }}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: '2rem', marginBottom: '2rem' }}>Tu Carrito</h2>
        
        {cartItems.length === 0 ? (
          <p>Tu carrito está vacío. ¡Ve a buscar el mejor estilo!</p>
        ) : (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 60%' }}>
              {cartItems.map(item => (
                <div key={item.id} className="glass" style={{ display: 'flex', alignItems: 'center', padding: '1rem', marginBottom: '1rem', borderRadius: '8px', gap: '1rem' }}>
                  <img src={item.image} alt={item.name} style={{ width: '80px', height: '100px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ flex: '1' }}>
                    <h4 style={{ fontSize: '1.2rem', margin: '0' }}>{item.name}</h4>
                    <p style={{ color: 'var(--color-text-light)', margin: '0' }}>CÓD: {item.code}</p>
                    <p style={{ fontWeight: 'bold', margin: '0.5rem 0 0 0' }}>${item.price.toFixed(2)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    {/* Selector de cantidad con botones +/- que nunca queda vacío */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: 'var(--color-bg)'
                    }}>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = Math.max(1, parseInt(item.quantity, 10) || 1);
                          if (cur > 1) updateQuantity(item.id, cur - 1);
                        }}
                        style={{
                          width: '32px',
                          height: '36px',
                          border: 'none',
                          background: 'none',
                          color: 'var(--color-text)',
                          fontSize: '1.2rem',
                          cursor: (Number(item.quantity) || 1) <= 1 ? 'not-allowed' : 'pointer',
                          opacity: (Number(item.quantity) || 1) <= 1 ? 0.4 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold'
                        }}
                        aria-label="Disminuir cantidad"
                      >
                        -
                      </button>

                      <input 
                        type="number" 
                        min="1" 
                        max={item.stock || 10}
                        value={item.quantity || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            // Si el usuario borra en el teclado, actualizamos el estado como vacío temporalmente
                            // pero en context o blur se fuerza mínimo 1
                            updateQuantity(item.id, '');
                          } else {
                            const parsed = parseInt(val, 10);
                            if (!isNaN(parsed)) {
                              updateQuantity(item.id, parsed);
                            }
                          }
                        }}
                        onBlur={(e) => {
                          // Si se sale del campo dejándolo en blanco o menor a 1, reponer 1 automáticamente
                          if (!e.target.value || parseInt(e.target.value, 10) < 1 || isNaN(parseInt(e.target.value, 10))) {
                            updateQuantity(item.id, 1);
                          }
                        }}
                        style={{ 
                          width: '44px', 
                          height: '36px',
                          textAlign: 'center',
                          padding: '0', 
                          border: 'none', 
                          borderLeft: '1px solid var(--color-border)',
                          borderRight: '1px solid var(--color-border)',
                          backgroundColor: 'transparent', 
                          color: 'var(--color-text)',
                          fontWeight: 'bold',
                          fontSize: '0.95rem'
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const cur = Math.max(1, parseInt(item.quantity, 10) || 1);
                          updateQuantity(item.id, cur + 1);
                        }}
                        style={{
                          width: '32px',
                          height: '36px',
                          border: 'none',
                          background: 'none',
                          color: 'var(--color-text)',
                          fontSize: '1.2rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold'
                        }}
                        aria-label="Aumentar cantidad"
                      >
                        +
                      </button>
                    </div>

                    <button 
                      onClick={() => removeFromCart(item.id)} 
                      style={{ background: 'none', border: 'none', color: '#ff3b3b', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center' }} 
                      aria-label="Eliminar del carrito"
                      title="Eliminar artículo"
                    >
                      <Trash2 size={22} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ flex: '1 1 30%' }}>
              <div className="glass" style={{ padding: '2rem', borderRadius: '8px' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Resumen de Compra</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span>Subtotal</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', fontWeight: 'bold', fontSize: '1.2rem' }}>
                  <span>Total</span>
                  <span className="text-accent">${cartTotal.toFixed(2)}</span>
                </div>
                <form onSubmit={handleCheckout}>
                  <h4 style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', color: 'var(--color-primary)' }}>Datos para la entrega del pedido</h4>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Nombre Completo</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Juan Pérez" 
                      required 
                      style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} 
                      value={checkoutData.name} 
                      onChange={e => setCheckoutData({...checkoutData, name: e.target.value})} 
                    />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Teléfono (WhatsApp)</label>
                    <input 
                      type="tel" 
                      placeholder="Ej: 331 123 4567" 
                      required 
                      style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} 
                      value={checkoutData.phone} 
                      onChange={e => setCheckoutData({...checkoutData, phone: e.target.value})} 
                    />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Dirección de Entrega</label>
                    <input 
                      type="text" 
                      placeholder="Calle, Número y Colonia" 
                      required 
                      style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} 
                      value={checkoutData.address} 
                      onChange={e => setCheckoutData({...checkoutData, address: e.target.value})} 
                    />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Observaciones (Opcional)</label>
                    <input 
                      type="text" 
                      placeholder="Referencias o preferencia de horario" 
                      style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} 
                      value={checkoutData.notes} 
                      onChange={e => setCheckoutData({...checkoutData, notes: e.target.value})} 
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="btn btn-primary w-100" 
                    style={{ fontSize: '1.1rem', padding: '1rem' }}
                  >
                    {isProcessing ? 'Procesando...' : 'Finalizar Pedido'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Cart;
