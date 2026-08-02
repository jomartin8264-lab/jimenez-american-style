import React, { useState, useEffect } from 'react';
import { ShoppingBag, User, Menu, LogOut, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import './Navbar.css';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const { cartItems } = useCart();
  const [isAdmin, setIsAdmin] = useState(false);
  
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.email === 'jomartin8264@gmail.com') {
        setIsAdmin(true);
      } else {
        const checkAdminStatus = async () => {
          try {
            const docSnap = await getDoc(doc(db, "config", "admins"));
            if (docSnap.exists() && docSnap.data().emails) {
              setIsAdmin(docSnap.data().emails.includes(currentUser.email));
            }
          } catch (e) {
            console.warn("Error verifying admin status:", e);
          }
        };
        checkAdminStatus();
      }
    } else {
      setIsAdmin(false);
    }
  }, [currentUser]);

  return (
    <nav className="navbar glass">
      <div className="container nav-container">
        <div className="nav-left">
          <Menu className="icon mobile-only" size={24} />
          <Link to="/" className="logo" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', lineHeight: '1.1' }}>
            <span style={{ fontFamily: 'Outfit', fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-text)' }}>Jiménez</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', letterSpacing: '2px' }}>AMERICAN STYLE</span>
          </Link>
        </div>
        
        <div className="nav-links desktop-only">
          <Link to="/" className="nav-link">INICIO</Link>
          <Link to="/catalog" className="nav-link">CATÁLOGO</Link>
          <Link to="/nosotros" className="nav-link">NOSOTROS</Link>
          {isAdmin && (
            <Link to="/admin" className="nav-link text-accent" style={{ fontWeight: 'bold', color: 'var(--color-secondary)' }}>
              ADMIN
            </Link>
          )}
        </div>

        <div className="nav-right">
          {isAdmin && (
            <Link to="/admin" className="icon-btn mobile-only" title="Administración">
              <Settings size={24} />
            </Link>
          )}
          {currentUser ? (
            <button onClick={logout} className="icon-btn" style={{background: 'none', border: 'none', cursor: 'pointer'}} title="Cerrar Sesión">
              <LogOut size={24} />
            </button>
          ) : (
            <Link to="/login" className="icon-btn" title="Iniciar Sesión">
              <User size={24} />
            </Link>
          )}
          <Link to="/cart" className="icon-btn cart-btn">
            <ShoppingBag size={24} />
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
