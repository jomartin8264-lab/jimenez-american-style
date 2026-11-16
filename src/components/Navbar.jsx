import React, { useState, useEffect } from 'react';
import { ShoppingBag, User, Menu, LogOut, Settings, PackagePlus, Store, ShieldCheck, UserCheck } from 'lucide-react';
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
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState('');
  
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    if (!currentUser) {
      setIsAdmin(false);
      setIsStaff(false);
      setStaffName('');
      return;
    }

    const currentEmail = currentUser.email?.toLowerCase().trim();
    const isMaster = currentEmail === 'jomartin8264@gmail.com';

    const checkPermissions = async () => {
      try {
        let userIsAdmin = isMaster;
        let userIsStaff = isMaster;
        let resolvedName = currentUser.displayName || currentEmail.split('@')[0];

        // 1. Revisar lista de administradores
        const docSnap = await getDoc(doc(db, "config", "admins"));
        if (docSnap.exists() && docSnap.data().emails) {
          const emails = docSnap.data().emails.map(e => (typeof e === 'string' ? e.toLowerCase().trim() : ''));
          if (emails.includes(currentEmail)) {
            userIsAdmin = true;
            userIsStaff = true;
          }
        }

        // 2. Revisar lista de personal (staff: empleados y administradores)
        const staffSnap = await getDoc(doc(db, "config", "staff"));
        if (staffSnap.exists() && staffSnap.data().users) {
          const found = staffSnap.data().users.find(u => (u.email || '').toLowerCase().trim() === currentEmail);
          if (found) {
            userIsStaff = true;
            if (found.role === 'admin') userIsAdmin = true;
            if (found.name) resolvedName = found.name;
          }
        }

        setIsAdmin(userIsAdmin);
        setIsStaff(userIsStaff);
        setStaffName(resolvedName);
      } catch (e) {
        console.warn("Aviso al verificar permisos en Navbar:", e);
        if (isMaster) {
          setIsAdmin(true);
          setIsStaff(true);
        }
      }
    };

    checkPermissions();
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
        
        {/* Enlaces de la Tienda Web */}
        <div className="nav-links desktop-only">
          <Link to="/" className="nav-link">INICIO</Link>
          <Link to="/catalog" className="nav-link">CATÁLOGO</Link>
          <Link to="/nosotros" className="nav-link">NOSOTROS</Link>
          
          {/* Si es Personal de la tienda (Empleado o Administrador), mostrar acceso a registrar prendas */}
          {(isAdmin || isStaff) && (
            <Link 
              to="/admin" 
              className="nav-link" 
              style={{ 
                fontWeight: 'bold', 
                color: '#38bdf8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              title="Alta y edición de prendas con fotos y código"
            >
              ⚡ REGISTRAR PRENDAS
            </Link>
          )}

          {/* El Punto de Venta en la web/celular solo es accesible para Administradores */}
          {isAdmin && (
            <Link 
              to="/pos" 
              className="nav-link" 
              style={{ 
                fontWeight: 'bold', 
                color: '#10b981',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              title="Punto de venta y mostrador"
            >
              🏪 PUNTO DE VENTA
            </Link>
          )}
        </div>

        <div className="nav-right">
          {/* En celular: Registro de prendas para empleados/admins, y POS solo para Administradores */}
          {(isAdmin || isStaff) && (
            <Link to="/admin" className="icon-btn mobile-only" title="Registrar Prendas">
              <PackagePlus size={22} color="#38bdf8" />
            </Link>
          )}
          {isAdmin && (
            <Link to="/pos" className="icon-btn mobile-only" title="Punto de Venta Mostrador (Solo Administradores)">
              <Store size={22} color="#10b981" />
            </Link>
          )}

          {/* Badge de Rol si es miembro del equipo */}
          {(isAdmin || isStaff) && (
            <span 
              className="desktop-only"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.6rem',
                borderRadius: '12px',
                backgroundColor: isAdmin ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                color: isAdmin ? '#eab308' : '#38bdf8',
                border: `1px solid ${isAdmin ? 'rgba(234, 179, 8, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
                marginRight: '0.25rem'
              }}
              title={currentUser?.email}
            >
              {isAdmin ? '👑 Admin' : `👔 ${staffName || 'Empleado'}`}
            </span>
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
