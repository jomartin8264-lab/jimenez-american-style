import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem('jimenez_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.error("Error parsing cart from localStorage:", err);
      return [];
    }
  });
  const [cartTotal, setCartTotal] = useState(0);

  // Escuchar en vivo los productos de la base de datos!
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
      const liveItems = [];
      snapshot.forEach(doc => liveItems.push({ id: doc.id, ...doc.data() }));
      setProducts(liveItems);
    });
    return unsubscribe;
  }, []);

  // Recalculate total whenever cart changes and save to local
  useEffect(() => {
    const total = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    setCartTotal(total);
    localStorage.setItem('jimenez_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (product) => {
    const dbProduct = products.find(p => p.id === product.id);
    if (!dbProduct || dbProduct.stock <= 0) {
      alert("¡Lo sentimos! Este artículo se acaba de agotar.");
      return;
    }

    setCartItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        // Check if we are trying to add more than available in DB
        if (existing.quantity >= dbProduct.stock) {
          alert("Ya tienes todas las piezas disponibles en tu carrito.");
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCartItems(prev => prev.filter(item => item.id !== productId));
  };
  
  const updateQuantity = (productId, newQty) => {
    const existing = cartItems.find(item => item.id === productId);
    if (!existing) return;

    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const dbProduct = products.find(p => p.id === productId);
    if (newQty > (dbProduct?.stock || 0)) {
       alert("No hay suficiente inventario disponible.");
       return;
    }

    setCartItems(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQty } : item));
  };

  const clearCart = () => {
    setCartItems([]);
    // In a real app we leave the stock decremented since they bought it. For testing, clearing cart on failure might require returning stock.
    // For checkout success we keep it decremented.
  };

  const value = {
    products, // Exported to be consumed by Home/Catalog
    cartItems,
    cartTotal,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
