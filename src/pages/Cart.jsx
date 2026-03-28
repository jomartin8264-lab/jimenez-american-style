import React, { useState, useEffect } from 'react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import { Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, increment, writeBatch } from 'firebase/firestore';

const TELEGRAM_TOKEN = '8521379806:AAEWEBEGbKFp7_lRozQKzLGRC1TjUuRRbqU';
// ID automático obtenido desde la API
const CHAT_ID = '8420282387'; 

const Cart = () => {
  const { cartItems, cartTotal, removeFromCart, updateQuantity, clearCart } = useCart();
  const { currentUser, userData } = useAuth();
  const [checkoutData, setCheckoutData] = useState({
    name: '', phone: '', address: '', notes: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

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
      // 1. FINAL ACCURACY CHECK (Is there still enough stock for ALL items?)
      // We use a batch or individual checks. Given the scale, check each item.
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

      // 2. ACTUALLY DECREMENT STOCK IN FIRESTORE
      const batch = writeBatch(db);
      stockUpdates.forEach(update => {
        batch.update(update.ref, { stock: increment(-update.qty) });
      });
      await batch.commit();

      // 3. Create receipt message
      let message = `🛒 *NUEVO PEDIDO - Jiménez American Style*\n\n`;
      message += `👤 *Cliente:* ${checkoutData.name} (${currentUser.email})\n`;
      message += `📞 *Teléfono:* ${checkoutData.phone}\n`;
      message += `🏠 *Dirección:* ${checkoutData.address}\n`;
      if (checkoutData.notes) message += `📝 *Observaciones:* ${checkoutData.notes}\n`;
      
      message += `\n*Artículos:*\n`;
      cartItems.forEach(item => {
        message += `- ${item.name} (x${item.quantity}) - $${(item.price * item.quantity).toFixed(2)}\n`;
      });
      message += `\n💰 *TOTAL A COBRAR: $${cartTotal.toFixed(2)}*\n\n`;
      message += `Por favor contacta al cliente para procesar el pago o entrega.`;

      // 4. Send Telegram
      if (CHAT_ID === 'TU_CHAT_ID_AQUI') {
        alert("Pedido procesado (Simulación). El administrador aún no configura su CHAT_ID de Telegram.");
      } else {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          })
        });
        alert("¡Tu pedido ha sido enviado con éxito! Nos pondremos en contacto pronto.");
      }
      clearCart();
    } catch (error) {
      console.error(error);
      alert("Hubo un error procesando el pedido. Por favor inténtalo de nuevo.");
    }
    
    setIsProcessing(false);
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: '100px', minHeight: '80vh' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input 
                      type="number" 
                      min="1" 
                      max={item.stock || 10}
                      value={item.quantity} 
                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value))}
                      style={{ width: '50px', padding: '0.5rem' }}
                    />
                    <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: '#ff3b3b', cursor: 'pointer' }}>
                      <Trash2 size={24} />
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
                    <input type="text" placeholder="Ej: Juan Pérez" required style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'white' }} value={checkoutData.name} onChange={e => setCheckoutData({...checkoutData, name: e.target.value})} />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Teléfono (WhatsApp)</label>
                    <input type="tel" placeholder="Ej: 331 123 4567" required style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'white' }} value={checkoutData.phone} onChange={e => setCheckoutData({...checkoutData, phone: e.target.value})} />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Dirección de Entrega</label>
                    <input type="text" placeholder="Calle, Número y Colonia" required style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'white' }} value={checkoutData.address} onChange={e => setCheckoutData({...checkoutData, address: e.target.value})} />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>Observaciones (Opcional)</label>
                    <input type="text" placeholder="Referencias o preferencia de horario" style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'white' }} value={checkoutData.notes} onChange={e => setCheckoutData({...checkoutData, notes: e.target.value})} />
                  </div>

                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="btn btn-primary w-100" 
                    style={{ fontSize: '1.1rem', padding: '1rem' }}
                  >
                    {isProcessing ? 'Procesando...' : 'Finalizar Pedido por Telegram'}
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
