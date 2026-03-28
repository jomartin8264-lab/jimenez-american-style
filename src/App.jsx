import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Cart from './pages/Cart';
import Admin from './pages/Admin';
import Catalog from './pages/Catalog';
import About from './pages/About';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import WhatsAppButton from './components/WhatsAppButton';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <div className="app">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/nosotros" element={<About />} />
              <Route path="/login" element={<Login />} />
            </Routes>
          </div>
        </BrowserRouter>
        <WhatsAppButton />
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
